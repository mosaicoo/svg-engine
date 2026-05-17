import { Injectable, signal } from '@angular/core';
import type { Disposable } from '../plugin/plugin';
import type { Palette } from './palette';

/**
 * Registry of {@link Palette}s — categoria 8 do D-023 (color palettes).
 * Follows the same shape as `ToolRegistry`: signal-backed, returns
 * `Disposable` from `register()` so plugins clean up automatically on
 * uninstall.
 *
 * **Reactive `palettes` signal**: `<svge-color-palette>` and the
 * inspector subscribe so newly-installed palettes appear without
 * extra wiring.
 *
 * **Insertion order preserved**: palettes show up in pickers in the
 * order they were registered (plugins control prominence via install
 * order in their providers array).
 *
 * **Duplicate id → throw**: a configuration mistake the developer
 * should fix, not silently recover from.
 *
 * Typical plugin usage:
 * ```ts
 * install(ctx) {
 *   const reg = ctx.injector.get(PaletteRegistry);
 *   ctx.track(reg.register({
 *     id: 'brand-primary',
 *     name: 'Brand Primary',
 *     swatches: ['#ff5733', '#33c1ff', '#33ff8a'],
 *   }));
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class PaletteRegistry {
  private readonly _palettes = signal<readonly Palette[]>([]);

  /** Reactive snapshot of all registered palettes (insertion order). */
  readonly palettes = this._palettes.asReadonly();

  /**
   * Register a palette. Returns a `Disposable` to remove the palette
   * later (typically tracked by the plugin via `ctx.track()` for
   * automatic cleanup on plugin uninstall).
   *
   * Throws if `palette.id` is empty, already registered, or if the
   * palette has zero swatches (an empty palette is never useful and
   * almost always indicates a programmer mistake).
   */
  register(palette: Palette): Disposable {
    if (typeof palette.id !== 'string' || palette.id.length === 0) {
      throw new Error('PaletteRegistry.register: palette.id must be a non-empty string');
    }
    if (palette.swatches.length === 0) {
      throw new Error(
        `PaletteRegistry.register: palette "${palette.id}" must have at least one swatch`,
      );
    }
    if (this._palettes().some((p) => p.id === palette.id)) {
      throw new Error(`PaletteRegistry.register: palette "${palette.id}" is already registered`);
    }
    this._palettes.set([...this._palettes(), palette]);
    return {
      dispose: () => {
        this._palettes.set(this._palettes().filter((p) => p.id !== palette.id));
      },
    };
  }

  /** Look up a palette by id, or `null` if not registered. */
  get(id: string): Palette | null {
    return this._palettes().find((p) => p.id === id) ?? null;
  }

  /**
   * Filter palettes by category. Useful for UIs that group palettes
   * by intent (`'brand'`, `'utility'`, etc.). Pass `undefined` to get
   * palettes with no explicit category set.
   */
  byCategory(category: string | undefined): readonly Palette[] {
    return this._palettes().filter((p) => p.category === category);
  }
}
