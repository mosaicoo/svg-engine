import { Injectable } from '@angular/core';
import type { LibraryItem } from '../library-item';
import { LibraryRegistry } from '../library-registry';

/**
 * Brush Library entry — D-048 (stub for v1, full Pencil-tool
 * integration deferred).
 *
 * **Vision** (Illustrator brushes):
 * - Calligraphic brushes — varying width along stroke.
 * - Scatter brushes — distribute symbol along path.
 * - Art brushes — stretch a vector along the stroke.
 *
 * **Stroke profile**: `widthProfile` is a curve sampled at N points
 * (0..1 normalized along the stroke) giving the brush width factor.
 * `[1, 1, 1, 1]` = constant width (default Pencil behaviour).
 *
 * **Current status (D-048)**: registry exists with the contract
 * locked in. Pencil tool integration (consuming `widthProfile` to
 * generate variable-width path with feMorphology or path expansion)
 * is **deferred to D-050**.
 */
export interface BrushLibraryItem extends LibraryItem {
  /**
   * Normalized width profile sampled at N evenly-spaced positions
   * along the stroke (0 = stroke start, 1 = stroke end). Values in
   * 0..1 are multiplied by the user-configured base stroke width.
   */
  readonly widthProfile: readonly number[];
  /** Optional opacity profile (same shape as `widthProfile`). */
  readonly opacityProfile?: readonly number[];
}

/**
 * Registry of `BrushLibraryItem`s (D-048 stub). Registry shape is
 * locked — only the Pencil tool consumption is deferred.
 */
@Injectable({ providedIn: 'root' })
export class BrushLibraryService extends LibraryRegistry<BrushLibraryItem> {}
