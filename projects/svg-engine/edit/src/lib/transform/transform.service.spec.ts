import { TestBed } from '@angular/core/testing';
import { applyTransform, bbox, generateNodeId, IDENTITY_TRANSFORM, rotate } from 'svg-engine/core';
import { SelectionService } from '../selection/selection.service';
import { TransformService } from './transform.service';

describe('TransformService — pivot management (D-022)', () => {
  let svc: TransformService;
  let selection: SelectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(TransformService);
    selection = TestBed.inject(SelectionService);
    svc.clearAllPivots();
    selection.clear();
  });

  describe('default pivot = center of bbox', () => {
    it('returns center when nothing is selected', () => {
      const b = bbox(0, 0, 100, 50);
      expect(svc.resolvePivot(b)).toEqual({ x: 50, y: 25 });
    });

    it('returns center for single selection without custom pivot', () => {
      selection.select(generateNodeId());
      const b = bbox(10, 20, 100, 50);
      expect(svc.resolvePivot(b)).toEqual({ x: 60, y: 45 });
    });

    it('returns center for multi-selection without custom pivot', () => {
      selection.selectMany([generateNodeId(), generateNodeId()]);
      const b = bbox(0, 0, 200, 100);
      expect(svc.resolvePivot(b)).toEqual({ x: 100, y: 50 });
    });
  });

  describe('setPivot (free placement)', () => {
    it('stores pivot in node-local coords for single selection', () => {
      const id = generateNodeId();
      selection.select(id);
      const b = bbox(0, 0, 100, 100);
      svc.setPivot({ x: 25, y: 50 }, b);
      expect(svc.customPivots().get(id)).toEqual({ x: 0.25, y: 0.5 });
    });

    it('survives bbox translation (because stored as local)', () => {
      const id = generateNodeId();
      selection.select(id);
      const b1 = bbox(0, 0, 100, 100);
      svc.setPivot({ x: 25, y: 75 }, b1);

      // Resolve at a translated bbox: pivot follows the node
      const b2 = bbox(50, 50, 100, 100);
      expect(svc.resolvePivot(b2)).toEqual({ x: 75, y: 125 });
    });

    it('survives bbox scaling (because stored as local)', () => {
      const id = generateNodeId();
      selection.select(id);
      const b1 = bbox(0, 0, 100, 100);
      svc.setPivot({ x: 25, y: 50 }, b1);

      const b2 = bbox(0, 0, 200, 200);
      expect(svc.resolvePivot(b2)).toEqual({ x: 50, y: 100 });
    });

    it('does nothing when nothing is selected', () => {
      svc.setPivot({ x: 10, y: 10 }, bbox(0, 0, 100, 100));
      expect(svc.customPivots().size).toBe(0);
    });
  });

  describe('setPivotAnchor (9-point picker)', () => {
    it('snaps the pivot to a named anchor', () => {
      const id = generateNodeId();
      selection.select(id);
      const b = bbox(0, 0, 100, 100);
      svc.setPivotAnchor('br', b);
      expect(svc.resolvePivot(b)).toEqual({ x: 100, y: 100 });
    });

    it('TC anchor produces top-center', () => {
      const id = generateNodeId();
      selection.select(id);
      const b = bbox(10, 20, 80, 40);
      svc.setPivotAnchor('tc', b);
      expect(svc.resolvePivot(b)).toEqual({ x: 50, y: 20 });
    });
  });

  describe('resetPivot', () => {
    it('removes the per-node entry', () => {
      const id = generateNodeId();
      selection.select(id);
      svc.setPivot({ x: 10, y: 10 }, bbox(0, 0, 100, 100));
      expect(svc.customPivots().has(id)).toBe(true);
      svc.resetPivot();
      expect(svc.customPivots().has(id)).toBe(false);
    });

    it('resolving after reset returns the center', () => {
      const id = generateNodeId();
      selection.select(id);
      const b = bbox(0, 0, 100, 100);
      svc.setPivot({ x: 90, y: 90 }, b);
      svc.resetPivot();
      expect(svc.resolvePivot(b)).toEqual({ x: 50, y: 50 });
    });
  });

  describe('persistence per node', () => {
    it('keeps pivot for one node when selection moves to another', () => {
      const a = generateNodeId();
      const c = generateNodeId();
      const bA = bbox(0, 0, 100, 100);

      selection.select(a);
      svc.setPivotAnchor('br', bA);
      expect(svc.resolvePivot(bA)).toEqual({ x: 100, y: 100 });

      selection.select(c);
      // Different node, default pivot
      const bC = bbox(0, 0, 200, 200);
      expect(svc.resolvePivot(bC)).toEqual({ x: 100, y: 100 });

      // Re-select original — pivot is restored
      selection.select(a);
      expect(svc.resolvePivot(bA)).toEqual({ x: 100, y: 100 });
    });
  });

  describe('multi-selection pivot resets on composition change', () => {
    it('clears multi pivot when the set of ids changes', () => {
      const a = generateNodeId();
      const c = generateNodeId();
      const d = generateNodeId();

      selection.selectMany([a, c]);
      svc.syncPivotForSelection();
      const b = bbox(0, 0, 200, 100);
      svc.setPivot({ x: 0, y: 0 }, b);
      expect(svc.resolvePivot(b)).toEqual({ x: 0, y: 0 });

      // Same composition — pivot survives sync
      svc.syncPivotForSelection();
      expect(svc.resolvePivot(b)).toEqual({ x: 0, y: 0 });

      // Different composition — pivot is cleared
      selection.selectMany([a, c, d]);
      svc.syncPivotForSelection();
      expect(svc.resolvePivot(b)).toEqual({ x: 100, y: 50 });
    });
  });

  describe('clearAllPivots', () => {
    it('empties all per-node pivots', () => {
      const a = generateNodeId();
      const c = generateNodeId();
      selection.select(a);
      svc.setPivot({ x: 10, y: 10 }, bbox(0, 0, 100, 100));
      selection.select(c);
      svc.setPivot({ x: 20, y: 20 }, bbox(0, 0, 100, 100));

      svc.clearAllPivots();

      expect(svc.customPivots().size).toBe(0);
    });
  });
});

