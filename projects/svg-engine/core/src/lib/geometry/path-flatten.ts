import { parsePathToAnchors } from './path-anchors';
import type { Point } from '../types/point';

/**
 * A closed or open ring of points, the lowest-common-denominator
 * geometry that `polygon-clipping` (and most boolean-op engines)
 * understands. Curves must be FLATTENED to a polyline first.
 */
export type FlatRing = readonly Point[];

/**
 * Flatten a path `d` into one or more rings of points, suitable for
 * feeding into a polygon boolean-op engine.
 *
 * **Curves**: every cubic bezier (after Q/T → C normalization done by
 * `parsePathToAnchors`) is subdivided recursively until the resulting
 * polyline approximates the curve within `tolerance` (in doc units).
 * Default 0.5 = sub-pixel at typical zoom, visually indistinguishable
 * from the original.
 *
 * **Subpaths**: each `M` starts a new ring. Closed subpaths (ending
 * with `Z`) get their first point repeated as last when emitted,
 * matching polygon-clipping's "first === last" convention.
 *
 * **Open subpaths**: also returned, but most boolean engines IGNORE
 * open rings (they only make sense for filled shapes). Callers doing
 * Pathfinder ops on stroked-only paths need to manually close first.
 */
export function flattenPathD(d: string, tolerance = 0.5): FlatRing[] {
  const subpaths = parsePathToAnchors(d);
  const rings: FlatRing[] = [];
  for (const sub of subpaths) {
    if (sub.anchors.length === 0) continue;
    const ring: Point[] = [];
    ring.push(sub.anchors[0]!.point);
    for (let i = 1; i < sub.anchors.length; i++) {
      const a = sub.anchors[i - 1]!;
      const b = sub.anchors[i]!;
      const segment = flattenSegment(a.point, a.handleOut, b.handleIn, b.point, tolerance);
      // segment[0] === a.point (already pushed) — skip duplicate.
      for (let j = 1; j < segment.length; j++) ring.push(segment[j]!);
    }
    if (sub.closed) {
      // Optionally emit the closing segment (last → first) if it has
      // a real curve; for line-only closes a straight segment is
      // implicit and we just repeat the first point.
      const first = sub.anchors[0]!;
      const last = sub.anchors[sub.anchors.length - 1]!;
      const flatClose =
        pointsEq(last.handleOut, last.point) && pointsEq(first.handleIn, first.point);
      if (!flatClose) {
        const closing = flattenSegment(
          last.point,
          last.handleOut,
          first.handleIn,
          first.point,
          tolerance,
        );
        for (let j = 1; j < closing.length - 1; j++) ring.push(closing[j]!);
      }
      ring.push(first.point);
    }
    rings.push(ring);
  }
  return rings;
}

/**
 * Recursive de Casteljau subdivision until the curve is within
 * `tolerance` of a straight line. The tolerance is measured as the
 * maximum perpendicular distance from any control point to the
 * straight line connecting `p0 → p3`. Standard polyline-flattening.
 */
function flattenSegment(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  tolerance: number,
  out: Point[] = [p0],
  depth = 0,
): Point[] {
  // Safety cap on recursion depth — pathological inputs (zero-length
  // curves with weird control points) could otherwise spin forever.
  if (depth > 16 || segmentIsFlat(p0, p1, p2, p3, tolerance)) {
    if (out[out.length - 1] !== p3) out.push(p3);
    return out;
  }
  // Subdivide at t=0.5 (binary split — fast, simple, sufficient).
  const m01 = midpoint(p0, p1);
  const m12 = midpoint(p1, p2);
  const m23 = midpoint(p2, p3);
  const m012 = midpoint(m01, m12);
  const m123 = midpoint(m12, m23);
  const m0123 = midpoint(m012, m123);
  flattenSegment(p0, m01, m012, m0123, tolerance, out, depth + 1);
  flattenSegment(m0123, m123, m23, p3, tolerance, out, depth + 1);
  return out;
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function segmentIsFlat(p0: Point, p1: Point, p2: Point, p3: Point, tolerance: number): boolean {
  // Perpendicular distance from p1 and p2 to the line p0→p3. When both
  // are within `tolerance`, the cubic visually IS a line for the user.
  const lineDx = p3.x - p0.x;
  const lineDy = p3.y - p0.y;
  const lineLen = Math.hypot(lineDx, lineDy);
  if (lineLen < 1e-9) {
    // Degenerate (zero-length) segment — treat as flat.
    return true;
  }
  const dist = (p: Point): number => {
    const cross = (p.x - p0.x) * lineDy - (p.y - p0.y) * lineDx;
    return Math.abs(cross) / lineLen;
  };
  return dist(p1) < tolerance && dist(p2) < tolerance;
}

function pointsEq(a: Point, b: Point, eps = 1e-6): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

/**
 * Inverse of `flattenPathD` for ring data: serialize an array of
 * rings as a path `d` string. Each ring becomes `M x y L x y ... Z`.
 * Output is always closed (Z); intended for Pathfinder results
 * which always produce filled shapes.
 */
export function ringsToPathD(rings: readonly FlatRing[]): string {
  const parts: string[] = [];
  for (const ring of rings) {
    if (ring.length < 2) continue;
    parts.push(`M${fmt(ring[0]!.x)} ${fmt(ring[0]!.y)}`);
    for (let i = 1; i < ring.length; i++) {
      const p = ring[i]!;
      parts.push(`L${fmt(p.x)} ${fmt(p.y)}`);
    }
    parts.push('Z');
  }
  return parts.join(' ');
}

function fmt(n: number): string {
  return Number.isInteger(n) ? `${n}` : Number(n.toFixed(4)).toString();
}
