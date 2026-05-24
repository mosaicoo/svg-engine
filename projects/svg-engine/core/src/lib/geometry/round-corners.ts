import { parsePathToAnchors, type AnchorSubpath } from './path-anchors';
import type { Point } from '../types/point';

/**
 * **D-055 (Item 6.4)** — Round sharp corners in a path `d` string
 * with a uniform radius. Returns a new `d` whose cusp vertices are
 * trimmed by the radius and connected by quarter-arcs.
 *
 * **Algorithm** (per subpath):
 *
 * 1. Parse the path into anchors via {@link parsePathToAnchors}.
 * 2. Walk each anchor. A vertex is "sharp" when its anchor kind is
 *    `cusp` AND both adjacent edges are STRAIGHT (handle == point on
 *    both sides). Smooth/symmetric anchors (already-curved corners)
 *    are skipped — rounding them would do nothing visible.
 * 3. For each sharp vertex `v` between previous `p` and next `n`:
 *    - Compute the per-corner radius: `min(r, |v-p| / 2, |v-n| / 2)`.
 *      Clamping to half the shorter edge prevents the rounded arc
 *      from overshooting into the neighbor — same clamp Illustrator
 *      uses on rectangles when `rx` exceeds `width / 2`.
 *    - Trim the incoming edge to end at `v - radius * normalize(v-p)`.
 *    - Trim the outgoing edge to start at `v + radius * normalize(n-v)`.
 *    - Insert a small arc between the two trim points.
 * 4. Re-emit the result with `M`/`L`/`A` commands.
 *
 * **Direction of the arc** (largeArcFlag, sweepFlag): always 0/0 for
 * the inward (convex) case and 0/1 for the outward (reflex) case.
 * The cross product `(v-p) × (n-v)` tells convex vs reflex; we set
 * the sweep flag accordingly so the arc curves AROUND the corner
 * rather than back across it.
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

  // For each anchor, compute the (possibly trimmed) trimIn and
  // trimOut points. Untrimmed anchors have trimIn === trimOut === point.
  const trimIn: Point[] = [];
  const trimOut: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = anchors[i]!;
    if (!trim[i]) {
      trimIn.push(a.point);
      trimOut.push(a.point);
      continue;
    }
    const prev = anchors[(i - 1 + n) % n]!;
    const next = anchors[(i + 1) % n]!;
    const inLen = dist(prev.point, a.point);
    const outLen = dist(a.point, next.point);
    // Clamp to half each neighbor edge → max possible safe radius.
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r <= 0) {
      trimIn.push(a.point);
      trimOut.push(a.point);
      continue;
    }
    const dirIn = normalize(sub2(a.point, prev.point)); // prev → curr
    const dirOut = normalize(sub2(next.point, a.point)); // curr → next
    trimIn.push({ x: a.point.x - r * dirIn.x, y: a.point.y - r * dirIn.y });
    trimOut.push({ x: a.point.x + r * dirOut.x, y: a.point.y + r * dirOut.y });
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
    if (trim[i]) {
      // Arc from trimIn[i] to trimOut[i], radius computed earlier.
      // Recompute r from the trim distance to ensure consistency.
      const r = dist(trimIn[i]!, a.point);
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
    if (trim[0]) {
      const r = dist(trimIn[0]!, first.point);
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
