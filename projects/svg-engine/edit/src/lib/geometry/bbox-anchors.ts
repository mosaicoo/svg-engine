import type { BoundingBox, Point } from 'svg-engine/core';

/**
 * Identifier of each of the 9 anchor positions on a bounding box.
 * Names follow a row-major TL→BR convention used in Illustrator/Affinity
 * UI (Top-Left → Bottom-Right).
 */
export type BBoxAnchor = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

/** Ordered list of all 9 anchors (TL → BR, row-major). */
export const BBOX_ANCHORS: readonly BBoxAnchor[] = [
  'tl',
  'tc',
  'tr',
  'ml',
  'mc',
  'mr',
  'bl',
  'bc',
  'br',
] as const;

/**
 * Return the absolute coordinates of a single anchor on `bbox`.
 *
 * `tl` = top-left, `tc` = top-center, `tr` = top-right,
 * `ml` = middle-left, `mc` = middle-center,  `mr` = middle-right,
 * `bl` = bottom-left, `bc` = bottom-center, `br` = bottom-right.
 */
export function anchorPoint(bbox: BoundingBox, anchor: BBoxAnchor): Point {
  const left = bbox.x;
  const cx = bbox.x + bbox.width / 2;
  const right = bbox.x + bbox.width;
  const top = bbox.y;
  const cy = bbox.y + bbox.height / 2;
  const bottom = bbox.y + bbox.height;

  switch (anchor) {
    case 'tl':
      return { x: left, y: top };
    case 'tc':
      return { x: cx, y: top };
    case 'tr':
      return { x: right, y: top };
    case 'ml':
      return { x: left, y: cy };
    case 'mc':
      return { x: cx, y: cy };
    case 'mr':
      return { x: right, y: cy };
    case 'bl':
      return { x: left, y: bottom };
    case 'bc':
      return { x: cx, y: bottom };
    case 'br':
      return { x: right, y: bottom };
  }
}

/** Return all 9 anchor points of `bbox` keyed by their {@link BBoxAnchor}. */
export function allAnchors(bbox: BoundingBox): Readonly<Record<BBoxAnchor, Point>> {
  return {
    tl: anchorPoint(bbox, 'tl'),
    tc: anchorPoint(bbox, 'tc'),
    tr: anchorPoint(bbox, 'tr'),
    ml: anchorPoint(bbox, 'ml'),
    mc: anchorPoint(bbox, 'mc'),
    mr: anchorPoint(bbox, 'mr'),
    bl: anchorPoint(bbox, 'bl'),
    bc: anchorPoint(bbox, 'bc'),
    br: anchorPoint(bbox, 'br'),
  };
}

/**
 * Find the {@link BBoxAnchor} closest to `point`, or `null` when no anchor
 * is within `radius` distance. Used by the rotation-pivot snap-to-anchors
 * behaviour (D-022.snap): during free-drag we snap to the nearest anchor
 * when within ~5 user units, unless the consumer requested bypass.
 */
export function findNearestAnchor(
  bbox: BoundingBox,
  point: Point,
  radius: number,
): BBoxAnchor | null {
  if (!(radius > 0)) return null;
  let best: BBoxAnchor | null = null;
  let bestDistSq = radius * radius;
  for (const anchor of BBOX_ANCHORS) {
    const a = anchorPoint(bbox, anchor);
    const dx = a.x - point.x;
    const dy = a.y - point.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq) {
      bestDistSq = distSq;
      best = anchor;
    }
  }
  return best;
}
