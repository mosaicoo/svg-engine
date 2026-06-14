import type { Point } from '../types/point';
import { flattenPathD } from './path-flatten';
import { parsePathToAnchors } from './path-anchors';
import { offsetClosedRing, offsetPolyline } from './path-offset';

/**
 * **D-090 — Outline Stroke** (Path menu). Convert a stroked path into a
 * filled outline: the returned `d` describes the FILL region that the
 * stroke painted, so the caller can swap `stroke`→`fill` and drop the
 * stroke. `width` is the (constant) stroke width in the path's local
 * space; `halfW = width / 2` is offset to each side of the centerline.
 *
 * Per subpath:
 * - **Open** → a ribbon polygon: left rail (`+halfW`) forward then right
 *   rail (`-halfW`) backward, closed with `Z` (butt caps).
 * - **Closed** → a donut: an outer ring (`+halfW`) plus a reversed inner
 *   ring (`-halfW`), so a non-zero fill leaves the centre hollow.
 *
 * **Approximation**: curves are flattened to polylines first and joins
 * are mitered (clamped). Visually faithful at typical widths; not a
 * curve-preserving boolean outline. Pure / deterministic. Returns `''`
 * when `width <= 0` or there's no geometry (caller no-ops).
 */
export function outlineStrokeToPathD(d: string, width: number): string {
  if (!Number.isFinite(width) || width <= 0) return '';
  const halfW = width / 2;
  const subs = parsePathToAnchors(d);
  const rings = flattenPathD(d);
  if (subs.length === 0 || rings.length === 0) return '';

  const parts: string[] = [];
  for (let i = 0; i < rings.length; i++) {
    const poly = rings[i]!;
    if (poly.length < 2) continue;
    const closed = subs[i]?.closed ?? false;
    if (closed) {
      const outer = offsetClosedRing(poly, halfW);
      const inner = offsetClosedRing(poly, -halfW);
      const outerD = ringToClosedD(outer);
      const innerD = ringToClosedD([...inner].reverse());
      if (outerD.length > 0) parts.push(outerD);
      if (innerD.length > 0) parts.push(innerD);
    } else {
      const left = offsetPolyline(poly, halfW);
      const right = offsetPolyline(poly, -halfW);
      const ribbon = [...left, ...right.slice().reverse()];
      const ribbonD = ringToClosedD(ribbon);
      if (ribbonD.length > 0) parts.push(ribbonD);
    }
  }
  return parts.join(' ');
}

function ringToClosedD(ring: readonly Point[]): string {
  if (ring.length < 3) return '';
  const parts = [`M${fmt(ring[0]!.x)} ${fmt(ring[0]!.y)}`];
  for (let i = 1; i < ring.length; i++) parts.push(`L${fmt(ring[i]!.x)} ${fmt(ring[i]!.y)}`);
  parts.push('Z');
  return parts.join(' ');
}

function fmt(n: number): string {
  const r = Math.round(n * 1e4) / 1e4;
  return Number.isInteger(r) ? String(r) : String(r);
}
