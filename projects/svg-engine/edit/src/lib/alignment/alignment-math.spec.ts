import { bbox, generateNodeId, type NodeId } from '@mosaicoo/svg-engine/core';
import {
  computeAlignDeltas,
  computeAlignToReferenceDeltas,
  computeAverageGap,
  computeDistributeDeltas,
  computeDistributeSpacingDeltas,
  type NodeBBox,
  resolveAlignReference,
  unionBBox,
} from './alignment-math';

function nb(x: number, y: number, w: number, h: number, id?: NodeId): NodeBBox {
  return { id: id ?? generateNodeId(), bbox: bbox(x, y, w, h) };
}

describe('resolveAlignReference (D-094)', () => {
  const page = bbox(0, 0, 800, 600);

  it('returns null (selection union) for ≥ 2 items with no key object', () => {
    const items = [nb(0, 0, 10, 10), nb(50, 0, 10, 10)];
    expect(resolveAlignReference(items, null, page)).toBeNull();
  });

  it('returns the page reference for a single selected item (no key)', () => {
    const only = nb(10, 10, 20, 20);
    expect(resolveAlignReference([only], null, page)).toEqual(page);
  });

  it('returns the key object bbox when a designated key is in a ≥ 2 selection', () => {
    const keyId = generateNodeId();
    const key = nb(100, 100, 40, 40, keyId);
    const other = nb(0, 0, 10, 10);
    expect(resolveAlignReference([other, key], keyId, page)).toEqual(key.bbox);
  });

  it('ignores a key object id that is not part of the current selection', () => {
    const items = [nb(0, 0, 10, 10), nb(50, 0, 10, 10)];
    // Stale/foreign key id → falls through to union (null).
    expect(resolveAlignReference(items, generateNodeId(), page)).toBeNull();
  });

  it('ignores the key object for a single-item selection (page wins)', () => {
    const keyId = generateNodeId();
    const only = nb(10, 10, 20, 20, keyId);
    // Key needs ≥ 2 to be meaningful; a lone item still aligns to the page.
    expect(resolveAlignReference([only], keyId, page)).toEqual(page);
  });
});

describe('unionBBox', () => {
  it('returns the same bbox for a single item', () => {
    const u = unionBBox([nb(10, 20, 30, 40)]);
    expect(u).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });

  it('encloses multiple disjoint rects', () => {
    const u = unionBBox([nb(0, 0, 10, 10), nb(50, 100, 20, 30)]);
    expect(u).toEqual({ x: 0, y: 0, width: 70, height: 130 });
  });

  it('throws on empty input', () => {
    expect(() => unionBBox([])).toThrow();
  });
});

describe('computeAlignDeltas', () => {
  it('returns empty map when fewer than 2 items', () => {
    expect(computeAlignDeltas([], 'left').size).toBe(0);
    expect(computeAlignDeltas([nb(0, 0, 10, 10)], 'left').size).toBe(0);
  });

  it("aligns left to the union's leftmost X", () => {
    const a = nb(10, 0, 10, 10);
    const b = nb(50, 0, 20, 10);
    const deltas = computeAlignDeltas([a, b], 'left');
    // Leftmost = 10. a already aligned (omit); b moves -40.
    expect(deltas.get(a.id)).toBeUndefined();
    expect(deltas.get(b.id)).toEqual({ x: -40, y: 0 });
  });

  it("aligns right to the union's rightmost edge", () => {
    const a = nb(0, 0, 10, 10); // right = 10
    const b = nb(0, 0, 30, 10); // right = 30
    const deltas = computeAlignDeltas([a, b], 'right');
    // Rightmost = 30. a's right needs to move to 30 → dx = 20.
    expect(deltas.get(a.id)).toEqual({ x: 20, y: 0 });
    expect(deltas.get(b.id)).toBeUndefined();
  });

  it("aligns center-x to the union's center-X", () => {
    const a = nb(0, 0, 10, 10); // center-x = 5
    const b = nb(40, 0, 20, 10); // center-x = 50
    // Union: x=0..60 → center-x = 30. a moves to center 30 (dx=25). b moves to 30 (dx=-20).
    const deltas = computeAlignDeltas([a, b], 'center-x');
    expect(deltas.get(a.id)).toEqual({ x: 25, y: 0 });
    expect(deltas.get(b.id)).toEqual({ x: -20, y: 0 });
  });

  it('aligns top / bottom / center-y on the Y axis only', () => {
    const a = nb(0, 0, 10, 10); // y=0..10
    const b = nb(0, 50, 10, 30); // y=50..80
    const top = computeAlignDeltas([a, b], 'top');
    expect(top.get(b.id)).toEqual({ x: 0, y: -50 });
    const bottom = computeAlignDeltas([a, b], 'bottom');
    // Bottom of union = 80. a's bottom (10) needs +70.
    expect(bottom.get(a.id)).toEqual({ x: 0, y: 70 });
    const cy = computeAlignDeltas([a, b], 'center-y');
    // Union y=0..80 → center 40. a center=5 → dy=35. b center=65 → dy=-25.
    expect(cy.get(a.id)).toEqual({ x: 0, y: 35 });
    expect(cy.get(b.id)).toEqual({ x: 0, y: -25 });
  });

  it('omits zero-deltas (already-aligned items)', () => {
    const a = nb(0, 0, 10, 10);
    const b = nb(0, 50, 10, 10); // already at left=0
    const deltas = computeAlignDeltas([a, b], 'left');
    expect(deltas.size).toBe(0);
  });
});

