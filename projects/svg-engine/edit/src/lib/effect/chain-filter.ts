import { computed, inject, Injectable } from '@angular/core';
import { EditorStateService, type SvgNode, walk } from '@mosaicoo/svg-engine/core';
import type { Effect } from './effect';
import { EffectRegistry } from './effect-registry.service';

/**
 * Effect chain support — D-047 (2026-05-23).
 *
 * **Why a separate file**: composition is non-trivial (parsing primitives,
 * renaming `result`/`in`/`in2` to avoid collisions, threading the output
 * of step N into step N+1) and we don't want that logic crowding
 * `EffectRegistry`'s simple add/remove/lookup contract.
 *
 * **Storage strategy**: the chain lives in `style.filter` itself as a
 * URL pointing to a stable, deterministic chain ID. That id encodes the
 * effect ids participating in the chain:
 *
 *     url(#svge-chain-svge.builtin.effect.blur__svge.builtin.effect.drop-shadow)
 *
 * This means:
 * - Zero new state to undo/redo (the chain IS the filter URL — the
 *   existing `SetStylePropertyOnManyCommand` round-trips it for free)
 * - IO export/import works automatically (chain is just a string)
 * - The renderer's defs injection can derive ALL active chains by
 *   walking the document and collecting unique chain IDs (no out-of-
 *   sync registry to maintain)
 *
 * **Composition algorithm**:
 *
 * Each effect's `buildFilterMarkup()` returns primitives that internally
 * reference `SourceGraphic`/`SourceAlpha` (the node's pre-filter output)
 * and may declare named `result="X"` outputs referenced via `in="X"`.
 *
 * To compose effect[0] → effect[1] → effect[2]:
 *
 * 1. Strip each effect's `<filter>` wrapper to get its primitives.
 * 2. Prefix every `result="X"` and every internal `in="X"` reference
 *    with `step{i}-` so collisions across steps are impossible.
 * 3. For step > 0, rewrite `in="SourceGraphic"` → `in="step{i-1}-out"`
 *    and `in="SourceAlpha"` → `in="step{i-1}-out-alpha"` so each step
 *    consumes the previous step's output instead of the original
 *    SourceGraphic.
 * 4. Append two captures at the end of each step:
 *    - `<feOffset dx="0" dy="0" result="step{i}-out" />` to capture the
 *      RGBA output (feOffset with no `in` defaults to the previous
 *      primitive's output, so this acts as a no-op pass-through).
 *    - `<feColorMatrix in="step{i}-out" result="step{i}-out-alpha"
 *      type="matrix" values="0 0 0 0 0 ... 0 0 0 1 0" />` to extract
 *      alpha-only for downstream `SourceAlpha` consumers.
 *
 * The composed `<filter>` element widens the filter region (-50% /
 * 200%) to accommodate effects with halos (shadows, glows, blur).
 */

/** Stable prefix for composed chain filter IDs. */
export const CHAIN_FILTER_ID_PREFIX = 'svge-chain-';

/** Separator between effect IDs inside a chain ID. */
export const CHAIN_FILTER_SEPARATOR = '__';

/**
 * Build a chain filter ID from a list of effect IDs. The ID is
 * deterministic (same inputs → same output) so two nodes with the
 * same chain share a single composed `<filter>` in defs.
 */
export function makeChainFilterId(effectIds: readonly string[]): string {
  return CHAIN_FILTER_ID_PREFIX + effectIds.join(CHAIN_FILTER_SEPARATOR);
}

/**
 * Parse a chain filter ID into its component effect IDs. Returns
 * `null` if the input is not a chain ID (doesn't start with the
 * prefix). An empty chain (just the prefix) returns `[]`.
 */
export function parseChainFilterId(id: string): readonly string[] | null {
  if (!id.startsWith(CHAIN_FILTER_ID_PREFIX)) return null;
  const body = id.slice(CHAIN_FILTER_ID_PREFIX.length);
  return body === '' ? [] : body.split(CHAIN_FILTER_SEPARATOR);
}