describe('TransformService — OBB-aware pivot (D-142)', () => {
  let svc: TransformService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    svc = TestBed.inject(TransformService);
    svc.clearAllPivots();
  });

  const LOCAL = bbox(0, 0, 100, 100);
  // 90° about the origin → [0,1,-1,0,0,0]: maps local (x,y) → doc (-y, x).
  const ROT90 = rotate(Math.PI / 2);

  it('default (no custom pivot) resolves to the object centre through the matrix', () => {
    const id = generateNodeId();
    // local centre (50,50) → rot90 → (-50, 50)
    const p = svc.resolvePivotForNode(id, LOCAL, ROT90);
    expect(p.x).toBeCloseTo(-50, 6);
    expect(p.y).toBeCloseTo(50, 6);
  });

  it('a custom pivot is glued to the OBJECT: it follows the node as the matrix rotates', () => {
    const id = generateNodeId();
    svc.setPivotAnchorForNode(id, 'br', LOCAL); // fraction (1,1) — bottom-right

    // Identity → the br corner sits at local (100,100) in doc space.
    const atIdentity = svc.resolvePivotForNode(id, LOCAL, IDENTITY_TRANSFORM);
    expect(atIdentity.x).toBeCloseTo(100, 6);
    expect(atIdentity.y).toBeCloseTo(100, 6);

    // After a 90° rotation the SAME corner is at rot90·(100,100) = (-100,100)
    // — the pivot tracks the object's rotated corner (the D-142 fix). The
    // legacy AABB resolver would instead land on the enclosure corner.
    const atRot = svc.resolvePivotForNode(id, LOCAL, ROT90);
    const trueCorner = applyTransform(ROT90, 100, 100);
    expect(atRot.x).toBeCloseTo(trueCorner.x, 6); // -100
    expect(atRot.y).toBeCloseTo(trueCorner.y, 6); // 100
  });

  it('setPivotDocForNode round-trips through the matrix (set doc → resolve doc)', () => {
    const id = generateNodeId();
    const doc = { x: -30, y: 80 };
    svc.setPivotDocForNode(id, doc, LOCAL, ROT90);
    const p = svc.resolvePivotForNode(id, LOCAL, ROT90);
    expect(p.x).toBeCloseTo(doc.x, 6);
    expect(p.y).toBeCloseTo(doc.y, 6);
  });

  it('setPivotDocForNode stores a fraction in the LOCAL frame (object space)', () => {
    const id = generateNodeId();
    // Doc point (-50,50) is rot90·(50,50): the local centre → fraction (0.5,0.5).
    svc.setPivotDocForNode(id, { x: -50, y: 50 }, LOCAL, ROT90);
    const frac = svc.customPivots().get(id);
    expect(frac?.x).toBeCloseTo(0.5, 6);
    expect(frac?.y).toBeCloseTo(0.5, 6);
  });

  it('setPivotDocForNode is a no-op for a non-invertible (degenerate) matrix', () => {
    const id = generateNodeId();
    const degenerate = [0, 0, 0, 0, 0, 0] as const;
    svc.setPivotDocForNode(id, { x: 10, y: 10 }, LOCAL, degenerate);
    expect(svc.customPivots().has(id)).toBe(false);
  });

  it('setPivotFractionForNode restores an exact fraction; clearPivotForNode removes one node only', () => {
    const a = generateNodeId();
    const c = generateNodeId();
    svc.setPivotFractionForNode(a, { x: 0.25, y: 0.75 });
    svc.setPivotFractionForNode(c, { x: 0, y: 0 });
    expect(svc.customPivots().get(a)).toEqual({ x: 0.25, y: 0.75 });

    svc.clearPivotForNode(a);
    expect(svc.customPivots().has(a)).toBe(false);
    expect(svc.customPivots().has(c)).toBe(true); // untouched
  });
});