describe('computeAlignToReferenceDeltas (align to page)', () => {
  // A typical "page" reference: 800×600 artboard at the origin.
  const PAGE = bbox(0, 0, 800, 600);

  it('returns empty map for empty input', () => {
    expect(computeAlignToReferenceDeltas([], 'left', PAGE).size).toBe(0);
  });

  it('aligns a single node to the page left edge', () => {
    const a = nb(100, 50, 40, 30);
    const deltas = computeAlignToReferenceDeltas([a], 'left', PAGE);
    // Reference left = 0. a.x = 100 → dx = -100.
    expect(deltas.get(a.id)).toEqual({ x: -100, y: 0 });
  });

  it('centres a single node horizontally on the page', () => {
    const a = nb(100, 50, 40, 30); // center-x = 120
    const deltas = computeAlignToReferenceDeltas([a], 'center-x', PAGE);
    // Page center-x = 400. dx = 400 - 120 = 280.
    expect(deltas.get(a.id)).toEqual({ x: 280, y: 0 });
  });

  it('aligns a single node to the page bottom edge', () => {
    const a = nb(100, 50, 40, 30); // bottom = 80
    const deltas = computeAlignToReferenceDeltas([a], 'bottom', PAGE);
    // Page bottom = 600. dy = 600 - 80 = 520.
    expect(deltas.get(a.id)).toEqual({ x: 0, y: 520 });
  });

  it('honours a non-zero-origin reference (page offset)', () => {
    const offsetPage = bbox(200, 100, 400, 300); // right edge = 600
    const a = nb(0, 0, 50, 50); // right = 50
    const deltas = computeAlignToReferenceDeltas([a], 'right', offsetPage);
    // dx = 600 - 50 = 550.
    expect(deltas.get(a.id)).toEqual({ x: 550, y: 0 });
  });

  it('aligns every item to the reference (not to each other) for ≥ 2', () => {
    const a = nb(100, 0, 10, 10);
    const b = nb(300, 0, 20, 10);
    const deltas = computeAlignToReferenceDeltas([a, b], 'left', PAGE);
    // Both snap to page left (0), independent of one another.
    expect(deltas.get(a.id)).toEqual({ x: -100, y: 0 });
    expect(deltas.get(b.id)).toEqual({ x: -300, y: 0 });
  });

  it('omits zero-deltas (already on the reference edge)', () => {
    const a = nb(0, 200, 10, 10); // already at left = 0
    const deltas = computeAlignToReferenceDeltas([a], 'left', PAGE);
    expect(deltas.size).toBe(0);
  });
});

describe('computeDistributeDeltas', () => {
  it('returns empty map when fewer than 3 items', () => {
    expect(computeDistributeDeltas([], 'horizontal').size).toBe(0);
    expect(computeDistributeDeltas([nb(0, 0, 10, 10)], 'horizontal').size).toBe(0);
    expect(computeDistributeDeltas([nb(0, 0, 10, 10), nb(50, 0, 10, 10)], 'horizontal').size).toBe(
      0,
    );
  });

  it('distributes 3 items horizontally with the inner moving to the midpoint', () => {
    const a = nb(0, 0, 10, 10); // center 5
    const b = nb(20, 0, 10, 10); // center 25
    const c = nb(100, 0, 10, 10); // center 105
    // Step = (105 - 5) / 2 = 50. Inner target center = 5 + 50 = 55. b currently at 25 → dx = 30.
    const deltas = computeDistributeDeltas([a, b, c], 'horizontal');
    expect(deltas.size).toBe(1);
    expect(deltas.get(b.id)).toEqual({ x: 30, y: 0 });
  });

  it('distributes vertically', () => {
    const a = nb(0, 0, 10, 10); // center y=5
    const b = nb(0, 200, 10, 10); // center y=205
    const c = nb(0, 100, 10, 10); // center y=105
    // Sorted by center-y: a(5), c(105), b(205). Step = 100. Target c center = 5+100=105. Already there → no delta.
    const deltas = computeDistributeDeltas([a, b, c], 'vertical');
    expect(deltas.size).toBe(0);
  });

  it('handles 4 items with two inner moves', () => {
    const a = nb(0, 0, 10, 10); // center 5
    const b = nb(10, 0, 10, 10); // center 15
    const c = nb(20, 0, 10, 10); // center 25
    const d = nb(150, 0, 10, 10); // center 155
    // Sorted: a(5), b(15), c(25), d(155). Step = (155-5)/3 = 50. Targets: 5, 55, 105, 155.
    // b(15) → 55 → dx=40; c(25) → 105 → dx=80.
    const deltas = computeDistributeDeltas([a, b, c, d], 'horizontal');
    expect(deltas.get(b.id)).toEqual({ x: 40, y: 0 });
    expect(deltas.get(c.id)).toEqual({ x: 80, y: 0 });
    expect(deltas.get(a.id)).toBeUndefined();
    expect(deltas.get(d.id)).toBeUndefined();
  });

  it('returns empty when leftmost and rightmost coincide on the axis', () => {
    const a = nb(0, 0, 10, 10);
    const b = nb(0, 10, 10, 10);
    const c = nb(0, 20, 10, 10);
    // All same center-x = 5 → degenerate, no spacing.
    const deltas = computeDistributeDeltas([a, b, c], 'horizontal');
    expect(deltas.size).toBe(0);
  });

  it("does not mutate the caller's items array", () => {
    const a = nb(100, 0, 10, 10);
    const b = nb(0, 0, 10, 10);
    const c = nb(50, 0, 10, 10);
    const arr = [a, b, c];
    const snapshot = [...arr];
    computeDistributeDeltas(arr, 'horizontal');
    expect(arr).toEqual(snapshot);
  });
});

