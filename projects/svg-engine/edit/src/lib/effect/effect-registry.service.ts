import { Injectable, signal } from '@angular/core';
import { type GroupNode, type SvgNode, walk } from 'svg-engine/core';
import type { Disposable } from '../plugin/plugin';
import type { Effect } from './effect';

/**
 * Registry of {@link Effect}s — categoria 7 do D-023 (visual effects /
 * SVG filters). Mirrors `PaletteRegistry` / `ToolRegistry` in shape:
 * signal-backed, returns `Disposable` from `register()`.
 *
 * **Reactive `effects` signal**: `<svge-effects-panel>` and the
 * renderer's defs injector subscribe so newly-installed effects
 * appear in the picker AND their filter markup gets emitted into the
 * SVG `<defs>` without manual rewiring.
 *
 * **Insertion order preserved**: pickers show effects in registration
 * order. Plugins influence prominence via provider order in
 * `app.config.ts`.
 *
 * **Duplicate id → throw**: configuration mistake; the developer
 * should rename, not silently overwrite.
 *
 * Typical plugin usage:
 *
 * ```ts
 * install(ctx) {
 *   const reg = ctx.injector.get(EffectRegistry);
 *   ctx.track(reg.register({
 *     id: 'com.acme.effect.glow',
 *     name: 'Glow',
 *     category: 'shadow',
 *     buildFilterMarkup: () => `
 *       <filter id="com.acme.effect.glow">
 *         <feGaussianBlur stdDeviation="3" />
 *       </filter>
 *     `,
 *   }));
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class EffectRegistry {
  private readonly _effects = signal<readonly Effect[]>([]);

  /** Reactive snapshot of all registered effects (insertion order). */
  readonly effects = this._effects.asReadonly();

  /**
   * Register an effect. Returns a `Disposable` to remove it later
   * (typically tracked by the plugin via `ctx.track()` for automatic
   * cleanup on plugin uninstall).
   *
   * Throws if `effect.id` is empty or already registered.
   */
  register(effect: Effect): Disposable {
    if (typeof effect.id !== 'string' || effect.id.length === 0) {
      throw new Error('EffectRegistry.register: effect.id must be a non-empty string');
    }
    if (this._effects().some((e) => e.id === effect.id)) {
      throw new Error(`EffectRegistry.register: effect "${effect.id}" is already registered`);
    }
    this._effects.set([...this._effects(), effect]);
    return {
      dispose: () => {
        this._effects.set(this._effects().filter((e) => e.id !== effect.id));
      },
    };
  }

  /** Look up an effect by id, or `null` if not registered. */
  get(id: string): Effect | null {
    return this._effects().find((e) => e.id === id) ?? null;
  }

  /**
   * Filter effects by category. Useful for picker UIs that group by
   * intent (`'blur'`, `'shadow'`, `'color'`). Pass `undefined` to get
   * effects without an explicit category.
   */
  byCategory(category: string | undefined): readonly Effect[] {
    return this._effects().filter((e) => e.category === category);
  }

  /**
   * Concatenate the `buildFilterMarkup()` output of every registered
   * effect, ready to inject into the SVG `<defs>` block. Used by the
   * renderer's auto-injection effect (Fase 6d) so any registered
   * filter is reachable via `url(#id)` from a node's `style.filter`.
   *
   * Returns an empty string when the registry is empty (caller can
   * skip injection entirely).
   */
  buildAllFiltersMarkup(): string {
    const all = this._effects();
    if (all.length === 0) return '';
    return all.map((e) => e.buildFilterMarkup()).join('\n');
  }

  /**
   * Build filter markup for ONLY the effects actually referenced by some
   * node in `root` (via `style.filter` = `url(#effectId)`). The
   * export-friendly counterpart to {@link buildAllFiltersMarkup}: the
   * live renderer injects every registered filter so applying an effect
   * resolves instantly, but an **exported** file should carry only the
   * filters it uses — matching how gradients / patterns / clipPaths /
   * masks / symbols are already pruned to "active" in the export.
   *
   * Any `url(#id)` that doesn't match a registered effect id is ignored
   * (e.g. effect-chain ids, which emit their own self-contained
   * `<filter>` via `ChainFilterRegistry`).
   *
   * Returns an empty string when no registered effect is referenced.
   */
  buildUsedFiltersMarkup(root: GroupNode): string {
    const all = this._effects();
    if (all.length === 0) return '';
    const referenced = collectReferencedFilterIds(root);
    if (referenced.size === 0) return '';
    return all
      .filter((e) => referenced.has(e.id))
      .map((e) => e.buildFilterMarkup())
      .join('\n');
  }
}

/** Matches every `url(#id)` occurrence; captures the bare id. */
const URL_REF_RE = /url\(\s*#([^)\s]+)\s*\)/g;

/**
 * Collect the set of ids referenced by any node's `style.filter` in the
 * tree. A single `style.filter` may hold more than one `url(#id)`
 * (SVG allows a filter list), so we scan all matches.
 */
function collectReferencedFilterIds(root: GroupNode): ReadonlySet<string> {
  const ids = new Set<string>();
  walk(root, (node: SvgNode) => {
    const filter = node.style?.filter;
    if (typeof filter !== 'string' || filter.length === 0) return;
    for (const match of filter.matchAll(URL_REF_RE)) {
      ids.add(match[1]!);
    }
  });
  return ids;
}
