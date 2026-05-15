import { bbox, generateNodeId, type NodeId } from 'svg-engine/core';
import {
  computeAlignDeltas,
  computeDistributeDeltas,
  type NodeBBox,
  unionBBox,
} from './alignment-math';

function nb(x: number, y: number, w: number, h: number, id?: NodeId): NodeBBox {
  return { id: id ?? generateNodeId(), bbox: bbox(x, y, w, h) };
}

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
