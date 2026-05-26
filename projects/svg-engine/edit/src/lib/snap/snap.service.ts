import { computed, Injectable, signal } from '@angular/core';
import type { BoundingBox, NodeId, Point } from 'svg-engine/core';
import {
  gridTargetsNear,
  rectsToSnapTargets,
  resolveSnap,
  type SnapGuide,
  type SnapTarget,
} from './snap-resolver';

/** Where snap candidates are sourced from. */
export type SnapMode = 'grid' | 'objects' | 'both';

/** Default grid spacing (doc units). */
const DEFAULT_GRID_SIZE = 10;
/** Default snap threshold (CSS pixels — converted via `1/zoom` at call time). */
const DEFAULT_THRESHOLD_PX = 8;

/**
 * Snap configuration + active-guides state. **Pure orchestration** —
 * this service does not subscribe to TransformService or
 * SelectionService; the consumer (typically the playground or a custom
 * gesture controller) calls {@link resolveForMove} with the current
 * moving rect + candidate rects, applies the returned `delta` to its
 * gesture target, and pushes the returned `guides` here so the
 * `<svge-snap-guides>` overlay renders them.
 *
 * **Why decouple**: snap candidates depend on the rendered DOM (other
 * nodes' bboxes), which is best read where the gesture happens (avoids
 * a circular dep TransformService ↔ SnapService and keeps both
 * services unit-testable in isolation).
 *
 * **Threshold semantics**: configured in **CSS pixels**. The resolver
 * converts to doc units by dividing by the supplied zoom (so the
 * "snap range" stays visually constant regardless of zoom level —
 * matches Illustrator/Affinity behaviour).
 */
@Injectable({ providedIn: 'root' })
export class SnapService {
  // ── Config (signals — runtime-tunable from a settings panel) ─────

  private readonly _enabled = signal(true);
  private readonly _mode = signal<SnapMode>('both');
  private readonly _gridSize = signal(DEFAULT_GRID_SIZE);
  private readonly _thresholdPx = signal(DEFAULT_THRESHOLD_PX);

  readonly enabled = this._enabled.asReadonly();
  readonly mode = this._mode.asReadonly();
  readonly gridSize = this._gridSize.asReadonly();
  readonly thresholdPx = this._thresholdPx.asReadonly();

  // ── Live guides (set by consumer during a gesture, read by overlay) ─

  private readonly _activeGuides = signal<readonly SnapGuide[]>([]);
  readonly activeGuides = this._activeGuides.asReadonly();
  readonly hasActiveGuides = computed(() => this._activeGuides().length > 0);

  setEnabled(enabled: boolean): void {
    this._enabled.set(enabled);
    if (!enabled) this._activeGuides.set([]);
  }

  setMode(mode: SnapMode): void {
    this._mode.set(mode);
  }

  setGridSize(size: number): void {
    if (!Number.isFinite(size) || size <= 0) return;
    this._gridSize.set(size);
  }

  setThresholdPx(px: number): void {
    if (!Number.isFinite(px) || px < 0) return;
    this._thresholdPx.set(px);
  }

  /**
   * Resolve a snap for a moving rect. Returns `{ delta: {x:0,y:0}, guides: [] }`
   * when snap is disabled or no candidate fits within the threshold.
   *
   * @param moving the **proposed** new bbox of the dragged node, BEFORE
   *   snap adjustment (i.e., where it would land without snap).
   * @param staticRects bboxes of every other relevant node (typically:
   *   every node in the document **except** the one being moved). The
   *   caller is responsible for excluding the moving node — including it
   *   would let the moving rect snap to itself.
   * @param zoom current `viewport.zoom()` so the pixel threshold can be
   *   converted to doc units. Defaults to `1` (useful for tests).
   */
  resolveForMove(
    moving: BoundingBox,
    staticRects: readonly { readonly id: NodeId; readonly bbox: BoundingBox }[],
    zoom = 1,
  ): { readonly delta: Point; readonly guides: readonly SnapGuide[] } {
    if (!this._enabled()) return EMPTY_RESULT;
    const mode = this._mode();
    const thresholdDoc = this._thresholdPx() / Math.max(zoom, 0.0001);

    // **PRO-GAP-FIX B2** — in 'both' mode, push OBJECT targets BEFORE
    // grid targets so they win in ties. Rationale: grids are dense
    // (every `gridSize` units, default 10), so a grid line is almost
    // always within snap range of any moving rect. Without the
    // ordering swap, grid pre-empts every potential object snap and
    // 'both' degenerates into 'grid only' from the user's perspective.
    // Illustrator / Affinity follow the same "objects > grid" rule —
    // object alignment is semantically richer (aligning to a sibling
    // shape vs an abstract lattice), so the visual feedback should
    // surface it when both qualify. `resolveSnap` keeps strictly-less
    // semantics for tie-breaking, so emitting objects first means
    // they win when distances are equal.
    const targets: SnapTarget[] = [];
    if (mode === 'objects' || mode === 'both') {
      targets.push(...rectsToSnapTargets(staticRects));
    }
    if (mode === 'grid' || mode === 'both') {
      const g = this._gridSize();
      targets.push(...gridTargetsNear(moving, g, 'x'), ...gridTargetsNear(moving, g, 'y'));
    }
    return resolveSnap(moving, targets, thresholdDoc);
  }

  /** Publish the guides that the consumer just used (for the overlay). */
  setActiveGuides(guides: readonly SnapGuide[]): void {
    this._activeGuides.set(guides);
  }

  /** Clear the active guides (call on `endMove`/`cancelGesture`/etc.). */
  clearActiveGuides(): void {
    this._activeGuides.set([]);
  }
}

const EMPTY_RESULT = {
  delta: { x: 0, y: 0 } as const,
  guides: [] as const,
};
