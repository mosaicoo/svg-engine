import type { Point } from '@mosaicoo/svg-engine/core';

/**
 * Evaluate a cubic Bézier defined by control points `p0..p3` at
 * parameter `t ∈ [0, 1]`. (`p1`/`p2` are the out/in tangent handles.)
 */
export function cubicPointAt(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * Parameter `t ∈ [0, 1]` of the point on the cubic Bézier (`p0..p3`)
 * closest to `target`.
 *
 * **Why this exists**: the "double-click a segment to insert an anchor"
 * gesture (market convention — Inkscape / Affinity / Figma) must drop
 * the new anchor *where the user clicked*, not at a fixed midpoint. The
 * insert command (`InsertAnchorCommand`) splits the cubic by parameter
 * `t` via De Casteljau, so we just need to project the click onto the
 * curve and recover that `t`.
 *
 * **Method**: coarse uniform sample (`samples + 1` points) to bracket
 * the nearest region, then ternary-search refinement for sub-sample
 * precision. Allocation-light and well under a pixel at typical zoom —
 * accurate enough for an interactive gesture, and cheap enough to run
 * synchronously on the click.
 *
 * Returns the raw `t` (NOT clamped off the endpoints); callers feeding
 * an insert command should clamp to the open interval `(0, 1)` since
 * `InsertAnchorCommand` rejects `t ≤ 0` / `t ≥ 1`.
 */
export function nearestTOnCubic(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  target: Point,
  samples = 24,
  refineIterations = 24,
): number {
  let bestT = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const dist = dist2(cubicPointAt(p0, p1, p2, p3, t), target);
    if (dist < bestDist) {
      bestDist = dist;
      bestT = t;
    }
  }
  // Refine within ±1 sample of the best bracket via ternary search
  // (the squared-distance function is unimodal over a small bracket).
  let lo = Math.max(0, bestT - 1 / samples);
  let hi = Math.min(1, bestT + 1 / samples);
  for (let i = 0; i < refineIterations; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const d1 = dist2(cubicPointAt(p0, p1, p2, p3, m1), target);
    const d2 = dist2(cubicPointAt(p0, p1, p2, p3, m2), target);
    if (d1 < d2) {
      hi = m2;
    } else {
      lo = m1;
    }
  }
  return (lo + hi) / 2;
}

/** Squared euclidean distance — avoids the sqrt in the hot loop. */
function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
