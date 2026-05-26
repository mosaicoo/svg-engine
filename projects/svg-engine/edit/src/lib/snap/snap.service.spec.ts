import { TestBed } from '@angular/core/testing';
import { bbox, generateNodeId } from 'svg-engine/core';
import { SnapService } from './snap.service';

function setup() {
  TestBed.configureTestingModule({});
  const svc = TestBed.inject(SnapService);
  // Reset to defaults across tests
  svc.setEnabled(true);
  svc.setMode('both');
  svc.setGridSize(10);
  svc.setThresholdPx(8);
  svc.clearActiveGuides();
  return svc;
}

describe('SnapService — config signals', () => {
  it('exposes default values', () => {
    const svc = setup();
    expect(svc.enabled()).toBe(true);
    expect(svc.mode()).toBe('both');
    expect(svc.gridSize()).toBe(10);
    expect(svc.thresholdPx()).toBe(8);
  });

  it('setEnabled toggles + clears active guides when disabling', () => {
    const svc = setup();
    svc.setActiveGuides([{ axis: 'x', value: 10, source: 'grid' }]);
    expect(svc.hasActiveGuides()).toBe(true);
    svc.setEnabled(false);
    expect(svc.enabled()).toBe(false);
    expect(svc.hasActiveGuides()).toBe(false);
  });

  it('setMode mutates the mode signal', () => {
    const svc = setup();
    svc.setMode('grid');
    expect(svc.mode()).toBe('grid');
    svc.setMode('objects');
    expect(svc.mode()).toBe('objects');
  });

  it('setGridSize ignores invalid values', () => {
    const svc = setup();
    svc.setGridSize(20);
    expect(svc.gridSize()).toBe(20);
    svc.setGridSize(-5);
    expect(svc.gridSize()).toBe(20);
    svc.setGridSize(0);
    expect(svc.gridSize()).toBe(20);
    svc.setGridSize(Number.NaN);
    expect(svc.gridSize()).toBe(20);
  });

  it('setThresholdPx accepts 0 (disable snap range) but rejects NaN/Infinity', () => {
    const svc = setup();
    svc.setThresholdPx(0);
    expect(svc.thresholdPx()).toBe(0);
    svc.setThresholdPx(-1);
    expect(svc.thresholdPx()).toBe(0);
    svc.setThresholdPx(Number.POSITIVE_INFINITY);
    expect(svc.thresholdPx()).toBe(0);
  });
});

describe('SnapService — active guides', () => {
  it('starts empty', () => {
    const svc = setup();
    expect(svc.activeGuides()).toEqual([]);
    expect(svc.hasActiveGuides()).toBe(false);
  });

  it('setActiveGuides + clearActiveGuides round-trip', () => {
    const svc = setup();
    svc.setActiveGuides([
      { axis: 'x', value: 10, source: 'grid' },
      { axis: 'y', value: 20, source: 'object' },
    ]);
    expect(svc.activeGuides().length).toBe(2);
    expect(svc.hasActiveGuides()).toBe(true);
    svc.clearActiveGuides();
    expect(svc.activeGuides()).toEqual([]);
  });
});

describe('SnapService — resolveForMove', () => {
  it('returns zero delta + no guides when disabled', () => {
    const svc = setup();
    svc.setEnabled(false);
    const r = svc.resolveForMove(bbox(11, 0, 10, 10), []);
    expect(r.delta).toEqual({ x: 0, y: 0 });
    expect(r.guides).toEqual([]);
  });

  it('snaps to grid in grid mode', () => {
    const svc = setup();
    svc.setMode('grid');
    svc.setGridSize(10);
    svc.setThresholdPx(5);
    // moving low x = 11, nearest grid = 10 → delta -1
    const r = svc.resolveForMove(bbox(11, 0, 10, 10), [], 1);
    expect(r.delta.x).toBe(-1);
  });

  it('snaps to objects in objects mode (excludes grid)', () => {
    const svc = setup();
    svc.setMode('objects');
    svc.setGridSize(10);
    svc.setThresholdPx(5);
    const otherId = generateNodeId();
    // Wide moving rect → features 11 / 511 / 1011. Static object L=13 / C=15.5 / R=18.
    // Closest pair: low(11) ↔ L(13), dist 2.
    const r = svc.resolveForMove(
      bbox(11, 0, 1000, 10),
      [{ id: otherId, bbox: bbox(13, 0, 5, 5) }],
      1,
    );
    expect(r.delta.x).toBe(2);
    expect(r.guides[0]?.source).toBe('object');
    // Grid mode would have produced a different snap (target 10 grid); confirm we ignored it.
    expect(r.guides[0]?.value).toBe(13);
  });

  it('snaps to whichever is closest in both mode (objects win on tie — PRO-GAP-FIX B2)', () => {
    const svc = setup();
    svc.setMode('both');
    svc.setGridSize(10);
    svc.setThresholdPx(5);
    const otherId = generateNodeId();
    // Wide moving rect → low feature x=11 only (other features 1011/2011 far away).
    // Grid 10 (dist 1), object L=12 (dist 1) — tie. **PRO-GAP-FIX B2**:
    // objects emitted FIRST, so they win on tie (Illustrator/Affinity
    // convention — sibling shape alignment is semantically richer than
    // grid alignment). Without this ordering, dense grid lines pre-empt
    // every potential object snap and 'both' degenerates into 'grid'.
    const r = svc.resolveForMove(
      bbox(11, 0, 2000, 10),
      [{ id: otherId, bbox: bbox(12, 0, 5, 5) }],
      1,
    );
    // Snap target now = object L (x=12), not grid 10 → low feature
    // 11 moves +1 to land on 12.
    expect(r.delta.x).toBeCloseTo(1);
    expect(r.guides[0]?.source).toBe('object');
    expect(r.guides[0]?.value).toBe(12);
  });

  it('still picks grid when grid is STRICTLY closer than any object in both mode', () => {
    const svc = setup();
    svc.setMode('both');
    svc.setGridSize(10);
    svc.setThresholdPx(5);
    const otherId = generateNodeId();
    // Wide moving rect, low x = 19. Grid 20 → dist 1. Object L=22 → dist 3.
    // Object win-on-tie does NOT override "strictly closer wins": grid
    // remains the snap target here. Proves the fix only flips tie
    // behavior, not the underlying distance ordering.
    const r = svc.resolveForMove(
      bbox(19, 0, 2000, 10),
      [{ id: otherId, bbox: bbox(22, 0, 5, 5) }],
      1,
    );
    expect(r.delta.x).toBeCloseTo(1);
    expect(r.guides[0]?.source).toBe('grid');
    expect(r.guides[0]?.value).toBe(20);
  });

  it('scales the threshold by 1/zoom (denser snap range when zoomed in)', () => {
    const svc = setup();
    svc.setMode('grid');
    svc.setGridSize(10);
    svc.setThresholdPx(8);
    // Moving features: 13, 15, 17. Grid lines: 10, 20. Best pair: low 13 ↔ 10 (dist 3).
    // At zoom=4 threshold in doc = 2 → 3 > 2 → no snap.
    const r1 = svc.resolveForMove(bbox(13, 0, 4, 10), [], 4);
    expect(r1.delta).toEqual({ x: 0, y: 0 });
    // At zoom=1 threshold = 8 → 3 ≤ 8 → snaps low edge to 10.
    const r2 = svc.resolveForMove(bbox(13, 0, 4, 10), [], 1);
    expect(r2.delta.x).toBe(-3);
  });
});
