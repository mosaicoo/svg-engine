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