describe('computeAverageGap (D-095)', () => {
  it('returns null for fewer than 3 items', () => {
    expect(computeAverageGap([], 'horizontal')).toBeNull();
    expect(computeAverageGap([nb(0, 0, 10, 10)], 'horizontal')).toBeNull();
    expect(computeAverageGap([nb(0, 0, 10, 10), nb(50, 0, 10, 10)], 'horizontal')).toBeNull();
  });

  it('averages the edge-to-edge gaps along the axis', () => {
    // gaps: a→b = 20, b→c = 30 → average 25.
    const items = [nb(0, 0, 10, 10), nb(30, 0, 10, 10), nb(70, 0, 10, 10)];
    expect(computeAverageGap(items, 'horizontal')).toBe(25);
  });

  it('works on the vertical axis and is order-independent', () => {
    const items = [nb(0, 70, 10, 10), nb(0, 0, 10, 10), nb(0, 30, 10, 10)];
    expect(computeAverageGap(items, 'vertical')).toBe(25);
  });
});

describe('computeDistributeSpacingDeltas (D-095)', () => {
  it('returns an empty map for fewer than 2 items', () => {
    expect(computeDistributeSpacingDeltas([], 'horizontal', 10).size).toBe(0);
    expect(computeDistributeSpacingDeltas([nb(0, 0, 10, 10)], 'horizontal', 10).size).toBe(0);
  });

  it('lays out equal gaps with the first item fixed (sizes vary)', () => {
    const idA = generateNodeId();
    const idB = generateNodeId();
    const idC = generateNodeId();
    const a = nb(0, 0, 10, 10, idA);
    const b = nb(30, 0, 20, 10, idB);
    const c = nb(100, 0, 10, 10, idC);
    const d = computeDistributeSpacingDeltas([a, b, c], 'horizontal', 10);
    expect(d.get(idA)).toBeUndefined(); // first stays fixed
    expect(d.get(idB)).toEqual({ x: -10, y: 0 }); // lead 20 (cursor 10 + gap 10)
    expect(d.get(idC)).toEqual({ x: -50, y: 0 }); // lead 50 (cursor 40 + gap 10)
  });

  it('moves only along the axis (vertical, 2 items)', () => {
    const idA = generateNodeId();
    const idB = generateNodeId();
    const a = nb(0, 0, 10, 10, idA);
    const b = nb(0, 100, 10, 10, idB);
    const d = computeDistributeSpacingDeltas([a, b], 'vertical', 5);
    expect(d.get(idA)).toBeUndefined();
    expect(d.get(idB)).toEqual({ x: 0, y: -85 }); // lead 15 (cursor 10 + gap 5)
  });

  it('with the Auto gap (computeAverageGap) the last item stays put', () => {
    const idA = generateNodeId();
    const idB = generateNodeId();
    const idC = generateNodeId();
    const a = nb(0, 0, 10, 10, idA);
    const b = nb(30, 0, 10, 10, idB);
    const c = nb(70, 0, 10, 10, idC);
    const gap = computeAverageGap([a, b, c], 'horizontal'); // 25
    const d = computeDistributeSpacingDeltas([a, b, c], 'horizontal', gap!);
    expect(d.get(idC)).toBeUndefined(); // last lands on its original spot
    expect(d.get(idB)).toEqual({ x: 5, y: 0 });
  });

  it("does not mutate the caller's items array", () => {
    const arr = [nb(100, 0, 10, 10), nb(0, 0, 10, 10), nb(50, 0, 10, 10)];
    const snapshot = [...arr];
    computeDistributeSpacingDeltas(arr, 'horizontal', 10);
    expect(arr).toEqual(snapshot);
  });
});