/**
 * Extract the chain ID embedded in a `style.filter` value like
 * `url(#svge-chain-...)`, or `null` if the filter doesn't reference a
 * chain. Tolerant of whitespace and quoting variations.
 */
export function extractChainFilterId(styleFilter: string | undefined): string | null {
  if (styleFilter === undefined) return null;
  const m = /^url\(#(.+?)\)$/.exec(styleFilter.trim());
  if (m === null) return null;
  const id = m[1]!;
  return id.startsWith(CHAIN_FILTER_ID_PREFIX) ? id : null;
}

/**
 * Compose N effects into a single SVG `<filter>` element with sequential
 * primitive chaining (see file-level docs for the algorithm). Returns a
 * complete `<filter id="${chainId}">...</filter>` markup string ready
 * to inject into `<defs>`.
 *
 * Edge cases:
 * - Empty list → empty `<filter>` (renders as no-op identity).
 * - Single effect → simple wrap (the chain ID just becomes an alias
 *   for the effect's filter); the primitives are still prefixed so the
 *   chain markup is fully self-contained.
 */
export function composeChainFilter(effects: readonly Effect[], chainId: string): string {
  return composeFilterMarkups(
    effects.map((e) => stripFilterWrapper(e.buildFilterMarkup())),
    chainId,
  );
}

/**
 * Compose already-stripped filter-primitive fragments into one self-
 * contained `<filter id="${id}">`, threading each step's output into the
 * next (see file-level docs for the algorithm). Shared by
 * {@link composeChainFilter} (param-less effect chains) and the
 * parametric instance registry (`effect-instance.ts`, D-118), which
 * passes `buildFilterMarkup(params)` output per step.
 *
 * Empty list → empty `<filter>` (renders as a no-op identity).
 */
export function composeFilterMarkups(inners: readonly string[], id: string): string {
  if (inners.length === 0) {
    return `<filter id="${id}"></filter>`;
  }
  const steps: string[] = [];
  for (let i = 0; i < inners.length; i++) {
    const previousOut = i === 0 ? null : `step${i - 1}-out`;
    const previousAlpha = i === 0 ? null : `step${i - 1}-out-alpha`;
    steps.push(renameStep(inners[i]!, i, previousOut, previousAlpha));
  }
  return (
    `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">\n` +
    `${steps.join('\n')}\n` +
    `</filter>`
  );
}

/**
 * Strip the outer `<filter ...>...</filter>` wrapper from an effect's
 * markup, returning only the primitives inside. Tolerant of attribute
 * variations (id, x, y, etc.) and whitespace. Returns the input
 * unchanged when no wrapper is found (defensive — callers may pass
 * already-stripped fragments).
 */
export function stripFilterWrapper(markup: string): string {
  const m = /<filter\b[^>]*>([\s\S]*)<\/filter>/.exec(markup);
  return m === null ? markup : m[1]!.trim();
}

/**
 * Rename `result="X"` and matching `in`/`in2` references inside one
 * step's primitives so they are uniquely namespaced; rewrite
 * SourceGraphic/SourceAlpha to point at the previous step's outputs
 * when not the first step; append two output captures (RGBA + alpha-
 * only) at the end of the step.
 */
function renameStep(
  inner: string,
  stepIdx: number,
  previousOut: string | null,
  previousAlpha: string | null,
): string {
  const prefix = `step${stepIdx}-`;
  let out = inner;

  // 1. Collect all `result="X"` names so we know which `in`/`in2` refs
  //    point at internal results (and must be prefixed accordingly).
  const resultNames = new Set<string>();
  const resultRegex = /result="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = resultRegex.exec(inner)) !== null) {
    resultNames.add(m[1]!);
  }

  // 2. Prefix every result="X" → result="step{i}-X" so other steps'
  //    primitives can't accidentally consume them.
  out = out.replace(/result="([^"]+)"/g, (_, name: string) => `result="${prefix}${name}"`);

  // 3. Prefix every in/in2 that references one of our internal result
  //    names. We do this BEFORE rewriting SourceGraphic/SourceAlpha so
  //    we don't double-rewrite.
  for (const name of resultNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(
      new RegExp(`(in2?)="${escaped}"`, 'g'),
      (_, attr: string) => `${attr}="${prefix}${name}"`,
    );
  }

  // 4. Rewrite SourceGraphic/SourceAlpha for steps after the first.
  //    The first step keeps these literals so it reads the original
  //    pre-filter output as usual.
  if (previousOut !== null) {
    out = out.replace(/(in2?)="SourceGraphic"/g, `$1="${previousOut}"`);
  }
  if (previousAlpha !== null) {
    out = out.replace(/(in2?)="SourceAlpha"/g, `$1="${previousAlpha}"`);
  }

  // 5. Append output captures so the next step (if any) can consume:
  //    - `step{i}-out`        — RGBA pass-through of this step's last
  //      primitive output (feOffset without `in` defaults to it).
  //    - `step{i}-out-alpha`  — alpha channel only, in case the next
  //      step uses SourceAlpha.
  out +=
    `\n      <feOffset dx="0" dy="0" result="${prefix}out" />` +
    `\n      <feColorMatrix in="${prefix}out" type="matrix" ` +
    `values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" ` +
    `result="${prefix}out-alpha" />`;

  return out;
}

