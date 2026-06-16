import { computed, Injectable, signal } from '@angular/core';
import type { BoundingBox, NodeId, Point } from 'svg-engine/core';
import {
  gridTargetsNear,
  guidesToSnapTargets,
  rectsToSnapTargets,
  resolveSnap,
  type SnapGuide,
  type SnapTarget,
} from './snap-resolver';

/**
 * **Legacy** primary-axis summary: `'grid'`, `'objects'`, or `'both'`.
 *
 * **D-125** replaced the exclusive mode with three independent toggles
 * ({@link SnapService.snapToGrid} / {@link SnapService.snapToObjects} /
 * {@link SnapService.snapToGuides}). This type + {@link SnapService.mode} +
 * {@link SnapService.setMode} are kept as a thin compatibility layer over
 * the grid/objects axis (guides are orthogonal), so consumers that only
 * deal with grid/objects (the status-bar dropdown, the custom-editor demo
 * select) keep working. Prefer the per-source toggles for new code.
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
  // **D-125** — independent snap-source toggles (replace the old exclusive
  // `mode` enum). Default grid+objects on, guides off — matches the previous
  // `'both'` default. Pixels were intentionally NOT added (more confusing
  // than helpful for this product).
  private readonly _snapToGrid = signal(true);
  private readonly _snapToObjects = signal(true);
  private readonly _snapToGuides = signal(false);
  private readonly _gridSize = signal(DEFAULT_GRID_SIZE);
  // Where the grid lattice is anchored (doc units) — the page's top-left.
  // Kept in sync with the rendered grid so "snap to grid" lands exactly on
  // the drawn lines even when the page doesn't start on a grid multiple.
  private readonly _gridOrigin = signal<Point>({ x: 0, y: 0 });
  private readonly _thresholdPx = signal(DEFAULT_THRESHOLD_PX);

  readonly enabled = this._enabled.asReadonly();

  /** **D-125** — snap to the grid lattice. */
  readonly snapToGrid = this._snapToGrid.asReadonly();
  /** **D-125** — snap to other objects' edges/centres. */
  readonly snapToObjects = this._snapToObjects.asReadonly();
  /** **D-125** — snap to user-drawn guide lines (`WorkspaceService.guides()`). */
  readonly snapToGuides = this._snapToGuides.asReadonly();

  /**
   * **Legacy compatibility** ({@link SnapMode}) — a grid/objects summary
   * derived from the toggles: `'both'` when both are on, else `'grid'` /
   * `'objects'` for whichever is on (falls back to `'both'` when neither is —
   * an edge only reachable via the per-source toggles, e.g. guides-only).
   * Ignores {@link snapToGuides}. Prefer the per-source signals.
   */
  readonly mode = computed<SnapMode>(() => {
    const g = this._snapToGrid();
    const o = this._snapToObjects();
    if (g && o) return 'both';
    if (g) return 'grid';
    if (o) return 'objects';
    return 'both';
  });

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

  /** **D-125** — set the grid-snap toggle. */
  setSnapToGrid(on: boolean): void {
    this._snapToGrid.set(on);
  }

  /** **D-125** — set the object-snap toggle. */
  setSnapToObjects(on: boolean): void {
    this._snapToObjects.set(on);
  }

  /** **D-125** — set the guide-snap toggle. */
  setSnapToGuides(on: boolean): void {
    this._snapToGuides.set(on);
  }

  /** **D-125** — flip the grid-snap toggle. */
  toggleSnapToGrid(): void {
    this._snapToGrid.update((v) => !v);
  }

  /** **D-125** — flip the object-snap toggle. */
  toggleSnapToObjects(): void {
    this._snapToObjects.update((v) => !v);
  }

  /** **D-125** — flip the guide-snap toggle. */
  toggleSnapToGuides(): void {
    this._snapToGuides.update((v) => !v);
  }

  /**
   * **Legacy compatibility** — set the grid/objects axis from a
   * {@link SnapMode} value (leaves {@link snapToGuides} untouched).
   * `'grid'` → grid only, `'objects'` → objects only, `'both'` → both on.
   * Prefer {@link setSnapToGrid} / {@link setSnapToObjects} in new code.
   */
  setMode(mode: SnapMode): void {
    this._snapToGrid.set(mode === 'grid' || mode === 'both');
    this._snapToObjects.set(mode === 'objects' || mode === 'both');
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
   * @param guideLines **D-125** — the workspace guide lines (typically
   *   `WorkspaceService.guides()`); used only when {@link snapToGuides} is
   *   on. Passed by the consumer (same decoupling contract as `staticRects`)
   *   so the service stays independent of `WorkspaceService`.
   */
  resolveForMove(
    moving: BoundingBox,
    staticRects: readonly { readonly id: NodeId; readonly bbox: BoundingBox }[],
    zoom = 1,
    guideLines: readonly { readonly axis: 'h' | 'v'; readonly position: number }[] = [],
  ): { readonly delta: Point; readonly guides: readonly SnapGuide[] } {
    if (!this._enabled()) return EMPTY_RESULT;
    const thresholdDoc = this._thresholdPx() / Math.max(zoom, 0.0001);

    // **PRO-GAP-FIX B2 / D-125** — push OBJECT and GUIDE targets BEFORE grid
    // targets so they win in ties. Grids are dense (every `gridSize` units,
    // default 10), so a grid line is almost always within snap range; without
    // the ordering, grid would pre-empt every object/guide snap. Illustrator /
    // Affinity follow the same "objects/guides > grid" rule — aligning to a
    // sibling shape or an explicit user guide is semantically richer than an
    // abstract lattice. `resolveSnap` uses strictly-less tie-breaking, so
    // emitting these first means they win when distances are equal.
    const targets: SnapTarget[] = [];
    if (this._snapToObjects()) {
      targets.push(...rectsToSnapTargets(staticRects));
    }
    if (this._snapToGuides()) {
      targets.push(...guidesToSnapTargets(guideLines));
    }
    if (this._snapToGrid()) {
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
