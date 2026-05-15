import { isIdentity, type Transform } from 'svg-engine/core';

/**
 * Serialize a {@link Transform} for the SVG `transform` attribute, e.g.
 * `matrix(1 0 0 1 10 20)`. Returns `null` for the identity transform so
 * callers can bind directly with `[attr.transform]` and omit the attribute
 * when it would be a no-op.
 */
export function renderTransformAttr(transform: Transform): string | null {
  if (isIdentity(transform)) return null;
  const [a, b, c, d, e, f] = transform;
  return `matrix(${a} ${b} ${c} ${d} ${e} ${f})`;
}
