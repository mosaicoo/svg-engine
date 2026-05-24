import type { Point } from 'svg-engine/core';

/**
 * **D-060** — Expand a polyline centerline into a closed-polygon
 * path representing the stroked outline with variable width modulated
 * by a brush profile. Returns the SVG `d` of the outline (a single
 * `M ... L ... Z` polygon ready to be assigned as `fill`).
 *
 * **Algorithm** (Sutherland-style ribbon expansion):
 *
 * 1. For each point along the centerline, compute the **smoothed
 *    tangent** as the normalized average of the incoming and outgoing
 *    edges (endpoints use the single neighbor edge). Smoothing avoids
 *    angular ribbon corners on sharp turns of the captured polyline.
 * 2. Rotate the tangent 90° to get the **perpendicular**.
 * 3. Sample the brush's `widthProfile` at the point's normalized
 *    arc-position `t ∈ [0, 1]` (linear interpolation between adjacent
 *    profile samples).
 * 4. Compute the local width = `baseWidth * profileAt(t)`.
 * 5. Offset the centerline point by `±(width / 2)` along the
 *    perpendicular to get `left[i]` and `right[i]`.
 * 6. Build the outline polygon: walk LEFT side forward
 *    (`left[0..N-1]`), then RIGHT side backward (`right[N-1..0]`),
 *    close with `Z`.
 *
 * **Edge cases handled**:
 * - **< 2 points**: returns empty string (caller should skip).
 * - **Two identical adjacent points** (zero edge length): copies the
 *   previous tangent. Avoids NaN from normalize(0,0).
 * - **Empty widthProfile**: behaves as uniform `baseWidth`
 *   (profileAt always returns 1).
 * - **Single profile sample**: that value applies uniformly.
 *
 * **Pure** — no DOM, no DI, deterministic. Suitable for tests +
 * worker use. Profile arrays are read-only and never mutated.
 *
 * **Coordinate system**: assumes Y-down (SVG convention). The
 * perpendicular rotation uses `(dx, dy) → (-dy, dx)` which gives a
 * 90° CCW rotation in math coords = 90° CW in SVG (i.e., the
 * "left" side is to the right of the drawing direction in screen
 * terms). This convention is consistent within the algorithm — the
 * polygon is closed regardless of which side is which.
 */
export function expandStrokeWithProfile(
  points: readonly Point[],
  baseWidth: number,
  widthProfile: readonly number[],
): string {
  const n = points.length;
  if (n < 2) return '';
  if (baseWidth <= 0) return '';

  // Pre-compute arc-length parameter t ∈ [0, 1] per point.
  // Using cumulative distance — more uniform than i/(N-1) when the
  // pencil samples are unevenly spaced (which they always are).
  const cumLen: number[] = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const dx = points[i]!.x - points[i - 1]!.x;
    const dy = points[i]!.y - points[i - 1]!.y;
    cumLen[i] = cumLen[i - 1]! + Math.hypot(dx, dy);
  }
  const totalLen = cumLen[n - 1]!;
  if (totalLen < 1e-9) return ''; // all points coincident

  // Compute perpendicular at each point (smoothed tangent).
  const perps: { x: number; y: number }[] = [];
  let prevTan: { x: number; y: number } = { x: 1, y: 0 };
  for (let i = 0; i < n; i++) {
    const prevDx = i > 0 ? points[i]!.x - points[i - 1]!.x : 0;
    const prevDy = i > 0 ? points[i]!.y - points[i - 1]!.y : 0;
    const nextDx = i < n - 1 ? points[i + 1]!.x - points[i]!.x : 0;
    const nextDy = i < n - 1 ? points[i + 1]!.y - points[i]!.y : 0;
    const tx = prevDx + nextDx;
    const ty = prevDy + nextDy;
    const tLen = Math.hypot(tx, ty);
    let tan: { x: number; y: number };
    if (tLen < 1e-9) {
      // Degenerate — re-use previous tangent so the ribbon doesn't
      // pinch to a point at zero-length segments.
      tan = prevTan;
    } else {
      tan = { x: tx / tLen, y: ty / tLen };
      prevTan = tan;
    }
    // Perpendicular = rotate tangent 90° (CCW in math coords).
    perps.push({ x: -tan.y, y: tan.x });
  }

  // Build left/right rails.
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = totalLen > 0 ? cumLen[i]! / totalLen : 0;
    const profile = sampleProfile(widthProfile, t);
    const halfW = (baseWidth * profile) / 2;
    const pt = points[i]!;
    const px = perps[i]!.x;
    const py = perps[i]!.y;
    left.push({ x: pt.x + px * halfW, y: pt.y + py * halfW });
    right.push({ x: pt.x - px * halfW, y: pt.y - py * halfW });
  }

  // Emit the closed polygon: forward along left rail, backward along right.
  const parts: string[] = [`M${fmt(left[0]!.x)} ${fmt(left[0]!.y)}`];
  for (let i = 1; i < n; i++) {
    parts.push(`L${fmt(left[i]!.x)} ${fmt(left[i]!.y)}`);
  }
  for (let i = n - 1; i >= 0; i--) {
    parts.push(`L${fmt(right[i]!.x)} ${fmt(right[i]!.y)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/**
 * Linear interpolation of the brush profile at normalized position
 * `t ∈ [0, 1]`. Empty profile = uniform 1.0 (treated as no
 * modulation). Single-sample profile = that constant. Multi-sample
 * profiles use the `t * (N-1)` index and linearly blend the two
 * neighbors.
 *
 * Exported for unit tests + reuse by future brush UIs (preview
 * thumbnails that need the same sampling).
 */
export function sampleProfile(profile: readonly number[], t: number): number {
  if (profile.length === 0) return 1;
  if (profile.length === 1) return profile[0]!;
  const clamped = Math.max(0, Math.min(1, t));
  const idx = clamped * (profile.length - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(profile.length - 1, i0 + 1);
  const frac = idx - i0;
  const v0 = profile[i0]!;
  const v1 = profile[i1]!;
  return v0 + (v1 - v0) * frac;
}

/** Compact numeric formatter — drops trailing zeros, sub-pixel precision. */
function fmt(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}
