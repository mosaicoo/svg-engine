/**
 * Axis-aligned bounding box in document coordinates. Immutable.
 */
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Build a bounding box. Throws when width or height is negative. */
export function bbox(x: number, y: number, width: number, height: number): BoundingBox {
  if (width < 0 || height < 0) {
    throw new RangeError(`BoundingBox dimensions must be non-negative: ${width}x${height}`);
  }
  return { x, y, width, height };
}

/** Compute the union of two bounding boxes. */
export function unionBBox(a: BoundingBox, b: BoundingBox): BoundingBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

/** Test whether a point lies within (or on the edge of) a bounding box. */
export function containsPoint(box: BoundingBox, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

/**
 * Test whether two axis-aligned bounding boxes intersect (overlap by at
 * least one shared point including edges). Symmetric: `intersectsBBox(a, b)`
 * equals `intersectsBBox(b, a)`.
 *
 * Used by viewport culling (Fase 6b-2) to decide whether a node's bbox
 * overlaps the visible viewBox — if not, the node can be culled from
 * the SVG render tree without changing visible output.
 */
export function intersectsBBox(a: BoundingBox, b: BoundingBox): boolean {
  return (
    a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
  );
}
