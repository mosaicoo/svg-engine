import { computed, Injectable, signal } from '@angular/core';
import type { BoundingBox, NodeId, Point } from '@mosaicoo/svg-engine/core';
import {
  gridTargetsNear,
  guidesToSnapTargets,
  rectsToSnapTargets,
  resolveSnap,
  type SnapGuide,
  type SnapTarget,
} from './snap-resolver';

/**
 * Where the GRID/OBJECT snap candidates come from. **D-126**: snapping to
 * **guides** is an INDEPENDENT, additive toggle ({@link SnapService.snapToGuides})
 * that layers on top of whatever mode is active — it is intentionally NOT a
 * value of this enum, so the existing Grid / Objects / Both selection is
 * untouched.
 */
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
  // **D-126** — independent "snap to user-drawn guides" toggle, additive on
  // top of the grid/object `mode`. Default off (opt-in), so it never changes
  // existing behaviour until the user turns it on.
  private readonly _snapToGuides = signal(false);
  private readonly _gridSize = signal(DEFAULT_GRID_SIZE);
  // Where the grid lattice is anchored (doc units) — the page's top-left.
  // Kept in sync with the rendered grid so "snap to grid" lands exactly on
  // the drawn lines even when the page doesn't start on a grid multiple.
  private readonly _gridOrigin = signal<Point>({ x: 0, y: 0 });
  private readonly _thresholdPx = signal(DEFAULT_THRESHOLD_PX);

  readonly enabled = this._enabled.asReadonly();
  readonly mode = this._mode.asReadonly();
  /** **D-126** — whether snapping to user-drawn guides is on (additive to `mode`). */
  readonly snapToGuides = this._snapToGuides.asReadonly();
  readonly gridSize = this._gridSize.asReadonly();
  readonly gridOrigin = this._gridOrigin.asReadonly();
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

  /** **D-126** — set the (additive) snap-to-guides toggle. */
  setSnapToGuides(on: boolean): void {
    this._snapToGuides.set(on);
  }

  /** **D-126** — flip the snap-to-guides toggle. */
  toggleSnapToGuides(): void {
    this._snapToGuides.update((v) => !v);
  }

  setGridSize(size: number): void {
    if (!Number.isFinite(size) || size <= 0) return;
    this._gridSize.set(size);
  }

  /**
   * Set the grid lattice origin (doc units) — typically the active page's
   * top-left, so the snap lattice matches the rendered grid. Ignores
   * non-finite values.
   */
  setGridOrigin(origin: Point): void {
    if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return;
    this._gridOrigin.set({ x: origin.x, y: origin.y });
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
   * @param guideLines **D-126** — the workspace guide lines (typically
   *   `WorkspaceService.guides()`); used only when {@link snapToGuides} is on.
   *   Passed by the consumer (same decoupling contract as `staticRects`) so the
   *   service stays independent of `WorkspaceService`. Additive: it composes
   *   with whatever `mode` (Grid / Objects / Both) is active.
   */
  resolveForMove(
    moving: BoundingBox,
    staticRects: readonly { readonly id: NodeId; readonly bbox: BoundingBox }[],
    zoom = 1,
    guideLines: readonly { readonly axis: 'h' | 'v'; readonly position: number }[] = [],
  ): { readonly delta: Point; readonly guides: readonly SnapGuide[] } {
    if (!this._enabled()) return EMPTY_RESULT;
    const mode = this._mode();
    const thresholdDoc = this._thresholdPx() / Math.max(zoom, 0.0001);

    // **PRO-GAP-FIX B2 / D-126** — push OBJECT and GUIDE targets BEFORE grid
    // targets so they win in ties. Grids are dense (every `gridSize` units,
    // default 10), so a grid line is almost always within snap range; without
    // the ordering, grid would pre-empt every object/guide snap. Illustrator /
    // Affinity follow the same "objects/guides > grid" rule — aligning to a
    // sibling shape or an explicit user guide is semantically richer than an
    // abstract lattice. `resolveSnap` uses strictly-less tie-breaking, so
    // emitting these first means they win when distances are equal.
    const targets: SnapTarget[] = [];
    if (mode === 'objects' || mode === 'both') {
      targets.push(...rectsToSnapTargets(staticRects));
    }
    // **D-126** — guides are additive: snapped to whenever the toggle is on,
    // independent of the grid/object mode.
    if (this._snapToGuides()) {
      targets.push(...guidesToSnapTargets(guideLines));
    }
    if (mode === 'grid' || mode === 'both') {
      const g = this._gridSize();
      const o = this._gridOrigin();
      targets.push(
        ...gridTargetsNear(moving, g, 'x', o.x),
        ...gridTargetsNear(moving, g, 'y', o.y),
      );
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
