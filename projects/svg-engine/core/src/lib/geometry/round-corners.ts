import { parsePathToAnchors, type AnchorSubpath } from './path-anchors';
import type { Point } from '../types/point';

/**
 * **D-055 (Item 6.4)** — Round sharp corners in a path `d` string
 * with a uniform radius. Returns a new `d` whose cusp vertices are
 * replaced by a **circular arc tangent to both edges** (a true fillet).
 *
 * **Algorithm** (per subpath):
 *
 * 1. Parse the path into anchors via {@link parsePathToAnchors}.
 * 2. Walk each anchor. A vertex is "sharp" when its anchor kind is
 *    `cusp` AND both adjacent edges are STRAIGHT (handle == point on
 *    both sides). Smooth/symmetric anchors (already-curved corners)
 *    are skipped — rounding them would do nothing visible.
 * 3. For each sharp vertex `v` between previous `p` and next `n`, with
 *    interior angle θ between the two edges:
 *    - **Tangent length** `t = R / tan(θ/2)` — the distance from `v` to
 *      each tangent point so a circle of radius `R` touches both edges.
 *      This is the key: trimming by `R` (and arcing with radius `R`)
 *      is tangent ONLY at θ = 90° (tan 45° = 1), which is why the old
 *      90°-only version mangled acute tips and reflex/obtuse corners.
 *    - Clamp `t` to `min(|v-p|, |v-n|) / 2` so adjacent corners never
 *      overrun a shared edge; the effective fillet radius becomes
 *      `t · tan(θ/2)` so the arc stays exactly tangent after clamping.
 *    - Trim each edge to its tangent point and connect them with an arc
 *      of the (effective) fillet radius.
 * 4. Re-emit the result with `M`/`L`/`A` commands.
 *
 * **Direction of the arc**: `largeArcFlag` is always `0` — the fillet
 * arc subtends the exterior angle `π − θ ∈ (0, π)`, i.e. always a minor
 * arc. The `sweepFlag` comes from the turn direction (cross product
 * `(v-p) × (n-v)`): convex and reflex corners curve opposite ways so
 * the arc always bulges toward the corner interior.
 *
 * **Open subpath endpoints** are left untouched — only INTERIOR
 * vertices get rounded. Closed subpaths get their wrap-around vertex
 * rounded too (matches the Illustrator behavior on closed shapes).
 *
 * **Returns the input unchanged** when `radius <= 0`, or when no
 * vertex is sharp. The early exit avoids a useless parse round-trip
 * for paths that don't need rounding.
 *
 * **Curves stay**: any anchor with a non-degenerate handle survives
 * with its bezier intact. Mixing rounded sharps with authored curves
 * is correct visually.
 */
export function roundPathCorners(d: string, radius: number): string {
  if (radius <= 0 || d.length === 0) return d;
  let subpaths: readonly AnchorSubpath[];
  try {
    subpaths = parsePathToAnchors(d);
  } catch {
    // Malformed path — return unchanged rather than throw. Caller
    // (renderer) shouldn't blow up on bad authored input.
    return d;
  }
  if (subpaths.length === 0) return d;

  // Optimization: if no anchor in any subpath is a sharp cusp, the
  // output would be identical to input. Skip the rebuild.
  let hasAnySharp = false;
  for (const sub of subpaths) {
    for (let i = 0; i < sub.anchors.length; i++) {
      const a = sub.anchors[i]!;
      const inStraight = ptEqual(a.handleIn, a.point);
      const outStraight = ptEqual(a.handleOut, a.point);
      if (a.kind === 'cusp' && inStraight && outStraight) {
        // Also require interior position (or closed-subpath wrap).
        const isInterior = i > 0 && i < sub.anchors.length - 1;
        if (isInterior || sub.closed) {
          hasAnySharp = true;
          break;
        }
      }
    }
    if (hasAnySharp) break;
  }
  if (!hasAnySharp) return d;

  const parts: string[] = [];
  for (const sub of subpaths) {
    if (sub.anchors.length === 0) continue;
    parts.push(emitRoundedSubpath(sub, radius));
  }
  return parts.join(' ');
}

