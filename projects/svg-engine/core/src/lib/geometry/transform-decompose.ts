import {
  IDENTITY_TRANSFORM,
  multiply,
  rotate,
  scale,
  translate,
  type Transform,
} from '../types/transform';

/**
 * Decomposition of a 2D affine `Transform` matrix into the canonical
 * components a user would see in an editor inspector (Item 5 —
 * débito 4c-Polish).
 *
 * **Decomposition order**: `T · R · S` (translation, then rotation,
 * then non-uniform scale around the origin). This is the order most
 * editors use because it matches user intuition: "move it, then turn
 * it, then size it".
 *
 * - `tx`, `ty`: translation components (always exact — read directly
 *   from `transform[4]`, `transform[5]`)
 * - `rotationRad`: rotation in radians, range `[-π, π]`
 * - `scaleX`, `scaleY`: signed scale factors. Sign can flip when the
 *   matrix encodes a reflection (e.g., negative scale)
 *
 * **Skew is NOT decomposed**: the editor doesn't currently let users
 * apply skew, and conflating skew + non-uniform scale produces
 * ambiguous decompositions. If a skewed matrix arrives (from imported
 * SVG), the decomposition assumes uniform scale + rotation and the
 * recomposition may differ from the original. Documented limitation.
 *
 * Pure: no service access, no DOM. Worker-safe.
 */
export interface DecomposedTransform {
  readonly tx: number;
  readonly ty: number;
  readonly rotationRad: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

/**
 * Decompose a 2D affine transform matrix into translation, rotation,
 * and scale components. See {@link DecomposedTransform} for ordering
 * and limitations.
 *
 * **Math**: given `[a, b, c, d, e, f]` (column-major `[[a,c,e],[b,d,f]]`),
 * - `tx = e`, `ty = f`
 * - `rotation = atan2(b, a)` (angle of the first column from +X axis)
 * - `scaleX = sign(a) · √(a² + b²)` (magnitude of first column)
 * - `scaleY = sign(d') · √(c² + d²)` where `d' = a*d - b*c` (det sign
 *   preserves Y-flip information; without it both sX and sY would
 *   always come out positive and reflections would silently round-trip
 *   to "rotation only")
 *
 * Returns the identity decomposition for the identity matrix
 * (rotation 0, scale 1, translation 0).
 */
export function decomposeTransform(t: Transform): DecomposedTransform {
  const [a, b, c, d, e, f] = t;
  const tx = e;
  const ty = f;
  const rotationRad = Math.atan2(b, a);
  // Magnitude of first column = |scaleX|; sign from `a` since rotation
  // by an angle close to 0 leaves `a` ≈ scaleX directly.
  const sxMag = Math.hypot(a, b);
  // For scaleY: project second column onto axis perpendicular to first.
  // The Y-component of that projection IS the signed scaleY (det-aware).
  // Det = a*d - b*c; det > 0 → no reflection; det < 0 → Y-axis flipped.
  const det = a * d - b * c;
  const syMag = Math.hypot(c, d);
  const scaleX = sxMag === 0 ? 0 : sxMag;
  const scaleY = syMag === 0 ? 0 : det < 0 ? -syMag : syMag;
  return { tx, ty, rotationRad, scaleX, scaleY };
}

/**
 * Inverse of {@link decomposeTransform}: build a `Transform` from
 * decomposed components. Composes as `T(tx, ty) · R(rotation) · S(sx, sy)`
 * — same order as the decomposition assumption, so round-trip is
 * stable for transforms that started without skew.
 */
export function composeTransform(d: DecomposedTransform): Transform {
  // Compose right-to-left: scale first, then rotate, then translate.
  let m: Transform = IDENTITY_TRANSFORM;
  if (d.scaleX !== 1 || d.scaleY !== 1) m = multiply(m, scale(d.scaleX, d.scaleY));
  if (d.rotationRad !== 0) m = multiply(rotate(d.rotationRad), m);
  if (d.tx !== 0 || d.ty !== 0) m = multiply(translate(d.tx, d.ty), m);
  return m;
}
