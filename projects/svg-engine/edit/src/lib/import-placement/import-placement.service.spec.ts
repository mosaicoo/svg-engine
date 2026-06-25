import { TestBed } from '@angular/core/testing';
import {
  type BoundingBox,
  createGroup,
  createRect,
  EditorStateService,
  generateNodeId,
  type GroupNode,
  type RectNode,
  type SvgDocument,
} from '@mosaicoo/svg-engine/core';
import { describe, expect, it } from 'vitest';

import { provideSvgEngineEditorScope } from '../scope/editor-scope.providers';
import { SelectionService } from '../selection/selection.service';
import {
  fitImportTransform,
  ImportPlacementService,
  type PendingImport,
  placementBounds,
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

describe('placementBounds (D-113)', () => {
  it('returns the CONTENT bbox, not the (oversized) viewBox', () => {
    // Mirrors the reported file: a ~249×432 graphic parked in the center of a
    // 1440×810 artboard. Placement must fit the art, not the empty artboard.
    const viewBox: BoundingBox = { x: 0, y: 0, width: 1440, height: 810 };
    const art = createGroup([
      createGroup([createRect({ x: 595, y: 188, width: 249, height: 432 })]),
    ]);
    const b = placementBounds(art, viewBox);
    expect(b.x).toBeCloseTo(595, 4);
    expect(b.y).toBeCloseTo(188, 4);
    expect(b.width).toBeCloseTo(249, 4);
    expect(b.height).toBeCloseTo(432, 4);
  });

  it('falls back to the viewBox when the art has no measurable geometry', () => {
    const viewBox: BoundingBox = { x: 0, y: 0, width: 800, height: 600 };
    // Empty group → degenerate (zero-area) content box → use the viewBox.
    expect(placementBounds(createGroup([]), viewBox)).toEqual(viewBox);
  });

  it('content box drives a real fit (art fills the rect, not a sliver)', () => {
    // Regression guard for the "imported file looks empty" bug: fitting the
    // CONTENT box yields a usable scale; fitting the whole viewBox would shrink
    // the art to ~17% of the rectangle.
    const viewBox: BoundingBox = { x: 0, y: 0, width: 1440, height: 810 };
    const art = createGroup([createRect({ x: 595, y: 188, width: 249, height: 432 })]);
    const rect: BoundingBox = { x: 0, y: 0, width: 249, height: 432 };
    const contentFit = fitImportTransform(placementBounds(art, viewBox), rect);
    const viewBoxFit = fitImportTransform(viewBox, rect);
    // Content fit maps the art 1:1 onto the same-size rect (scale ≈ 1);
    // the old viewBox fit would scale it down to ≈ 0.17.
    expect(contentFit[0]).toBeCloseTo(1, 4);
    expect(viewBoxFit[0]).toBeLessThan(0.2);
  });
});

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

  it('hasDragRect is false for a bare click and true once dragged (D-108 fix)', () => {
    const { placement } = setup();
    placement.begin(makePending());
    expect(placement.hasDragRect()).toBe(false); // nothing yet
    placement.beginDrag({ x: 10, y: 10 });
    expect(placement.hasDragRect()).toBe(false); // zero-size rect = a click
    placement.updateDrag({ x: 12, y: 11 }); // sub-threshold nudge still a click
    expect(placement.hasDragRect()).toBe(false);
    placement.updateDrag({ x: 60, y: 40 }); // real drag
    expect(placement.hasDragRect()).toBe(true);
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

  // ── D-094: non-interactive additive placement (LLM no-catalog mode) ──

  function makeDoc(defs?: string, empty = false): SvgDocument {
    return {
      id: generateNodeId(),
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
      root: empty
        ? createGroup([])
        : createGroup([createRect({ x: 0, y: 0, width: 100, height: 100 })]),
      ...(defs !== undefined ? { defs } : {}),
    };
  }

  it('placeDocumentCentered inserts the doc additively, selects it, returns the id (D-094)', () => {
    const { placement, state, selection } = setup();
    const id = placement.placeDocumentCentered(makeDoc());
    expect(id).not.toBeNull();
    const root = state.document().root;
    expect(root.type === 'group' && root.children.length).toBe(1);
    expect(selection.selectedIds().size).toBe(1);
    // the returned id is the inserted node's id (centered at natural size)
    const inserted = root.type === 'group' ? root.children[0] : undefined;
    expect(inserted?.id).toBe(id);
  });

  it('placeDocumentCentered merges the imported defs into the document (D-094)', () => {
    const { placement, state } = setup();
    placement.placeDocumentCentered(makeDoc('<linearGradient id="g2"></linearGradient>'));
    expect(state.document().defs ?? '').toContain('linearGradient id="g2"');
  });

  it('placeDocumentCentered returns null for a document with no drawable content (D-094)', () => {
    const { placement, state } = setup();
    expect(placement.placeDocumentCentered(makeDoc(undefined, true))).toBeNull();
    const root = state.document().root;
    expect(root.type === 'group' && root.children.length).toBe(0);
  });

  // ── D-101: defs id-namespacing on merge (cross-SVG collision) ──

  it('namespaces colliding defs ids across two imports so url(#) refs do not cross-wire (D-101)', () => {
    const { placement, state } = setup();
    const docWithGrad = (stop: string): SvgDocument => ({
      id: generateNodeId(),
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
      root: createGroup([
        createRect({ x: 0, y: 0, width: 100, height: 100 }, { style: { fill: 'url(#g)' } }),
      ]),
      defs: `<linearGradient id="g"><stop offset="0" stop-color="${stop}"/></linearGradient>`,
    });

    placement.placeDocumentCentered(docWithGrad('#ff0000'));
    // Precondition: first import's defs persisted into the document.
    expect(state.document().defs ?? '').toContain('id="g"');
    placement.placeDocumentCentered(docWithGrad('#0000ff'));

    const root = state.document().root as GroupNode;
    expect(root.children.length).toBe(2);
    // Each import is placed as a group; the gradient-filled rect is its child.
    const rectOf = (i: number) => (root.children[i] as GroupNode).children[0] as RectNode;
    const fillA = rectOf(0).style.fill!;
    const fillB = rectOf(1).style.fill!;
    // The second import's colliding id was renamed → the two rects reference
    // DISTINCT gradients (no cross-wiring to the first's paint).
    expect(fillA).not.toBe(fillB);
    const idA = fillA.match(/url\(#(.+)\)/)![1];
    const idB = fillB.match(/url\(#(.+)\)/)![1];
    expect(idA).not.toBe(idB);
    // Both referenced gradients exist in the merged defs.
    const defs = state.document().defs ?? '';
    expect(defs).toContain(`id="${idA}"`);
    expect(defs).toContain(`id="${idB}"`);
    // Both stop colors survived (proof the second wasn't deduped away).
    expect(defs).toContain('#ff0000');
    expect(defs).toContain('#0000ff');
  });
});
