import { TestBed } from '@angular/core/testing';
import { type BoundingBox, createGroup, createRect, EditorStateService } from 'svg-engine/core';
import { describe, expect, it } from 'vitest';

import { provideSvgEngineEditorScope } from '../scope/editor-scope.providers';
import { SelectionService } from '../selection/selection.service';
import {
  fitImportTransform,
  ImportPlacementService,
  type PendingImport,
  rectFromPoints,
  stretchImportTransform,
} from './import-placement.service';

const SRC: BoundingBox = { x: 0, y: 0, width: 100, height: 100 };

function makePending(defs?: string): PendingImport {
  return {
    group: createGroup([createRect({ x: 0, y: 0, width: 100, height: 100 })]),
    src: SRC,
    defs,
  };
}

describe('fitImportTransform (D-107)', () => {
  it('fits preserving aspect ratio, centered in the rect', () => {
    // 100×100 art into a 50×100 rect → scale by the limiting axis (0.5),
    // centered: art ends up 50×50 spanning x∈[0,50] (full width) and
    // y∈[25,75] (centered vertically).
    const t = fitImportTransform(SRC, { x: 0, y: 0, width: 50, height: 100 });
    expect(t).toEqual([0.5, 0, 0, 0.5, 0, 25]);
  });

  it('a near-zero rect (a click) drops the art at natural 1:1, centered on the point', () => {
    const t = fitImportTransform(SRC, { x: 30, y: 40, width: 1, height: 1 });
    // scale 1; translate so the art center (50,50) lands on the click (~30.5,40.5)
    expect(t[0]).toBe(1);
    expect(t[3]).toBe(1);
    expect(t[4]).toBeCloseTo(-19.5, 6);
    expect(t[5]).toBeCloseTo(-9.5, 6);
  });

  it('guards zero source dimensions (no divide-by-zero / NaN)', () => {
    const t = fitImportTransform(
      { x: 0, y: 0, width: 0, height: 0 },
      { x: 0, y: 0, width: 40, height: 40 },
    );
    expect(t.every((n) => Number.isFinite(n))).toBe(true);
  });
});

describe('stretchImportTransform (D-108)', () => {
  it('maps the source box exactly onto the rect with independent X/Y scale', () => {
    // 100×100 art into a 200×100 rect → sx=2, sy=1 (distorts), filling the
    // rectangle corner-to-corner with no centering offset.
    const t = stretchImportTransform(SRC, { x: 0, y: 0, width: 200, height: 100 });
    expect(t).toEqual([2, 0, 0, 1, 0, 0]);
  });

  it('offsets so a non-origin rect still maps corner-to-corner', () => {
    const t = stretchImportTransform(SRC, { x: 10, y: 20, width: 50, height: 50 });
    // sx=sy=0.5; tx=10-0.5*0=10; ty=20.
    expect(t).toEqual([0.5, 0, 0, 0.5, 10, 20]);
  });

  it('a near-zero rect (a click) falls back to natural 1:1 at the point', () => {
    const t = stretchImportTransform(SRC, { x: 30, y: 40, width: 1, height: 1 });
    expect(t[0]).toBe(1);
    expect(t[3]).toBe(1);
    expect(t[4]).toBeCloseTo(-19.5, 6);
    expect(t[5]).toBeCloseTo(-9.5, 6);
  });
});

describe('rectFromPoints (D-107)', () => {
  it('normalizes a bottom-up / right-to-left drag into a positive box', () => {
    expect(rectFromPoints({ x: 50, y: 50 }, { x: 10, y: 30 })).toEqual({
      x: 10,
      y: 30,
      width: 40,
      height: 20,
    });
  });
});

describe('ImportPlacementService (D-107)', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideSvgEngineEditorScope()] });
    return {
      placement: TestBed.inject(ImportPlacementService),
      state: TestBed.inject(EditorStateService),
      selection: TestBed.inject(SelectionService),
    };
  }

  it('begin() exposes the pending import and clears any prior rect', () => {
    const { placement } = setup();
    const pending = makePending();
    placement.begin(pending);
    expect(placement.pending()).toBe(pending);
    expect(placement.rect()).toBeNull();
    expect(placement.isActive).toBe(true);
  });

  it('beginDrag/updateDrag drive the live rectangle', () => {
    const { placement } = setup();
    placement.begin(makePending());
    placement.beginDrag({ x: 10, y: 10 });
    placement.updateDrag({ x: 60, y: 40 });
    expect(placement.rect()).toEqual({ x: 10, y: 10, width: 50, height: 30 });
  });

  it('commitDrag inserts the fitted art, selects it, and clears pending', () => {
    const { placement, state, selection } = setup();
    placement.begin(makePending());
    placement.beginDrag({ x: 0, y: 0 });
    placement.updateDrag({ x: 50, y: 100 });
    placement.commitDrag();

    const root = state.document().root;
    expect(root.type === 'group' && root.children.length).toBe(1);
    expect(selection.selectedIds().size).toBe(1);
    expect(placement.pending()).toBeNull();
    expect(placement.rect()).toBeNull();
  });

  it('commitDrag merges the imported defs into the document', () => {
    const { placement, state } = setup();
    placement.begin(makePending('<linearGradient id="g1"></linearGradient>'));
    placement.beginDrag({ x: 0, y: 0 });
    placement.updateDrag({ x: 50, y: 50 });
    placement.commitDrag();
    expect(state.document().defs ?? '').toContain('linearGradient id="g1"');
  });

  it('commitDrag with no drag started is a no-op that just clears pending', () => {
    const { placement, state } = setup();
    placement.begin(makePending());
    placement.commitDrag();
    const root = state.document().root;
    expect(root.type === 'group' && root.children.length).toBe(0);
    expect(placement.pending()).toBeNull();
  });

  it('placedTransform reflects the Shift (stretch) mode in real time (D-108)', () => {
    const { placement } = setup();
    placement.begin(makePending());
    placement.beginDrag({ x: 0, y: 0 });
    placement.updateDrag({ x: 200, y: 100 });
    // Default: proportional fit — uniform scale 1, centered in the wider rect
    // (the 100-wide art offsets by +50 to sit in the middle of the 200 rect).
    expect(placement.placedTransform()).toEqual([1, 0, 0, 1, 50, 0]);
    // Shift: distort-to-fill (sx=2, sy=1) — corner-to-corner, no centering.
    placement.setStretch(true);
    expect(placement.placedTransform()).toEqual([2, 0, 0, 1, 0, 0]);
    placement.setStretch(false);
    expect(placement.placedTransform()).toEqual([1, 0, 0, 1, 50, 0]);
  });

  it('commitDrag in stretch mode inserts the art with the distorting transform (D-108)', () => {
    const { placement, state } = setup();
    placement.begin(makePending());
    placement.beginDrag({ x: 0, y: 0 });
    placement.updateDrag({ x: 200, y: 100 });
    placement.setStretch(true);
    placement.commitDrag();
    const root = state.document().root;
    const inserted = root.type === 'group' ? root.children[0] : undefined;
    expect(inserted?.transform).toEqual([2, 0, 0, 1, 0, 0]);
    // Stretch resets after the gesture completes.
    expect(placement.stretch()).toBe(false);
  });

  it('cancel() drops the pending import without inserting', () => {
    const { placement, state } = setup();
    placement.begin(makePending());
    placement.beginDrag({ x: 0, y: 0 });
    placement.cancel();
    const root = state.document().root;
    expect(root.type === 'group' && root.children.length).toBe(0);
    expect(placement.pending()).toBeNull();
    expect(placement.isActive).toBe(false);
  });
});
