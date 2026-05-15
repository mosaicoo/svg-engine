import { TestBed } from '@angular/core/testing';
import { bbox, generateNodeId } from 'svg-engine/core';
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
