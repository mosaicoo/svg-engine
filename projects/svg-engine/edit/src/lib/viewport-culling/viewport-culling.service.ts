import { computed, inject, Injectable, Signal } from '@angular/core';
import {
  EditorStateService,
  getNodeBBox,
  intersectsBBox,
  isGroupNode,
  type BoundingBox,
  type NodeId,
  type SvgNode,
} from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';

/**
 * Sentinel id ensuring our injected stylesheet is added only once even
 * if the service is created in multiple injector scopes (test harnesses,
 * micro-frontends).
 */
const STYLE_TAG_ID = 'svge-viewport-culling-style';

/**
 * Viewport culling decisions (Fase 6b-2).
 *
 * **Problem this solves**: documents from real Illustrator exports
 * (Portos do RJ ~7.8k nodes, Paranagua ~16k nodes) drop Pan/Zoom FPS
 * to 14-22 because the browser must rasterize every visible SVG
 * element each frame. Most of those elements are *not* in the visible
 * viewBox at any given pan/zoom — culling them from the render tree
 * recovers FPS proportional to off-screen ratio.
 *
 * **Algorithm — recursive DFS with early termination** (Fase 6b-2-fix):
 * walk the tree depth-first; at each node:
 *
 * 1. Compute (and cache) the node's bbox.
 * 2. If the bbox does NOT intersect the visible viewBox: emit this
 *    node's id to `culledIds` and STOP descending. The CSS rule turns
 *    `data-svge-culled="1"` into `display: none` on the corresponding
 *    `<g data-node-id>`; the browser skips paint for the whole subtree
 *    automatically — no need to walk further or set the attribute on
 *    each descendant.
 * 3. If the bbox intersects AND the node is a group, recurse into its
 *    children (the group itself stays visible; individual children may
 *    still be culled).
 *
 * **Why not top-level only**: the previous v1 (top-level children of
 * `root` only) was provably ineffective on real Illustrator output.
 * Measured against the Portos do RJ (7 804 nodes) and Paranagua
 * (16 312 nodes) test files: Pan/Zoom FPS unchanged (14 → 14, 20 → 20).
 * Reason: Illustrator wraps everything in `<g id="Layer_1">` so
 * `root.children` has length 1; its bbox spans the entire document
 * and never gets culled. Recursive DFS visits each shape and culls
 * the ones outside the visible viewBox individually.
 *
 * **Cache**: per-node bbox stored in a `WeakMap<SvgNode, BoundingBox>`.
 * Safe because nodes are immutable — any mutation creates a new node
 * reference, automatically invalidating the cached bbox via WeakMap
 * eviction when the old reference dies. No manual invalidation needed.
 *
 * **Reactivity**: {@link culledIds} is a computed signal depending on
 * `state.document()` and `viewport.viewBox()`. Re-fires when EITHER
 * changes. The {@link SvgeViewportCullingDirective} consumes the
 * signal to apply `data-svge-culled` attribute, which a globally-
 * injected CSS rule turns into `display: none`.
 *
 * **Why CSS class + data attribute (not direct `style.display`)**:
 * the existing `[svgeLayersFilter]` directive also manages
 * `style.display` on the same elements. Two directives writing to the
 * same `style.display` need coordinated state to avoid one undoing
 * the other on partial change. A separate data-attribute selector
 * decouples them — both can claim "hide me" independently, and the
 * element stays hidden as long as EITHER attribute is present.
 *
 * **Headless-safe**: the stylesheet injection is gated on
 * `typeof document !== 'undefined'` so SSR / Web Worker consumers
 * don't crash. They also won't benefit from culling, but the service
 * itself stays constructible.
 */
@Injectable({ providedIn: 'root' })
export class ViewportCullingService {
  private readonly state = inject(EditorStateService);
  private readonly viewport = inject(ViewportService);

  /** Per-node bbox cache. WeakMap auto-evicts when the node reference dies. */
  private readonly bboxCache = new WeakMap<SvgNode, BoundingBox>();

  /**
   * Set of node ids whose bbox does NOT intersect the current visible
   * `viewBox` and which should therefore be hidden from paint. Contains
   * only the **topmost** id of each out-of-viewport subtree — descendants
   * are implicitly hidden via CSS (`display: none` on the ancestor
   * `<g>` cascades). Consumed by {@link SvgeViewportCullingDirective}
   * to apply the `data-svge-culled` attribute.
   *
   * **Implementation note**: DFS with early termination. Stops descending
   * the first time a subtree is fully outside the viewport — keeps the
   * culled set small (one entry per culled subtree instead of one per
   * culled leaf) and avoids per-frame allocations proportional to the
   * total node count.
   */
  readonly culledIds: Signal<ReadonlySet<NodeId>> = computed(() => {
    const doc = this.state.document();
    const view = this.viewport.viewBox();
    const culled = new Set<NodeId>();
    // Skip the root itself — culling it would hide the entire canvas
    // (and the root's bbox always intersects the viewport that was
    // derived from it). Start at root.children to evaluate each
    // top-level subtree, then recurse.
    for (const child of doc.root.children) {
      this.cullSubtree(child, view, culled);
    }
    return culled;
  });

  /**
   * DFS helper: if `node`'s bbox is outside `view`, mark it culled and
   * stop. Otherwise, if it's a group, recurse into children. Leaves
   * whose bbox intersects are left untouched (visible).
   */
  private cullSubtree(node: SvgNode, view: BoundingBox, out: Set<NodeId>): void {
    const bb = this.getCachedBBox(node);
    if (!intersectsBBox(bb, view)) {
      // Whole subtree outside the viewport — cull at this level and
      // skip descendants (CSS will hide them via inherited display:none).
      out.add(node.id);
      return;
    }
    if (isGroupNode(node)) {
      for (const child of node.children) {
        this.cullSubtree(child, view, out);
      }
    }
  }

  constructor() {
    this.ensureStylesheetInjected();
  }

  /**
   * Returns a cached bbox for the node or computes-and-caches one. The
   * cache key is the node reference itself, so any tree mutation that
   * produces a new node automatically gets a fresh bbox.
   */
  private getCachedBBox(node: SvgNode): BoundingBox {
    let cached = this.bboxCache.get(node);
    if (cached === undefined) {
      cached = getNodeBBox(node);
      this.bboxCache.set(node, cached);
    }
    return cached;
  }

  /**
   * Inject the global rule `[data-svge-culled="1"] { display: none; }`
   * exactly once. The attribute is set/unset by the directive; the
   * stylesheet flips visibility without any per-frame JS work after
   * the attribute toggle.
   */
  private ensureStylesheetInjected(): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_TAG_ID) !== null) return;
    const style = document.createElement('style');
    style.id = STYLE_TAG_ID;
    style.textContent = '[data-svge-culled="1"]{display:none}';
    document.head.appendChild(style);
  }
}
