import { Injectable } from '@angular/core';
import type { LibraryItem } from '../library-item';
import { LibraryRegistry } from '../library-registry';

/**
 * A "graphic style" preset — a saved combination of style properties
 * (fill, stroke, strokeWidth, opacity, filter, ...) that the user can
 * apply with one click to any number of selected nodes.
 *
 * **Why not just save full node clones**: a graphic style is *style
 * only* — applying it preserves the target's geometry. Cloning a node
 * would replace geometry too.
 *
 * **`style` payload type**: `Record<string, string | number | undefined>`
 * intentionally loose so plugins can add custom style props (e.g.,
 * future `mix-blend-mode`) without breaking the contract. Application
 * dispatches one `SetStylePropertyOnManyCommand` per non-undefined
 * entry, batched under a single undo entry via consumer composition.
 */
export interface GraphicStyleLibraryItem extends LibraryItem {
  /**
   * Map of style property name → value. Properties with `undefined`
   * value are SKIPPED on apply (they don't clear the target — that
   * would surprise users picking a style preset).
   */
  readonly style: Readonly<Record<string, string | number | undefined>>;
}

/**
 * Registry of `GraphicStyleLibraryItem`s — D-048 Graphic Styles.
 *
 * Consumers (`<svge-graphic-style-library-panel>`) call `items()` to
 * render a thumbnail grid (rendered as a small rect previewing the
 * style); clicking dispatches the style application onto every
 * selected node.
 *
 * Scope: per-editor via D-042 — different editors can have different
 * brand-style catalogs.
 */
@Injectable({ providedIn: 'root' })
export class GraphicStyleLibraryService extends LibraryRegistry<GraphicStyleLibraryItem> {}
