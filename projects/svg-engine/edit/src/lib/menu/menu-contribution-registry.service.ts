import { computed, Injectable, signal, type Signal } from '@angular/core';
import type { Disposable } from '../plugin/plugin';
import type { MenuContribution, MenuSlot } from './menu-contribution';

/**
 * Registry of {@link MenuContribution}s — categoria 9 parte 1 do D-023
 * (extensible toolbars / menus / context menus). UIs query by slot;
 * plugins contribute via `register()` and clean up via the returned
 * `Disposable`.
 *
 * Follows the same shape as `ToolRegistry` / `PaletteRegistry`:
 * signal-backed, throw on configuration errors, `Disposable` return.
 *
 * **Slot-based sorting**: `bySlot(slot)` returns visible contributions
 * sorted by `order` (default 100). Stable sort within the same order
 * preserves insertion order — gives plugins predictable layering when
 * they don't bother specifying `order`.
 *
 * **`visible` filtering**: contributions whose `visible` signal is
 * `false` are excluded from `bySlot()`. UIs that want the full list
 * (e.g., a preferences page) read `contributions()` directly.
 */
@Injectable({ providedIn: 'root' })
export class MenuContributionRegistry {
  private readonly _contributions = signal<readonly MenuContribution[]>([]);

  /** Reactive snapshot of every registered contribution (insertion order). */
  readonly contributions = this._contributions.asReadonly();

  /**
   * Register a menu contribution. Returns a `Disposable` to remove the
   * contribution later (typically tracked by the plugin via
   * `ctx.track()` for automatic cleanup on plugin uninstall).
   *
   * Throws on empty id, duplicate id, or empty slot.
   */
  register(contribution: MenuContribution): Disposable {
    if (typeof contribution.id !== 'string' || contribution.id.length === 0) {
      throw new Error('MenuContributionRegistry.register: contribution.id must be non-empty');
    }
    if (typeof contribution.slot !== 'string' || contribution.slot.length === 0) {
      throw new Error('MenuContributionRegistry.register: contribution.slot must be non-empty');
    }
    if (this._contributions().some((c) => c.id === contribution.id)) {
      throw new Error(
        `MenuContributionRegistry.register: contribution "${contribution.id}" is already registered`,
      );
    }
    this._contributions.set([...this._contributions(), contribution]);
    return {
      dispose: () => {
        this._contributions.set(this._contributions().filter((c) => c.id !== contribution.id));
      },
    };
  }

  /**
   * Visible contributions for `slot`, sorted by `order` (lower first).
   * Returns a `Signal` so UIs can `track` results and re-render only
   * when contributions OR their `visible` signals change.
   *
   * **Default order**: contributions without `order` are treated as
   * `order: 100`. Stable sort keeps insertion order within ties.
   *
   * **Filtering**: items with `visible === false` are excluded. Items
   * with `visible === null` or `undefined` are always included.
   */
  bySlot(slot: MenuSlot): Signal<readonly MenuContribution[]> {
    return computed(() => {
      const items = this._contributions().filter((c) => {
        if (c.slot !== slot) return false;
        // visible === null/undefined → always show
        return c.visible == null ? true : c.visible();
      });
      // Stable sort by `order` (default 100). Browser sort is stable
      // per spec (Array#sort, ES2019+).
      return [...items].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    });
  }

  /** Look up a contribution by id, or `null` if not registered. */
  get(id: string): MenuContribution | null {
    return this._contributions().find((c) => c.id === id) ?? null;
  }
}
