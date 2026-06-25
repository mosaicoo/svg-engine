import type { BoundingBox, NodeId, Point } from '@mosaicoo/svg-engine/core';

/** Axis a snap target/guide lies on. */
export type SnapAxis = 'x' | 'y';

/** Where the snap target came from. */
export type SnapSource = 'grid' | 'object' | 'guide';

/**
 * A 1-D snap target — a line at `value` on `axis`. Multiple targets on
 * the same axis are valid (different sources, different objects).
 */
export interface SnapTarget {
  readonly axis: SnapAxis;
  readonly value: number;
  readonly source: SnapSource;
  /** Present when `source === 'object'` — id of the static object generating the target. */
  readonly objectId?: NodeId;
}

/**
 * Result of {@link resolveSnap}: the position adjustment to apply to
 * the moving rect, and the (≤ 2) guides to display.
 */
export interface SnapResult {
  readonly delta: Point;
  readonly guides: readonly SnapGuide[];
}

/** A line to render in the overlay (visual proof that a snap occurred). */
export interface SnapGuide {
  readonly axis: SnapAxis;
  readonly value: number;
  readonly source: SnapSource;
}

/**
 * Generate snap targets from a list of static rects (typically the
 * bboxes of every node **other than** the one being moved). Each rect
 * contributes 6 targets total: low/center/high on each axis.
 *
 * Pure function — input is bboxes, output is `SnapTarget[]`. The caller
 * decides which rects to feed in (e.g., excluding the moving node, or
 * intersecting only the visible viewport for performance).
 */
export function rectsToSnapTargets(
  rects: readonly { readonly id: NodeId; readonly bbox: BoundingBox }[],
): readonly SnapTarget[] {
  const out: SnapTarget[] = [];
  for (const { id, bbox } of rects) {
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    out.push(
      { axis: 'x', value: bbox.x, source: 'object', objectId: id },
      { axis: 'x', value: cx, source: 'object', objectId: id },
      { axis: 'x', value: bbox.x + bbox.width, source: 'object', objectId: id },
      { axis: 'y', value: bbox.y, source: 'object', objectId: id },
      { axis: 'y', value: cy, source: 'object', objectId: id },
      { axis: 'y', value: bbox.y + bbox.height, source: 'object', objectId: id },
    );
  }
  return out;
}

/**
 * Generate grid snap targets covering the area around `moving` on the
 * given `axis`. We only emit lines within ~one grid cell of the rect's
 * extents on that axis — that's the only region where a snap can
 * possibly happen, and it keeps target counts bounded regardless of
 * document size (essential when grid is fine, e.g. 1-unit lines on a
 * 10000×10000 doc would otherwise produce 10001 targets).
 *
 * @param origin where the grid lattice is anchored on this axis (doc
 *   units) — the page's top-left, matching the **rendered** grid (lines
 *   at `origin + k·gridSize`). Defaults to `0` (document origin). Passing
 *   the page origin is what keeps the snap lattice glued to the drawn
 *   grid when the page doesn't start on a grid multiple.
 */
export function gridTargetsNear(
  moving: BoundingBox,
  gridSize: number,
  axis: SnapAxis,
  origin = 0,
): readonly SnapTarget[] {
  if (!(gridSize > 0)) return [];
  const lo = (axis === 'x' ? moving.x : moving.y) - gridSize;
  const hi = (axis === 'x' ? moving.x + moving.width : moving.y + moving.height) + gridSize;
  const startK = Math.floor((lo - origin) / gridSize);
  const endK = Math.ceil((hi - origin) / gridSize);
  const out: SnapTarget[] = [];
  for (let k = startK; k <= endK; k++) {
    out.push({ axis, value: origin + k * gridSize, source: 'grid' });
  }
  return out;
}

/**
 * **D-126** — generate snap targets from workspace guide lines. A
 * **horizontal** guide (`axis: 'h'`) is a constant-Y line → a target on
 * the **y** axis; a **vertical** guide (`axis: 'v'`) is a constant-X line
 * → a target on the **x** axis. Non-finite positions are skipped.
 *
 * Pure function — the caller (gesture handler) passes the current
 * `WorkspaceService.guides()` so the resolver stays decoupled from the
 * workspace service (same contract as {@link rectsToSnapTargets}).
 */
export function guidesToSnapTargets(
  guides: readonly { readonly axis: 'h' | 'v'; readonly position: number }[],
): readonly SnapTarget[] {
  const out: SnapTarget[] = [];
  for (const g of guides) {
    if (!Number.isFinite(g.position)) continue;
    out.push(
      g.axis === 'h'
        ? { axis: 'y', value: g.position, source: 'guide' }
        : { axis: 'x', value: g.position, source: 'guide' },
    );
  }
  return out;
}

/**
 * Resolve snap for a moving axis-aligned bbox against a list of 1-D
 * targets. Algorithm:
 *
 * 1. Compute 3 features per axis from the moving rect: low edge, center,
 *    high edge.
 * 2. For each target, find the closest matching feature on its axis.
 *    If `|feature - target.value| ≤ threshold`, it's a candidate.
 * 3. Per axis, pick the candidate with the smallest distance (ties go to
 *    the first encountered — order in `targets` is the tie-breaker).
 * 4. Return `delta = best.target.value - best.feature` per axis (zero if
 *    no candidate on that axis), and one guide per snapped axis.
 *
 * **Pure**: no signals, no DOM, deterministic. Threshold is in the same
 * units as the rect/targets (the caller is responsible for converting
 * a CSS-pixel threshold to doc units via `1/zoom` if applicable).
 *
 * **Behaviour at threshold = 0**: never snaps. **At Infinity**: always
 * snaps to the closest target on each axis (subject to the candidate
 * pool being non-empty).
 */
export function resolveSnap(
  moving: BoundingBox,
  targets: readonly SnapTarget[],
  threshold: number,
): SnapResult {
  if (!(threshold > 0) || targets.length === 0) {
    return { delta: { x: 0, y: 0 }, guides: [] };
  }

  const featuresX = [moving.x, moving.x + moving.width / 2, moving.x + moving.width];
  const featuresY = [moving.y, moving.y + moving.height / 2, moving.y + moving.height];

  let bestX: { feature: number; target: SnapTarget; dist: number } | null = null;
  let bestY: { feature: number; target: SnapTarget; dist: number } | null = null;

  for (const t of targets) {
    const features = t.axis === 'x' ? featuresX : featuresY;
    let bestFeatureDist = Infinity;
    let bestFeature = features[0]!;
    for (const f of features) {
      const d = Math.abs(f - t.value);
      if (d < bestFeatureDist) {
        bestFeatureDist = d;
        bestFeature = f;
      }
    }
    if (bestFeatureDist > threshold) continue;
    if (t.axis === 'x') {
      if (bestX === null || bestFeatureDist < bestX.dist) {
        bestX = { feature: bestFeature, target: t, dist: bestFeatureDist };
      }
    } else {
      if (bestY === null || bestFeatureDist < bestY.dist) {
        bestY = { feature: bestFeature, target: t, dist: bestFeatureDist };
      }
    }
  }

  const delta: Point = {
    x: bestX === null ? 0 : bestX.target.value - bestX.feature,
    y: bestY === null ? 0 : bestY.target.value - bestY.feature,
  };
  const guides: SnapGuide[] = [];
  if (bestX !== null) {
    guides.push({ axis: 'x', value: bestX.target.value, source: bestX.target.source });
  }
  if (bestY !== null) {
    guides.push({ axis: 'y', value: bestY.target.value, source: bestY.target.source });
  }
  return { delta, guides };
}
