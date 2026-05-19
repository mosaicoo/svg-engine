/**
 * Affine 2D transformation expressed as a 6-element matrix in column-major
 * order, matching SVG's `matrix(a, b, c, d, e, f)` notation:
 *
 *     | a  c  e |
 *     | b  d  f |
 *     | 0  0  1 |
 *
 * Where `(a, b)` are the first column, `(c, d)` the second, and `(e, f)`
 * the translation.
 *
 * The matrix is **immutable**; all helpers return new arrays.
 */
export type Transform = readonly [a: number, b: number, c: number, d: number, e: number, f: number];

export const IDENTITY_TRANSFORM: Transform = [1, 0, 0, 1, 0, 0];

/** Build a translation-only transform. */
export function translate(tx: number, ty: number): Transform {
  return [1, 0, 0, 1, tx, ty];
}

/** Build a uniform-scale transform around the origin. */
export function scale(sx: number, sy: number = sx): Transform {
  return [sx, 0, 0, sy, 0, 0];
}

/** Build a rotation transform (in radians) around the origin. */
export function rotate(angleRad: number): Transform {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return [cos, sin, -sin, cos, 0, 0];
}

/** Multiply two transforms (left * right) and return the resulting matrix. */
export function multiply(left: Transform, right: Transform): Transform {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

/** Apply this transform to a point and return the resulting point. */
export function applyTransform(
  transform: Transform,
  x: number,
  y: number,
): { readonly x: number; readonly y: number } {
  const [a, b, c, d, e, f] = transform;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

/**
 * Invert an affine 2D transform. Returns the matrix `M⁻¹` such that
 * `M ⋅ M⁻¹ = identity`. Throws when the matrix is non-invertible
 * (determinant ≈ 0 — a degenerate scale-to-zero or shear collapse).
 *
 * Formula (matrix in column-major `[a c e; b d f; 0 0 1]`):
 *   det = a·d − b·c
 *   M⁻¹ = [ d/det, −b/det, −c/det, a/det,
 *          (c·f − d·e)/det, (b·e − a·f)/det ]
 *
 * Used by `TransformService.startResize` to project the doc-space
 * pointer + anchor into the node's parent-local frame, so resize
 * math runs in the correct coordinate system even when the parent
 * carries a rotation or non-uniform scale.
 */
export function invert(transform: Transform): Transform {
  const [a, b, c, d, e, f] = transform;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) {
    throw new RangeError(
      `invert: matrix is non-invertible (det=${det}); cannot project into local frame.`,
    );
  }
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** Whether a transform is the identity (within floating-point epsilon). */
export function isIdentity(transform: Transform, epsilon = 1e-9): boolean {
  const [a, b, c, d, e, f] = transform;
  return (
    Math.abs(a - 1) < epsilon &&
    Math.abs(b) < epsilon &&
    Math.abs(c) < epsilon &&
    Math.abs(d - 1) < epsilon &&
    Math.abs(e) < epsilon &&
    Math.abs(f) < epsilon
  );
}
