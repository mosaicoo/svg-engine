import { describe, expect, it } from 'vitest';
import { type EasingSpec, easingControlPoints, evalEasing } from './easing';

describe('easing', () => {
  it('linear is the identity and has no control points', () => {
    expect(easingControlPoints({ kind: 'linear' })).toBeNull();
    expect(evalEasing({ kind: 'linear' }, 0)).toBe(0);
    expect(evalEasing({ kind: 'linear' }, 0.37)).toBeCloseTo(0.37, 6);
    expect(evalEasing({ kind: 'linear' }, 1)).toBe(1);
  });

  it('clamps t outside [0,1]', () => {
    expect(evalEasing({ kind: 'linear' }, -0.5)).toBe(0);
    expect(evalEasing({ kind: 'easeIn' }, 1.5)).toBe(1);
  });

  it('named presets pin the endpoints (0→0, 1→1)', () => {
    for (const kind of ['easeIn', 'easeOut', 'easeInOut'] as const) {
      const spec: EasingSpec = { kind };
      expect(evalEasing(spec, 0)).toBeCloseTo(0, 6);
      expect(evalEasing(spec, 1)).toBeCloseTo(1, 6);
    }
  });

  it('named presets are monotonic non-decreasing', () => {
    for (const kind of ['easeIn', 'easeOut', 'easeInOut'] as const) {
      let prev = -Infinity;
      for (let t = 0; t <= 1.0001; t += 0.1) {
        const y = evalEasing({ kind }, t);
        expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = y;
      }
    }
  });

  it('easeIn is slow at the start, easeOut fast (midpoint ordering)', () => {
    const mid = 0.5;
    expect(evalEasing({ kind: 'easeIn' }, mid)).toBeLessThan(mid);
    expect(evalEasing({ kind: 'easeOut' }, mid)).toBeGreaterThan(mid);
    expect(evalEasing({ kind: 'easeInOut' }, mid)).toBeCloseTo(mid, 1);
  });

  it('cubicBezier echoes its points and pins the endpoints', () => {
    const spec: EasingSpec = { kind: 'cubicBezier', x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
    expect(easingControlPoints(spec)).toEqual([0.25, 0.1, 0.25, 1]);
    expect(evalEasing(spec, 0)).toBeCloseTo(0, 6);
    expect(evalEasing(spec, 1)).toBeCloseTo(1, 6);
  });
});
