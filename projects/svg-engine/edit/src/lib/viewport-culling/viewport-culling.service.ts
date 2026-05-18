import { computed, inject, Injectable, Signal } from '@angular/core';
import {
  EditorStateService,
  getNodeBBox,
  intersectsBBox,
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
 * **Scope (v1)**: cull TOP-LEVEL children of `document().root` whose
 * model-space bbox does not intersect the current `viewport.viewBox()`.
 * Nested-group recursion is deferred — top-level culling captures the
 * lion's share of the win because typical Illustrator exports group
 * by region/feature class.
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
   * Set of top-level node ids whose bbox does NOT intersect the
   * current visible `viewBox`. Consumed by
   * {@link SvgeViewportCullingDirective} to apply the culled attr.
   *
   * **Stability**: returns the same `Set` reference across consecutive
   * re-runs that produce the same set contents — but the computed
   * signal re-evaluates per viewport change regardless. The directive
   * compares against its own "currently culled" snapshot for diff
   * application, so reference equality isn't load-bearing here.
   */
  readonly culledIds: Signal<ReadonlySet<NodeId>> = computed(() => {
    const doc = this.state.document();
    const view = this.viewport.viewBox();
    const culled = new Set<NodeId>();
    for (const child of doc.root.children) {
      const bb = this.getCachedBBox(child);
      if (!intersectsBBox(bb, view)) {
        culled.add(child.id);
      }
    }
    return culled;
  });

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
