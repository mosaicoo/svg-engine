import { signal } from '@angular/core';
import type { Disposable } from '../plugin/plugin';
import type { LibraryItem } from './library-item';

/**
 * Generic registry for library items — D-048. Mirrors the shape of
 * `EffectRegistry` / `PaletteRegistry` / `ToolRegistry`: signal-backed,
 * `register()` returns `Disposable` (so plugins can `ctx.track()` for
 * automatic uninstall cleanup), insertion order preserved, duplicate
 * ids throw.
 *
 * **Why not just one big registry holding `LibraryItem`s with a
 * `type` discriminator**: keeping the registries TYPED per library
 * type (`LibraryRegistry<ShapeLibraryItem>` etc.) means consumers
 * `inject(ShapeLibraryService)` get type-safe shapes back without
 * runtime narrowing. Composition over conflation.
 *
 * **Subclassing convention**: each concrete library extends this
 * abstract base with `@Injectable({ providedIn: 'root' })` on the
 * concrete subclass so DI works the usual way. The base stays
 * decorator-free so subclasses are the actual injection tokens.
 *
 * Example consumer registration via plugin:
 * ```ts
 * install(ctx) {
 *   const reg = ctx.injector.get(ShapeLibraryService);
 *   ctx.track(reg.register({
 *     id: 'com.acme.shape.logo',
 *     name: 'Acme Logo',
 *     category: 'brand',
 *     build: () => createPath('M0 0 L100 100', { style: {...} }),
 *   }));
 * }
 * ```
 */
export abstract class LibraryRegistry<T extends LibraryItem> {
  private readonly _items = signal<readonly T[]>([]);

  /** Reactive snapshot of all registered items (insertion order). */
  readonly items = this._items.asReadonly();

  /**
   * Register an item. Returns a `Disposable` to remove it later
   * (typically tracked by the plugin via `ctx.track()` for automatic
   * cleanup on plugin uninstall).
   *
   * Throws if `item.id` is empty or already registered.
   */
  register(item: T): Disposable {
    if (typeof item.id !== 'string' || item.id.length === 0) {
      throw new Error(`${this.constructor.name}.register: item.id must be a non-empty string`);
    }
    if (this._items().some((existing) => existing.id === item.id)) {
      throw new Error(`${this.constructor.name}.register: item "${item.id}" is already registered`);
    }
    this._items.set([...this._items(), item]);
    return {
      dispose: () => {
        this._items.set(this._items().filter((existing) => existing.id !== item.id));
      },
    };
  }

  /** Look up an item by id, or `null` if not registered. */
  get(id: string): T | null {
    return this._items().find((item) => item.id === id) ?? null;
  }

  /**
   * Replace an existing item in-place (preserves its position in the
   * insertion-order array). Returns `true` on success, `false` when no
   * item with that id exists. The new item must have the same `id` as
   * the existing one — mismatch throws.
   *
   * **Why a dedicated method** (vs. dispose + re-register): re-registration
   * moves the item to the end, which is wrong for library pickers where
   * authored order matters (e.g., the user expects "their" gradient to
   * stay where they put it on the list). `update()` preserves position
   * AND triggers the signal so UIs react.
   *
   * **D-058 use case** (Gradient inline editor): each edit (stop color,
   * offset, geometry change) dispatches `SetGradientCommand` which
   * calls this method with a fresh item. Builtin items can also be
   * edited — they're regular `GradientLibraryItem`s; the only effect
   * of editing a builtin is the user's session-local override of the
   * builtin's content (the builtin's source code is untouched, so a
   * reload restores the original).
   */
  update(id: string, replacement: T): boolean {
    if (replacement.id !== id) {
      throw new Error(
        `${this.constructor.name}.update: replacement.id "${replacement.id}" must match target id "${id}"`,
      );
    }
    const current = this._items();
    const idx = current.findIndex((item) => item.id === id);
    if (idx < 0) return false;
    const next = current.slice();
    next[idx] = replacement;
    this._items.set(next);
    return true;
  }

  /**
   * Filter items by category. Useful for picker UIs that group items
   * by intent. Pass `undefined` to get items without an explicit
   * category.
   */
  byCategory(category: string | undefined): readonly T[] {
    return this._items().filter((item) => item.category === category);
  }

  /**
   * All distinct categories present in the registry, in first-seen
   * order. UIs that render category sections call this to know which
   * groups to emit; items without a category are surfaced via
   * `byCategory(undefined)` but the literal `undefined` is omitted
   * from the returned list (UIs can special-case `'other'`).
   */
  categories(): readonly string[] {
    const seen = new Set<string>();
    for (const item of this._items()) {
      if (item.category !== undefined) seen.add(item.category);
    }
    return [...seen];
  }
}
