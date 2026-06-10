import { bbox, generateNodeId } from 'svg-engine/core';
import { gridTargetsNear, rectsToSnapTargets, resolveSnap, type SnapTarget } from './snap-resolver';

describe('rectsToSnapTargets', () => {
  it('emits 6 targets per rect (low/center/high on each axis)', () => {
    const id = generateNodeId();
    const t = rectsToSnapTargets([{ id, bbox: bbox(10, 20, 100, 50) }]);
    expect(t.length).toBe(6);
    expect(t.filter((x) => x.axis === 'x').map((x) => x.value)).toEqual([10, 60, 110]);
    expect(t.filter((x) => x.axis === 'y').map((x) => x.value)).toEqual([20, 45, 70]);
    for (const target of t) {
      expect(target.source).toBe('object');
      expect(target.objectId).toBe(id);
    }
  });

  it('returns empty for empty input', () => {
    expect(rectsToSnapTargets([])).toEqual([]);
  });
});

describe('gridTargetsNear', () => {
  it('emits grid lines around the rect on the given axis', () => {
    const t = gridTargetsNear(bbox(15, 0, 25, 10), 10, 'x');
    // moving x range = 15..40, with ±10 buffer = 5..50, k=0..5
    expect(t.map((x) => x.value)).toEqual([0, 10, 20, 30, 40, 50]);
    for (const target of t) {
      expect(target.axis).toBe('x');
      expect(target.source).toBe('grid');
    }
  });

  it('handles negative coordinates', () => {
    const t = gridTargetsNear(bbox(-30, 0, 25, 10), 10, 'x');
    // x range = -30..-5, ±10 = -40..5, k=-4..1
    expect(t.map((x) => x.value)).toEqual([-40, -30, -20, -10, 0, 10]);
  });

  it('returns empty when gridSize ≤ 0 or non-finite', () => {
    expect(gridTargetsNear(bbox(0, 0, 10, 10), 0, 'x')).toEqual([]);
    expect(gridTargetsNear(bbox(0, 0, 10, 10), -5, 'x')).toEqual([]);
    expect(gridTargetsNear(bbox(0, 0, 10, 10), Number.NaN, 'x')).toEqual([]);
  });

  it('anchors the lattice at `origin` (page-anchored grid)', () => {
    // Same rect/gridSize as the first test, but the page starts at x=5, so
    // the lattice is 5 + k·10 — matching a grid drawn from the page origin.
    const t = gridTargetsNear(bbox(15, 0, 25, 10), 10, 'x', 5);
    expect(t.map((x) => x.value)).toEqual([5, 15, 25, 35, 45, 55]);
  });
});

describe('resolveSnap', () => {
  function gridT(axis: 'x' | 'y', value: number): SnapTarget {
    return { axis, value, source: 'grid' };
  }

  it('returns zero delta when no targets are within threshold', () => {
    const r = resolveSnap(bbox(10, 10, 20, 20), [gridT('x', 100), gridT('y', 200)], 5);
    expect(r.delta).toEqual({ x: 0, y: 0 });
    expect(r.guides).toEqual([]);
  });

  it('snaps low edge to a target on x', () => {
    const r = resolveSnap(bbox(11, 0, 10, 10), [gridT('x', 10)], 5);
    expect(r.delta).toEqual({ x: -1, y: 0 });
    expect(r.guides).toEqual([{ axis: 'x', value: 10, source: 'grid' }]);
  });

  it('snaps center to a target on y', () => {
    // center y = 50, target y = 51 → delta y = +1
    const r = resolveSnap(bbox(0, 45, 10, 10), [gridT('y', 51)], 5);
    expect(r.delta).toEqual({ x: 0, y: 1 });
    expect(r.guides).toEqual([{ axis: 'y', value: 51, source: 'grid' }]);
  });

  it('snaps high edge to a target on x', () => {
    // high x = 30, target x = 32 → delta x = +2
    const r = resolveSnap(bbox(20, 0, 10, 10), [gridT('x', 32)], 5);
    expect(r.delta).toEqual({ x: 2, y: 0 });
  });

  it('picks the closest target per axis when multiple are within threshold', () => {
    // Moving features x: 10, 510, 1010 (very wide rect — no center/high collisions)
    // Targets 12 (dist 2 from low) and 14 (dist 4 from low) → 12 wins.
    const r = resolveSnap(bbox(10, 0, 1000, 10), [gridT('x', 14), gridT('x', 12)], 5);
    expect(r.delta.x).toBeCloseTo(2);
    expect(r.guides[0]?.value).toBe(12);
  });

  it('considers all 3 features (low/center/high) and picks the closest pairing', () => {
    // Moving features: 10, 15, 20. Target at 16 → closest is center (15), dist 1.
    const r = resolveSnap(bbox(10, 0, 10, 10), [gridT('x', 16)], 5);
    // delta = target - chosen feature = 16 - 15 = 1
    expect(r.delta.x).toBe(1);
  });

  it('snaps both axes independently', () => {
    const r = resolveSnap(bbox(11, 22, 10, 10), [gridT('x', 10), gridT('y', 20)], 5);
    expect(r.delta).toEqual({ x: -1, y: -2 });
    expect(r.guides.length).toBe(2);
  });

  it('returns empty result for threshold ≤ 0', () => {
    const r = resolveSnap(bbox(11, 0, 10, 10), [gridT('x', 10)], 0);
    expect(r.delta).toEqual({ x: 0, y: 0 });
    expect(r.guides).toEqual([]);
  });

  it('returns empty result for empty target list', () => {
    const r = resolveSnap(bbox(0, 0, 10, 10), [], 999);
    expect(r.guides).toEqual([]);
    expect(r.delta).toEqual({ x: 0, y: 0 });
  });

  it('respects threshold strictly (= threshold counts as snap)', () => {
    // distance exactly at threshold is included
    const r = resolveSnap(bbox(15, 0, 10, 10), [gridT('x', 10)], 5);
    expect(r.delta.x).toBe(-5);
  });

  it('preserves target source in the emitted guide', () => {
    const objId = generateNodeId();
    const r = resolveSnap(
      bbox(11, 0, 10, 10),
      [{ axis: 'x', value: 10, source: 'object', objectId: objId }],
      5,
    );
    expect(r.guides[0]).toEqual({ axis: 'x', value: 10, source: 'object' });
  });
});
