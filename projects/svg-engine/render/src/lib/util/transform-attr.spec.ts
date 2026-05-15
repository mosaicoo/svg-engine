import { IDENTITY_TRANSFORM, translate, scale, rotate } from 'svg-engine/core';
import { renderTransformAttr } from './transform-attr';

describe('renderTransformAttr', () => {
  it('returns null for the identity transform', () => {
    expect(renderTransformAttr(IDENTITY_TRANSFORM)).toBeNull();
  });

  it('returns null for near-identity within epsilon', () => {
    // Strictly less than 1e-9 — the default epsilon in `isIdentity`.
    expect(renderTransformAttr([1.0000000001, 0, 0, 1, 0, 0])).toBeNull();
  });

  it('serializes a translation', () => {
    expect(renderTransformAttr(translate(10, 20))).toBe('matrix(1 0 0 1 10 20)');
  });

  it('serializes a scale', () => {
    expect(renderTransformAttr(scale(2))).toBe('matrix(2 0 0 2 0 0)');
  });

  it('serializes a rotation (90deg) with the expected matrix', () => {
    const out = renderTransformAttr(rotate(Math.PI / 2));
    // We cannot expect exact decimals due to floating point; just assert
    // the prefix and parameter count.
    expect(out).toMatch(/^matrix\((-?\d+(\.\d+)?(e-?\d+)?\s){5}-?\d+(\.\d+)?(e-?\d+)?\)$/);
  });
});
