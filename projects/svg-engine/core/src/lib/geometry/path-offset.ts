import type { Point } from '../types/point';
import { flattenPathD } from './path-flatten';
import { parsePathToAnchors } from './path-anchors';

/**
 * **D-090 — Offset Path** (Path menu). Produce a parallel copy of a
 * path, displaced by `distance` doc units along its normal. Positive
 * `distance` grows a closed shape outward; negative shrinks it inward.
 * Open subpaths are offset to one side (a parallel line).
 *
 * **Approach**: flatten curves to polylines, then offset each vertex
 * along its angle-bisector normal (miter join, clamped to avoid spikes
 * at sharp corners). This is an *approximation* — beziers become
 * polylines and deep concavities may self-intersect (not cleaned). It
 * matches the pragmatic offset most editors ship as a first pass; a
 * future polish can add curve-preserving offset + self-intersection
 * removal. Pure / deterministic.
 */

const MITER_LIMIT = 4;

function normalize(x: number, y: number): Point {
  const len = Math.hypot(x, y);
  if (len < 1e-9) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

/** Left-hand normal of the directed edge `a → b` (SVG y-down space). */
function edgeNormal(a: Point, b: Point): Point {
  const dir = normalize(b.x - a.x, b.y - a.y);
  return { x: -dir.y, y: dir.x };
}

/** Shoelace signed area of a ring (duplicate closing point tolerated). */
function signedArea(pts: readonly Point[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/** Per-vertex miter offset of a vertex given its two adjacent edge normals. */
function miterOffset(v: Point, nIn: Point | null, nOut: Point | null, distance: number): Point {
  // Endpoint of an open polyline → use the single available edge normal.
  const a = nIn ?? nOut!;
  const b = nOut ?? nIn!;
  const bis = normalize(a.x + b.x, a.y + b.y);
  if (bis.x === 0 && bis.y === 0) return { x: v.x + a.x * distance, y: v.y + a.y * distance };
  // Miter length = distance / cos(theta/2); cos = bisector · edgeNormal.
  const cos = bis.x * a.x + bis.y * a.y;
  const scale = Math.min(MITER_LIMIT, 1 / Math.max(0.0001, Math.abs(cos)));
  return { x: v.x + bis.x * distance * scale, y: v.y + bis.y * distance * scale };
}

/** Offset an OPEN polyline to one side by `distance` (parallel line). */
export function offsetPolyline(points: readonly Point[], distance: number): Point[] {
  const n = points.length;
  if (n < 2) return points.slice();
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const nIn = i > 0 ? edgeNormal(points[i - 1]!, points[i]!) : null;
    const nOut = i < n - 1 ? edgeNormal(points[i]!, points[i + 1]!) : null;
    out.push(miterOffset(points[i]!, nIn, nOut, distance));
  }
  return out;
}

/**
 * Offset a CLOSED ring by `distance`. Positive grows the area (outward),
 * negative shrinks it — regardless of the ring's winding direction
 * (resolved empirically by comparing areas, so callers don't have to
 * know the orientation). Input may include a duplicate closing point;
 * the returned ring does not.
 */
export function offsetClosedRing(points: readonly Point[], distance: number): Point[] {
  // Drop a duplicate closing vertex if present.
  const pts =
    points.length > 1 &&
    Math.abs(points[0]!.x - points[points.length - 1]!.x) < 1e-6 &&
    Math.abs(points[0]!.y - points[points.length - 1]!.y) < 1e-6
      ? points.slice(0, -1)
      : points.slice();
  const n = pts.length;
  if (n < 3) return pts;

  const offsetBy = (dist: number): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n]!;
      const cur = pts[i]!;
      const next = pts[(i + 1) % n]!;
      out.push(miterOffset(cur, edgeNormal(prev, cur), edgeNormal(cur, next), dist));
    }
    return out;
  };

  // Resolve the outward direction ONCE, independent of the distance sign:
  // probe with a tiny positive step and see whether the area grows. `s`
  // then maps "+distance → outward (expand), −distance → inward (shrink)"
  // regardless of the ring's winding order.
  const baseArea = Math.abs(signedArea(pts));
  const probe = offsetBy(1);
  const s = Math.abs(signedArea(probe)) >= baseArea ? 1 : -1;
  return offsetBy(s * distance);
}

/** Serialize a closed ring to `M..L..Z`. */
function closedRingToD(ring: readonly Point[]): string {
  if (ring.length < 3) return '';
  const parts = [`M${fmt(ring[0]!.x)} ${fmt(ring[0]!.y)}`];
  for (let i = 1; i < ring.length; i++) parts.push(`L${fmt(ring[i]!.x)} ${fmt(ring[i]!.y)}`);
  parts.push('Z');
  return parts.join(' ');
}

/** Serialize an open polyline to `M..L..` (no Z). */
function openPolylineToD(pts: readonly Point[]): string {
  if (pts.length < 2) return '';
  const parts = [`M${fmt(pts[0]!.x)} ${fmt(pts[0]!.y)}`];
  for (let i = 1; i < pts.length; i++) parts.push(`L${fmt(pts[i]!.x)} ${fmt(pts[i]!.y)}`);
  return parts.join(' ');
}

function fmt(n: number): string {
  const r = Math.round(n * 1e4) / 1e4;
  return Number.isInteger(r) ? String(r) : String(r);
}

/**
 * Offset every subpath of `d` by `distance`. Closed subpaths grow/shrink
 * (Z preserved); open subpaths become parallel polylines. Returns the
 * input unchanged when `distance` is ~0 or there's no geometry.
 */
export function offsetPathD(d: string, distance: number): string {
  if (!Number.isFinite(distance) || Math.abs(distance) < 1e-6) return d;
  const subs = parsePathToAnchors(d);
  const rings = flattenPathD(d);
  if (subs.length === 0 || rings.length === 0) return d;
  const parts: string[] = [];
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i]!;
    const closed = subs[i]?.closed ?? false;
    if (closed) {
      const off = offsetClosedRing(ring, distance);
      const dd = closedRingToD(off);
      if (dd.length > 0) parts.push(dd);
    } else {
      const off = offsetPolyline(ring, distance);
      const dd = openPolylineToD(off);
      if (dd.length > 0) parts.push(dd);
    }
  }
  return parts.length > 0 ? parts.join(' ') : d;
}
