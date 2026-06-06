import type { Point } from 'svg-engine/core';
import { describe, expect, it } from 'vitest';
import { cubicPointAt, nearestTOnCubic } from './cubic-nearest';

/**
 * Geometry helper behind the "double-click a segment to insert an anchor
 * at the click location" gesture (Direct Select, market convention).
 *
 * The fixtures use equally-spaced collinear control points, which make
 * the cubic a straight line with a LINEAR parameterization (x = 30·t),
 * so the expected `t` for a given x is exact and easy to reason about.
 */
const P0: Point = { x: 0, y: 0 };
const P1: Point = { x: 10, y: 0 };
const P2: Point = { x: 20, y: 0 };
const P3: Point = { x: 30, y: 0 };

describe('cubicPointAt', () => {
  it('returns the endpoints at t=0 and t=1', () => {
    expect(cubicPointAt(P0, P1, P2, P3, 0)).toEqual({ x: 0, y: 0 });
    expect(cubicPointAt(P0, P1, P2, P3, 1)).toEqual({ x: 30, y: 0 });
  });

  it('is linear for equally-spaced collinear control points (x = 30·t)', () => {
    expect(cubicPointAt(P0, P1, P2, P3, 0.25).x).toBeCloseTo(7.5, 6);
    expect(cubicPointAt(P0, P1, P2, P3, 0.5).x).toBeCloseTo(15, 6);
    expect(cubicPointAt(P0, P1, P2, P3, 0.75).x).toBeCloseTo(22.5, 6);
  });
});

describe('nearestTOnCubic', () => {
  it('recovers t for a point lying exactly on the curve', () => {
    const onCurve = cubicPointAt(P0, P1, P2, P3, 0.3);
    expect(nearestTOnCubic(P0, P1, P2, P3, onCurve)).toBeCloseTo(0.3, 3);
  });

  it('projects an off-curve point onto the nearest t (perpendicular)', () => {
    // Directly above x=7.5 → nearest point is (7.5, 0) → t ≈ 0.25.
    expect(nearestTOnCubic(P0, P1, P2, P3, { x: 7.5, y: 5 })).toBeCloseTo(0.25, 3);
  });

  it('clamps to the endpoints for points beyond the curve extent', () => {
    expect(nearestTOnCubic(P0, P1, P2, P3, { x: -100, y: 0 })).toBeCloseTo(0, 2);
    expect(nearestTOnCubic(P0, P1, P2, P3, { x: 100, y: 0 })).toBeCloseTo(1, 2);
  });

  it('finds the apex t of a symmetric arch (handles pulled up)', () => {
    // Symmetric arc: peak at t=0.5. A target above the centre projects there.
    const a0: Point = { x: 0, y: 0 };
    const a1: Point = { x: 0, y: -40 };
    const a2: Point = { x: 30, y: -40 };
    const a3: Point = { x: 30, y: 0 };
    expect(nearestTOnCubic(a0, a1, a2, a3, { x: 15, y: -100 })).toBeCloseTo(0.5, 2);
  });
});
