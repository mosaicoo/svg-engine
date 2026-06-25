import { effect, type Injector, runInInjectionContext } from '@angular/core';
import type { Disposable } from '@mosaicoo/svg-engine/core';
import {
  type MenuContribution,
  type MenuContributionContext,
  MenuContributionRegistry,
} from '@mosaicoo/svg-engine/edit';
import { ACTION_DICTIONARY, resolveActionCanonical } from './dictionaries/actions';
import { normalize, tokenizeWithoutStopwords } from './parsers/tokenize';
import { STOPWORDS } from './dictionaries/stopwords';
import type { NaturalLanguageService } from './natural-language.service';
import type { NluIntent } from './types';

/**
 * **`discoverMenuIntents`** — D-046 Fase 1.
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
 * **Skip de dividers + items sem label + roadmap**: `divider: true`,
 * label vazio, ou `comingSoon: true` (D-085) não produzem intent — não
 * são ações executáveis (o `run()` de um item roadmap é no-op).
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
 * EXISTEM no momento da chamada. Para auto-discovery contínuo
 * (plugins instalados depois também viram intents),
 * use {@link discoverMenuIntentsReactive} — wrapper baseado em
 * `effect()` que reflete mudanças do registry em tempo real
 * (Audit #12).
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
  // **D-085** — skip roadmap ("coming soon") items. Their `run()` is a
  // no-op placeholder; promoting them to voice intents would let a user
  // say "outline stroke" and have nothing happen (worse: a confident
  // "done" with no effect). They re-enter discovery automatically once
  // the flag is removed and a real handler is wired.
  if (contrib.comingSoon === true) return null;
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

/**
 * **`discoverMenuIntentsReactive`** — Audit #12. Reactive companion to
 * {@link discoverMenuIntents}.
 *
 * Performs an **immediate synchronous discovery** of all current menu
 * contributions (so callers reading `service.intents()` right after
 * this returns see the auto-discovered intents — same observable
 * behavior as the one-shot helper at install time), AND registers an
 * Angular `effect()` that re-runs discovery whenever
 * `registry.contributions()` emits — covering plugins installed AFTER
 * the NLU plugin and contributions disposed at any later time.
 *
 * **Strategy on each change**: tear down the previous batch via its
 * `composedDispose`, then rebuild a fresh batch from the new registry
 * snapshot. Coarse-grained but correct: no diff/merge bookkeeping
 * means no chance of half-state on race conditions, at the cost of
 * O(N) work per registry mutation (N is small for menu items, usually
 * ≤ 50). Custom intents the consumer registered out-of-band stay
 * untouched because `discoverMenuIntents` skips ids already present.
 *
 * **Why an effect, not a manual subscription**: Angular signals don't
 * expose a `subscribe()` — `effect()` IS the official subscription
 * mechanism. It also gets disposed cleanly via `effectRef.destroy()`,
 * letting the returned `Disposable` cover both the effect AND the
 * current batch of intents.
 *
 * **Injection context requirement**: `effect()` may only be created
 * inside an injection context. We accept an explicit `Injector` and
 * use `runInInjectionContext` so the function works from anywhere —
 * including plugin `install(ctx)` blocks that aren't injection
 * contexts themselves.
 *
 * **Echo skipping via reference identity**: Angular schedules the
 * effect's first run for a later microtask, NOT immediately at
 * creation. That first run might happen BEFORE or AFTER unrelated
 * signal mutations. Using a "skip first" flag is unreliable. Instead
 * we capture the exact array reference that the initial sync
 * discovery consumed and short-circuit any firing where the signal
 * still returns that same reference — guaranteed safe because
 * `MenuContributionRegistry.register` and the returned dispose both
 * produce a NEW array (immutable update), so identity comparison
 * cleanly distinguishes "no real change" from "actual mutation".
 */
export interface DiscoverMenuIntentsReactiveResult {
  /**
   * Composite disposable — stops the effect AND tears down the
   * currently-tracked batch of intents. Idempotent: calling
   * `dispose()` twice is a silent no-op.
   */
  readonly disposable: Disposable;
}

export function discoverMenuIntentsReactive(
  registry: MenuContributionRegistry,
  service: NaturalLanguageService,
  injector: Injector,
): DiscoverMenuIntentsReactiveResult {
  // 1) Capture the registry array reference our initial sync
  //    discovery is going to consume, then run the discovery. Reading
  //    the signal here outside of the effect is fine — we only need
  //    its identity for echo detection.
  let currentBatchSource: readonly MenuContribution[] = registry.contributions();
  let currentBatch: DiscoverMenuIntentsResult | null = discoverMenuIntents(registry, service);
  let disposed = false;

  // 2) Effect watches the signal; rebuild only when the array
  //    reference actually differs from the snapshot the current
  //    batch was built against.
  const effectRef = runInInjectionContext(injector, () =>
    effect(() => {
      const current = registry.contributions();
      if (disposed) return;
      if (current === currentBatchSource) return; // echo / no real mutation
      if (currentBatch !== null) {
        currentBatch.composedDispose.dispose();
      }
      currentBatch = discoverMenuIntents(registry, service);
      currentBatchSource = current;
    }),
  );

  return {
    disposable: {
      dispose() {
        if (disposed) return; // idempotent
        disposed = true;
        try {
          effectRef.destroy();
        } catch {
          /* defensive: tolerate already-destroyed effect */
        }
        if (currentBatch !== null) {
          try {
            currentBatch.composedDispose.dispose();
          } catch {
            /* defensive */
          }
          currentBatch = null;
        }
      },
    },
  };
}
