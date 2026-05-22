import type { Disposable } from 'svg-engine/core';
import {
  type MenuContribution,
  type MenuContributionContext,
  MenuContributionRegistry,
} from 'svg-engine/edit';
import { normalize, tokenizeWithoutStopwords } from './parsers/tokenize';
import { STOPWORDS } from './dictionaries/stopwords';
import type { NaturalLanguageService } from './natural-language.service';
import type { NluIntent } from './types';

/**
 * **`discoverMenuIntents`** — D-046? Fase 1.
 *
 * Auto-promove TODAS as contribuições do {@link MenuContributionRegistry}
 * em intents NLU. Cada menu item vira um intent cujo handler executa
 * o `run()` original com o `MenuContributionContext` derivado do
 * `NluContext.injector`.
 *
 * **Como derivamos keywords a partir do `label`**: tokenize o label
 * (lowercase + deacento), remove stopwords, mantém o resto. "Bring
 * to Front" → `['bring', 'front']`; "Selecionar tudo" →
 * `['selecionar', 'tudo']`. Plugins que queiram aliases adicionais
 * podem registrar intents customizados via
 * {@link NaturalLanguageService.registerIntent} sem conflito.
 *
 * **Skip de dividers + items sem label**: `divider: true` ou label
 * vazio não produz intent (não é ação executável).
 *
 * **Destrutivos**: items cujo label contém "delete"/"remove"/"clear"/
 * "deletar"/"excluir"/"remover"/"apagar" são marcados `destructive: true`
 * — a NLU exige `confirmGate` pra dispatch automático.
 *
 * **Multi-editor (D-042/D-043)**: o handler propaga `ctx.injector`
 * para o `MenuContributionContext` esperado pelo `run()` do menu
 * contribution. Cadeia de scope ativo preservada end-to-end.
 *
 * **Reactivity**: este helper é one-shot — registra os intents que
 * EXISTEM no momento da chamada. Se o consumer registrar mais
 * contribuições depois e quiser auto-discovery deles, deve chamar
 * `discoverMenuIntents` de novo (em geral basta chamar no
 * `install()` do plugin, depois de todos os plugins co-instalados
 * terem registrado seus contribuições — vide
 * {@link builtinNluPlugin}).
 *
 * **Retorno**: array de `Disposable` (um por intent registrado) +
 * count. O `composedDispose` permite cleanup em massa via
 * `ctx.track()`.
 */
export interface DiscoverMenuIntentsResult {
  /** Disposables dos intents criados — array vazio quando nada foi descoberto. */
  readonly disposables: readonly Disposable[];
  /** Quantos intents foram efetivamente criados. */
  readonly count: number;
  /** Disposable composto que dispara dispose() em todos. */
  readonly composedDispose: Disposable;
}

const DESTRUCTIVE_WORDS = new Set<string>([
  'delete',
  'deletar',
  'remove',
  'remover',
  'excluir',
  'apagar',
  'clear',
  'limpar',
  'reset',
  'resetar',
]);

/**
 * Deriva keywords NLU a partir do label do menu item.
 *
 * **Regras**:
 * - Tokenize (lowercase + deacento + split)
 * - Remove stopwords
 * - Remove tokens de 1 caractere (muito ruidoso pra fuzzy match)
 * - Remove os 3 pontos `...` / `…` (ellipsis comum em labels Material)
 */
function deriveKeywords(label: string): readonly string[] {
  if (typeof label !== 'string' || label.length === 0) return [];
  const cleaned = label.replace(/\.{3}|…/g, '').trim();
  const tokens = tokenizeWithoutStopwords(cleaned, STOPWORDS);
  return tokens.filter((t) => t.length > 1);
}

function isDestructiveLabel(label: string): boolean {
  const tokens = new Set(deriveKeywords(label));
  for (const w of DESTRUCTIVE_WORDS) {
    if (tokens.has(w)) return true;
  }
  return false;
}

/**
 * Builds an intent id from a menu contribution id — preserves the
 * original id for traceability, prefixed pra não colidir com intents
 * customizados.
 */
function buildIntentId(contribId: string): string {
  return `svge.nlu.menu.${contribId}`;
}

/**
 * Cria intent NLU a partir de uma `MenuContribution` específica.
 * Retorna `null` quando a contribution não é elegível (divider, label
 * vazio, ou tokens insuficientes pra match útil).
 */
export function menuContributionToIntent(contrib: MenuContribution): NluIntent | null {
  if (contrib.divider === true) return null;
  if (typeof contrib.label !== 'string' || contrib.label.trim().length === 0) return null;

  const keywords = deriveKeywords(contrib.label);
  if (keywords.length === 0) return null;

  const destructive = isDestructiveLabel(contrib.label);
  const description = normalize(contrib.label);

  return {
    id: buildIntentId(contrib.id),
    keywords,
    destructive,
    description,
    execute(_slots, ctx) {
      // O MenuContributionContext espelha o NluContext (mesmo
      // shape { injector }), então repassamos diretamente.
      const menuCtx: MenuContributionContext = { injector: ctx.injector };
      contrib.run(menuCtx);
    },
  };
}

/**
 * Walks o registry, cria intents pra cada contribution elegível, e
 * registra todos no service. Skip silencioso pra contribuições que
 * gerariam intent duplicado (caller pode já ter registrado um
 * customizado com o mesmo id) — não throws.
 */
export function discoverMenuIntents(
  registry: MenuContributionRegistry,
  service: NaturalLanguageService,
): DiscoverMenuIntentsResult {
  const disposables: Disposable[] = [];
  const existingIds = new Set(service.intents().map((i) => i.id));

  for (const contrib of registry.contributions()) {
    const intent = menuContributionToIntent(contrib);
    if (intent === null) continue;
    if (existingIds.has(intent.id)) continue; // já registrado (caller customizou)
    try {
      disposables.push(service.registerIntent(intent));
    } catch {
      // Defensivo: registerIntent throw em duplicate id — race possível
      // se chamado 2× no install(). Ignore silenciosamente.
    }
  }

  const composedDispose: Disposable = {
    dispose() {
      for (const d of disposables) {
        try {
          d.dispose();
        } catch {
          /* defensive */
        }
      }
    },
  };

  return {
    disposables,
    count: disposables.length,
    composedDispose,
  };
}
