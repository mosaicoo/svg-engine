import { Injectable, signal } from '@angular/core';
import type { LibraryItem } from '../library-item';
import { LibraryRegistry } from '../library-registry';

/**
 * Brush Library entry — **D-060** (full Pencil-tool integration).
 *
 * **Stroke profile**: `widthProfile` is sampled at N points (0 =
 * stroke start, 1 = stroke end). Values in `[0, 1]` (or higher for
 * exaggerated brushes) multiply the brush's `baseWidth` to give the
 * local stroke width.
 *
 * - `[1, 1, 1, 1]` = constant width (uniform calligraphic).
 * - `[0, 1, 1, 0]` = tapered (thin → thick → thin).
 * - `[0.2, 1.4, 0.2]` = pressure-style pulse.
 *
 * **Optional `baseWidth`**: per-brush default for the base width. If
 * omitted, the active stroke-width from the editor's working style
 * is used (matches the convention of "brush modulates stroke-width").
 *
 * **Consumption** (D-060): when a brush is selected via
 * {@link BrushSelectionService}, the Pencil tool's commit step calls
 * `expandStrokeWithProfile(points, baseWidth, widthProfile)` to
 * generate a FILLED polygon outline instead of a stroked centerline.
 * The result is a regular `PathNode` with `fill` set and `stroke:
 * 'none'` — fully self-contained, no special rendering required.
 */
export interface BrushLibraryItem extends LibraryItem {
  /**
   * Normalized width profile sampled at N evenly-spaced positions
   * along the stroke (0 = stroke start, 1 = stroke end). Values in
   * `[0, 1]` (or higher for exaggerated effects) multiply the
   * `baseWidth`.
   */
  readonly widthProfile: readonly number[];
  /**
   * Optional explicit base width in document units. Defaults to 8 if
   * neither this nor a tool-level override is set — gives visible
   * strokes at typical zoom.
   */
  readonly baseWidth?: number;
  /**
   * Optional opacity profile (same shape as `widthProfile`).
   * **Not consumed in D-060 v1** — the brushes ship with the field
   * for forward compatibility, but the Pencil integration sets a
   * single uniform fill-opacity per stroke. Multi-stop opacity would
   * require per-vertex opacity (out of v1 scope, needs gradient
   * along path or per-segment SVG limitation workarounds).
   */
  readonly opacityProfile?: readonly number[];
}

/**
 * Registry of `BrushLibraryItem`s. Root-scoped — plugins register at
 * bootstrap (mirrors `ShapeLibraryService` and the other library
 * catalogs).
 */
@Injectable({ providedIn: 'root' })
export class BrushLibraryService extends LibraryRegistry<BrushLibraryItem> {}

/**
 * **D-060** — per-editor "currently-selected brush" state. When set
 * to a non-null brush id, the Pencil tool's commit step expands the
 * captured polyline through that brush's `widthProfile` instead of
 * emitting a plain stroked centerline.
 *
 * **Scoped via `provideSvgEngineEditorScope()`** — each editor
 * instance tracks its own active brush so multi-editor apps don't
 * leak brush selection across editors.
 *
 * **`null` brush** = no brush active = Pencil emits the standard
 * centerline + stroke style (D-048 / pre-D-060 behavior). Existing
 * apps that don't install `builtinBrushesPlugin` see no change in
 * the Pencil's behavior — zero regression by design.
 */
@Injectable({ providedIn: 'root' })
export class BrushSelectionService {
  private readonly _selectedBrushId = signal<string | null>(null);
  readonly selectedBrushId = this._selectedBrushId.asReadonly();

  /** Select a brush by id, or `null` to disable brush expansion. */
  select(brushId: string | null): void {
    this._selectedBrushId.set(brushId);
  }
}
