import type { Disposable } from 'svg-engine/core';
import {
  type MenuContribution,
  type MenuContributionContext,
  MenuContributionRegistry,
} from 'svg-engine/edit';
import { ACTION_DICTIONARY, resolveActionCanonical } from './dictionaries/actions';
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
 * Deriva keywords NLU a partir do label do menu item, **expandindo
 * multilíngue via `ACTION_DICTIONARY`**.
 *
 * **Regras**:
 * - Tokenize o label (lowercase + deacento + split)
 * - Remove stopwords + tokens de 1 caractere + ellipsis
 * - Para cada token, lookup canonical no `ACTION_DICTIONARY`. Se
 *   resolver, adiciona **TODAS** as palavras PT/EN que apontam pro
 *   mesmo canonical. Exemplo: label `"Delete"` → token `'delete'` →
 *   canonical `'delete'` → expande para
 *   `['delete', 'deletar', 'excluir', 'remover', 'apagar', ...]`.
 *
 * **Por quê isso é crítico**: sem expansão, "duplicar" (PT) nunca
 * casaria com o intent auto-discovered da menu item `"Duplicate"`
 * porque fuzzy match dist `duplicar → duplicate` é 3 (acima do
 * adaptive max-dist 2). Com a expansão, ambas as palavras aparecem
 * no array de keywords e a comparação fica exata em qualquer idioma.
 */
function deriveKeywords(label: string): readonly string[] {
  if (typeof label !== 'string' || label.length === 0) return [];
  const cleaned = label.replace(/\.{3}|…/g, '').trim();
  const baseTokens = tokenizeWithoutStopwords(cleaned, STOPWORDS).filter((t) => t.length > 1);
  const expanded = new Set<string>(baseTokens);
  for (const token of baseTokens) {
    const canonical = resolveActionCanonical(token);
    if (canonical === null) continue;
    // Para cada entry do dicionário que aponta pro mesmo canonical,
    // adiciona como keyword adicional. Isso cobre todas as variações
    // PT/EN sem o autor do plugin precisar listar manualmente.
    for (const [word, target] of Object.entries(ACTION_DICTIONARY)) {
      if (target === canonical) expanded.add(word);
    }
  }
  return [...expanded];
}

/**
 * **`deriveTokenGroups`** (D-046 review-7) — gera os
 * `requiredAllGroups` pro intent auto-descoberto.
 *
 * Cada base token do label vira um grupo. Cada grupo contém o token
 * literal + suas expansões via `ACTION_DICTIONARY` (variantes
 * PT/EN do mesmo canonical).
 *
 * **Crítico**: enquanto `deriveKeywords` faz UNION (qualquer matchando
 * conta), este faz **AND por grupo** — TODOS os grupos devem ter pelo
 * menos uma palavra matched. Isso evita "Select All" auto-discovered
 * matchar "selecione X" sozinho (sem o qualificador "tudo"/"all").
 *
 * **Retorna `null`** quando o label tem só 1 token significativo
 * (single-token labels NÃO precisam de gate AND — keywords sozinho
 * já é suficiente, e o AND complicaria sem benefício).
 */
function deriveTokenGroups(label: string): readonly (readonly string[])[] | null {
  if (typeof label !== 'string' || label.length === 0) return null;
  const cleaned = label.replace(/\.{3}|…/g, '').trim();
  const baseTokens = tokenizeWithoutStopwords(cleaned, STOPWORDS).filter((t) => t.length > 1);
  // Só ativa o gate AND pra labels multi-token (≥ 2). Labels single-token
  // como "Undo" não precisam — keyword match único é OK.
  if (baseTokens.length < 2) return null;

  const groups: string[][] = [];
  for (const token of baseTokens) {
    const group = new Set<string>([token]);
    const canonical = resolveActionCanonical(token);
    if (canonical !== null) {
      for (const [word, target] of Object.entries(ACTION_DICTIONARY)) {
        if (target === canonical) group.add(word);
      }
    }
    groups.push([...group]);
  }
  return groups;
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
  // **D-046 review-7**: gate AND pra multi-token labels — "Select All"
  // só matcha quando AMBOS verbo + qualificador presentes. Single-token
  // (e.g., "Undo") fica null → comportamento OR clássico via keywords.
  const requiredAllGroups = deriveTokenGroups(contrib.label);

  const intent: NluIntent = {
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
  return requiredAllGroups !== null ? { ...intent, requiredAllGroups } : intent;
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
