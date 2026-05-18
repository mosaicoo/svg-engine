import { Injectable, signal } from '@angular/core';
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
}