/**
 * Reactive service that derives composed chain filter markup by
 * scanning the current document's nodes and collecting unique chain
 * IDs referenced via `style.filter`.
 *
 * **Why scan the document instead of holding state**: the chain is
 * encoded in the filter URL itself (see {@link makeChainFilterId}),
 * which means undo/redo, IO round-trip, and multi-editor scope all
 * work for free. The renderer's defs injection just calls
 * {@link buildAllChainsMarkup} alongside `EffectRegistry.buildAllFiltersMarkup()`.
 *
 * **Lifecycle**: scoped per editor (D-042) like the other registries
 * that depend on the editor state. Add to `editor-scope.providers.ts`
 * via `{ provide: ChainFilterRegistry }` so a route-scoped editor gets
 * its own instance reading its own `EditorStateService`.
 */
@Injectable({ providedIn: 'root' })
export class ChainFilterRegistry {
  private readonly state = inject(EditorStateService);
  private readonly effects = inject(EffectRegistry);

  /**
   * Set of unique chain IDs in use by the current document.
   * Re-derives reactively when the document or registered effects
   * change. Entries with effect IDs that are NOT registered in
   * `EffectRegistry` are filtered out (defensive — they would
   * generate empty filters that look like a bug).
   */
  readonly activeChains = computed<readonly string[]>(() => {
    const seen = new Set<string>();
    walk(this.state.document().root, (node: SvgNode) => {
      const id = extractChainFilterId(node.style.filter);
      if (id === null) return;
      // Validate that all participating effects are registered before
      // accepting the chain. Skip silently otherwise — the broken
      // reference will fall back to "no filter" rather than produce
      // a misleading empty <filter> in defs.
      const effectIds = parseChainFilterId(id);
      if (effectIds === null) return;
      if (effectIds.every((eid) => this.effects.get(eid) !== null)) {
        seen.add(id);
      }
    });
    return [...seen];
  });

  /**
   * Composed `<filter>` markup for every chain referenced by the
   * current document. Empty string when there are no chains in use.
   * Caller (renderer / shell `resolvedDefs`) typically concatenates
   * this with {@link EffectRegistry.buildAllFiltersMarkup}.
   */
  buildAllChainsMarkup(): string {
    const chains = this.activeChains();
    if (chains.length === 0) return '';
    const parts: string[] = [];
    for (const id of chains) {
      const effectIds = parseChainFilterId(id);
      if (effectIds === null) continue;
      const effects = effectIds
        .map((eid) => this.effects.get(eid))
        .filter((e): e is Effect => e !== null);
      if (effects.length !== effectIds.length) continue;
      parts.push(composeChainFilter(effects, id));
    }
    return parts.join('\n');
  }
}
