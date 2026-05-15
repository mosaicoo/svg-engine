import type { BoundingBox, NodeId } from 'svg-engine/core';
import type { MarqueeHitMode } from './marquee.service';

/** Pair of `(id, bbox)` consumed by `nodesInsideMarquee`. */
export interface MarqueeCandidate {
  readonly id: NodeId;
  readonly bbox: BoundingBox;
}

/**
 * Return the subset of `candidates` whose bbox is selected by `marquee`
 * under the given `mode` (D-022: drag-to-select hit-testing).
 *
 * - `'intersect'` (default): any overlap counts. Matches Illustrator,
 *   Affinity, Figma, Inkscape — friendlier for fast selections because
 *   you don't have to fully enclose the target.
 * - `'contain'`: the candidate's bbox must be **fully** inside `marquee`.
 *   Matches AutoCAD's "right-to-left window" mode.
 *
 * Pure function: no DOM, no service deps. The order of the returned
 * array preserves input order (stable for snapshot tests).
 *
 * Edge cases:
 * - Zero-area marquee (width=0 or height=0): returns an empty array
 *   regardless of mode — a click is not a marquee selection.
 * - Zero-area candidate bbox: still tested normally; in `'intersect'`
 *   mode a degenerate point counts when it touches the marquee.
 */
export function nodesInsideMarquee(
  marquee: BoundingBox,
  candidates: readonly MarqueeCandidate[],
  mode: MarqueeHitMode = 'intersect',
): readonly NodeId[] {
  if (marquee.width === 0 || marquee.height === 0) return [];
  const out: NodeId[] = [];
  for (const c of candidates) {
    const hit =
      mode === 'contain' ? rectContainsRect(marquee, c.bbox) : rectsIntersect(marquee, c.bbox);
    if (hit) out.push(c.id);
  }
  return out;
}

/**
 * Standard AABB overlap test. Two rectangles overlap when neither is
 * strictly to the left/right or above/below the other. Touching edges
 * (zero-area overlap) **do** count as overlapping — same convention as
 * Illustrator/Affinity for marquee selection.
 */
export function rectsIntersect(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}

/**
 * Whether `inner` is fully inside `outer` (including coincident edges).
 * Used for `'contain'` mode marquee selection.
 */
export function rectContainsRect(outer: BoundingBox, inner: BoundingBox): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}