function emitRoundedSubpath(sub: AnchorSubpath, radius: number): string {
  const anchors = sub.anchors;
  const n = anchors.length;
  if (n === 0) return '';

  // For each anchor index, decide if it's a "sharp interior cusp"
  // that we'll trim. Open subpath endpoints are never trimmed
  // (no neighbor on one side). Closed subpath wraps around.
  const trim: boolean[] = anchors.map((a, i) => {
    if (!ptEqual(a.handleIn, a.point) || !ptEqual(a.handleOut, a.point)) return false;
    if (a.kind !== 'cusp') return false;
    if (sub.closed) return true;
    return i > 0 && i < n - 1;
  });

  // For each anchor, compute the (possibly trimmed) trimIn / trimOut
  // tangent points AND the true fillet radius `arcR[i]` (0 → no arc).
  //
  // TANGENT FILLET (the corrected geometry): a circle of radius R that is
  // tangent to both straight edges touches each edge at distance
  // `t = R / tan(θ/2)` from the vertex, where θ is the interior angle of
  // the corner. Trimming each edge by `t` (NOT by `R`) and drawing an arc
  // of radius `R` between the two tangent points produces a corner that is
  // actually tangent — for ANY angle. The old code trimmed by `R` and used
  // `R` as the arc radius, which is the tangent condition ONLY at 90°
  // (tan 45° = 1); acute tips and reflex/obtuse corners came out wrong.
  const trimIn: Point[] = [];
  const trimOut: Point[] = [];
  const arcR: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = anchors[i]!;
    if (!trim[i]) {
      trimIn.push(a.point);
      trimOut.push(a.point);
      arcR.push(0);
      continue;
    }
    const prev = anchors[(i - 1 + n) % n]!;
    const next = anchors[(i + 1) % n]!;
    const inLen = dist(prev.point, a.point);
    const outLen = dist(a.point, next.point);
    // Unit vectors from the vertex toward each neighbor.
    const u = normalize(sub2(prev.point, a.point)); // V → prev
    const w = normalize(sub2(next.point, a.point)); // V → next
    // Interior angle between the two edges, unsigned, in (0, π). Same value
    // for the convex and the reflex version of a corner — only the bulge
    // direction (sweep flag, computed at emit) differs.
    const dot = Math.max(-1, Math.min(1, u.x * w.x + u.y * w.y));
    const alpha = Math.acos(dot);
    // Skip near-straight vertices (no real corner) and degenerate edges.
    if (alpha <= 1e-4 || alpha >= Math.PI - 1e-4 || inLen < 1e-9 || outLen < 1e-9) {
      trimIn.push(a.point);
      trimOut.push(a.point);
      arcR.push(0);
      continue;
    }
    const tanHalf = Math.tan(alpha / 2);
    // Tangent length for the requested radius, clamped to half of each
    // neighbor edge so adjacent corners never overrun a shared edge.
    const t = Math.min(radius / tanHalf, inLen / 2, outLen / 2);
    if (t < 1e-9) {
      trimIn.push(a.point);
      trimOut.push(a.point);
      arcR.push(0);
      continue;
    }
    // Effective fillet radius after clamping — keeps the arc exactly
    // tangent to both (trimmed) edges even when the requested radius
    // didn't fit.
    const reff = t * tanHalf;
    trimIn.push({ x: a.point.x + t * u.x, y: a.point.y + t * u.y });
    trimOut.push({ x: a.point.x + t * w.x, y: a.point.y + t * w.y });
    arcR.push(reff);
  }

  // Emit commands. For the first anchor's "start" position:
  // - Closed subpath: start at the FIRST trimIn (we'll close with a
  //   final arc + Z).
  // - Open subpath: start at anchors[0].point (untrimmed endpoint).
  const out: string[] = [];
  const startPt = sub.closed ? trimIn[0]! : anchors[0]!.point;
  out.push(`M${fmt(startPt.x)} ${fmt(startPt.y)}`);

  // For each anchor i ≥ 1, draw the edge from the PREVIOUS trimOut
  // to the CURRENT trimIn (LineTo), then if current is trimmed draw
  // the arc from trimIn to trimOut.
  for (let i = 1; i < n; i++) {
    const a = anchors[i]!;
    // Edge segment to trimIn[i]. If the previous anchor's handleOut
    // is non-degenerate OR current's handleIn is non-degenerate, the
    // original segment was a bezier — preserve it as C.
    const prev = anchors[i - 1]!;
    const prevOutCurved = !ptEqual(prev.handleOut, prev.point);
    const currInCurved = !ptEqual(a.handleIn, a.point);
    if (prevOutCurved || currInCurved) {
      // Curved segment. Use the original handles, but endpoint may be
      // trimmed — for v1, when the destination IS trimmed we just
      // shorten the endpoint to trimIn (visually slightly off near
      // the curve→corner transition, but rare to mix in practice).
      out.push(
        ` C${fmt(prev.handleOut.x)} ${fmt(prev.handleOut.y)} ${fmt(a.handleIn.x)} ${fmt(
          a.handleIn.y,
        )} ${fmt(trimIn[i]!.x)} ${fmt(trimIn[i]!.y)}`,
      );
    } else {
      out.push(` L${fmt(trimIn[i]!.x)} ${fmt(trimIn[i]!.y)}`);
    }
    if (arcR[i]! > 0) {
      // True tangent-fillet radius (computed alongside the trim above).
      const r = arcR[i]!;
      // Sweep flag depends on the corner's turn direction.
      const prevPt = anchors[(i - 1 + n) % n]!.point;
      const nextPt = anchors[(i + 1) % n]!.point;
      const sweep = turnSweep(prevPt, a.point, nextPt);
      out.push(` A${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${fmt(trimOut[i]!.x)} ${fmt(trimOut[i]!.y)}`);
    }
  }

  if (sub.closed) {
    // Final segment: from anchors[n-1].trimOut back to anchors[0].trimIn,
    // then arc at anchor 0 from trimIn[0] to trimOut[0], then Z.
    const last = anchors[n - 1]!;
    const first = anchors[0]!;
    const lastOutCurved = !ptEqual(last.handleOut, last.point);
    const firstInCurved = !ptEqual(first.handleIn, first.point);
    if (lastOutCurved || firstInCurved) {
      out.push(
        ` C${fmt(last.handleOut.x)} ${fmt(last.handleOut.y)} ${fmt(first.handleIn.x)} ${fmt(
          first.handleIn.y,
        )} ${fmt(trimIn[0]!.x)} ${fmt(trimIn[0]!.y)}`,
      );
    } else {
      out.push(` L${fmt(trimIn[0]!.x)} ${fmt(trimIn[0]!.y)}`);
    }
    if (arcR[0]! > 0) {
      const r = arcR[0]!;
      const prevPt = anchors[n - 1]!.point;
      const nextPt = anchors[1 % n]!.point;
      const sweep = turnSweep(prevPt, first.point, nextPt);
      out.push(` A${fmt(r)} ${fmt(r)} 0 0 ${sweep} ${fmt(trimOut[0]!.x)} ${fmt(trimOut[0]!.y)}`);
    }
    out.push(' Z');
  }

  return out.join('');
}

// ── Vector helpers ────────────────────────────────────────────────────

function ptEqual(a: Point, b: Point): boolean {
  // Use epsilon tolerance — handle-storage may have sub-pixel rounding
  // and we want to treat "essentially the same" as equal.
  return Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6;
}

function sub2(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function normalize(v: Point): Point {
  const len = Math.sqrt(v.x * v.x + v.y * v.y);
  if (len < 1e-9) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/**
 * Sweep flag for an SVG arc rounding the corner at `b` coming from
 * `a` going to `c`. We use the 2D cross product sign:
 * - cross > 0 → counter-clockwise turn → sweep 0 (CCW arc).
 * - cross < 0 → clockwise turn → sweep 1 (CW arc).
 *
 * SVG's `y` axis points DOWN, so visual "clockwise on screen" matches
 * mathematical "counter-clockwise" in screen coords. The flag returned
 * is what gives the visually-correct INSIDE rounding (arc bulges
 * toward the corner, not away from it).
 */
function turnSweep(a: Point, b: Point, c: Point): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const cross = ux * vy - uy * vx;
  return cross > 0 ? 1 : 0;
}

function fmt(n: number): string {
  const rounded = Math.round(n * 10000) / 10000;
  return String(rounded);
}
