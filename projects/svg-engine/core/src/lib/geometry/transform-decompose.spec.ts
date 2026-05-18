import { IDENTITY_TRANSFORM, multiply, rotate, scale, translate } from '../types/transform';
import {
  composeTransform,
  decomposeTransform,
  type DecomposedTransform,
} from './transform-decompose';

const TAU = Math.PI * 2;

function approxEqual(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) < eps;
}

function expectDecomposeApprox(
  actual: DecomposedTransform,
  expected: DecomposedTransform,
  eps = 1e-9,
): void {
  expect(approxEqual(actual.tx, expected.tx, eps)).toBe(true);
  expect(approxEqual(actual.ty, expected.ty, eps)).toBe(true);
  // Rotation may wrap around π — compare modulo TAU
  const dRot =
    ((((actual.rotationRad - expected.rotationRad) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
  expect(Math.abs(dRot) < eps).toBe(true);
  expect(approxEqual(actual.scaleX, expected.scaleX, eps)).toBe(true);
  expect(approxEqual(actual.scaleY, expected.scaleY, eps)).toBe(true);
}

describe('decomposeTransform', () => {
  it('identity → {tx:0, ty:0, rotation:0, scale:(1,1)}', () => {
    expectDecomposeApprox(decomposeTransform(IDENTITY_TRANSFORM), {
      tx: 0,
      ty: 0,
      rotationRad: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it('pure translation', () => {
    expectDecomposeApprox(decomposeTransform(translate(10, -5)), {
      tx: 10,
      ty: -5,
      rotationRad: 0,
      scaleX: 1,
      scaleY: 1,
    });
  });

  it('pure rotation 45°', () => {
    const t = rotate(Math.PI / 4);
    const d = decomposeTransform(t);
    expect(approxEqual(d.rotationRad, Math.PI / 4)).toBe(true);
    expect(approxEqual(d.scaleX, 1)).toBe(true);
    expect(approxEqual(d.scaleY, 1)).toBe(true);
  });

  it('pure non-uniform scale', () => {
    expectDecomposeApprox(decomposeTransform(scale(2, 3)), {
      tx: 0,
      ty: 0,
      rotationRad: 0,
      scaleX: 2,
      scaleY: 3,
    });
  });

  it('Y-axis reflection: scale(1, -1) → scaleY = -1', () => {
    const d = decomposeTransform(scale(1, -1));
    expect(approxEqual(d.scaleY, -1)).toBe(true);
    expect(approxEqual(d.scaleX, 1)).toBe(true);
  });

  it('composed T · R · S round-trip is stable', () => {
    const original: DecomposedTransform = {
      tx: 100,
      ty: 50,
      rotationRad: Math.PI / 6,
      scaleX: 2,
      scaleY: 1.5,
    };
    const t = composeTransform(original);
    const re = decomposeTransform(t);
    expectDecomposeApprox(re, original);
  });
});

describe('composeTransform', () => {
  it('inverse of decompose for identity', () => {
    const back = composeTransform({
      tx: 0,
      ty: 0,
      rotationRad: 0,
      scaleX: 1,
      scaleY: 1,
    });
    expect(back).toEqual(IDENTITY_TRANSFORM);
  });

  it('emits T · R · S in the canonical order (rotation runs after scale)', () => {
    // Pure scale(2, 2) then translation(10, 0) is NOT the same as
    // translation followed by scale (scales the translation too).
    // Compose order T · R · S means: T(10,0) · R(0) · S(2,2). The
    // result of multiplying that matrix by point (1,0) should give
    // (10 + 2, 0) = (12, 0). Verify via decompose round-trip.
    const t = composeTransform({ tx: 10, ty: 0, rotationRad: 0, scaleX: 2, scaleY: 2 });
    const expected = multiply(translate(10, 0), scale(2, 2));
    expect(t).toEqual(expected);
  });
});
