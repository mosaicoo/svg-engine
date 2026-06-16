import {
  createEllipse,
  createGroup,
  createImage,
  createLine,
  createPath,
  createPolygon,
  createPolyline,
  createRect,
  createText,
} from '../model/node-factory';
import { rotate, scale, translate } from '../types/transform';
import { intersectsBBox } from '../types/bounding-box';
import { getNodeBBox, getNodesWorldBBox } from './node-bbox';

function approxBox(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  eps = 1e-6,
): boolean {
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.width - b.width) < eps &&
    Math.abs(a.height - b.height) < eps
  );
}

describe('getNodeBBox — primitive types', () => {
  it('rect: identity transform → exact bbox of (x, y, w, h)', () => {
    const r = createRect({ x: 10, y: 20, width: 50, height: 30 });
    expect(getNodeBBox(r)).toEqual({ x: 10, y: 20, width: 50, height: 30 });
  });

  it('rect: translated → bbox shifts by (tx, ty)', () => {
    const r = createRect({ x: 10, y: 20, width: 50, height: 30 }, { transform: translate(5, 7) });
    expect(getNodeBBox(r)).toEqual({ x: 15, y: 27, width: 50, height: 30 });
  });

  it('rect: scaled around origin → bbox scales', () => {
    const r = createRect({ x: 10, y: 0, width: 20, height: 10 }, { transform: scale(2, 3) });
    expect(getNodeBBox(r)).toEqual({ x: 20, y: 0, width: 40, height: 30 });
  });

  it('rect: rotated 90° → AABB of rotated corners (over-approximation safe)', () => {
    const r = createRect({ x: 0, y: 0, width: 10, height: 4 }, { transform: rotate(Math.PI / 2) });
    const b = getNodeBBox(r);
    // 90° rotation around origin: (0,0)→(0,0), (10,0)→(0,10), (10,4)→(-4,10), (0,4)→(-4,0)
    expect(approxBox(b, { x: -4, y: 0, width: 4, height: 10 })).toBe(true);
  });

  it('ellipse: bbox spans (cx ± rx, cy ± ry)', () => {
    const e = createEllipse({ cx: 50, cy: 60, rx: 20, ry: 10 });
    expect(getNodeBBox(e)).toEqual({ x: 30, y: 50, width: 40, height: 20 });
  });

  it('line: bbox of two endpoints', () => {
    const l = createLine({ x1: 5, y1: 0, x2: 0, y2: 10 });
    expect(getNodeBBox(l)).toEqual({ x: 0, y: 0, width: 5, height: 10 });
  });

  it('polygon: bbox encloses all vertices', () => {
    const p = createPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 12 },
    ]);
    expect(getNodeBBox(p)).toEqual({ x: 0, y: 0, width: 10, height: 12 });
  });

  it('polyline: empty points list → degenerate at origin', () => {
    const p = createPolyline([]);
    const b = getNodeBBox(p);
    expect(b.width).toBe(0);
    expect(b.height).toBe(0);
  });

  it('image: bbox of (x, y, w, h)', () => {
    const i = createImage({ x: 5, y: 5, width: 20, height: 20, href: 'data:image/png;base64,' });
    expect(getNodeBBox(i)).toEqual({ x: 5, y: 5, width: 20, height: 20 });
  });
});

describe('getNodeBBox — paths', () => {
  it('M L sequence: bbox of literal endpoints', () => {
    const p = createPath('M0 0 L10 0 L10 8 L0 8 Z');
    expect(getNodeBBox(p)).toEqual({ x: 0, y: 0, width: 10, height: 8 });
  });

  it('relative commands: bbox tracks the cursor', () => {
    const p = createPath('M5 5 l10 0 l0 5');
    expect(getNodeBBox(p)).toEqual({ x: 5, y: 5, width: 10, height: 5 });
  });

  it('cubic bezier: includes control points (over-estimate)', () => {
    // Cubic from (0,0) to (10,0) with control points reaching y=20 — the
    // bbox should include the control point, even though the curve
    // never reaches y=20 (peaks at 3/4 of the way).
    const p = createPath('M0 0 C0 20 10 20 10 0');
    const b = getNodeBBox(p);
    expect(b.y).toBe(0);
    expect(b.height).toBe(20); // over-estimate via control points — safe for culling
  });

  it('H / V commands: horizontal/vertical lines', () => {
    const p = createPath('M0 0 H10 V5 H0 V0');
    expect(getNodeBBox(p)).toEqual({ x: 0, y: 0, width: 10, height: 5 });
  });
});

describe('getNodeBBox — text', () => {
  it('left-anchored text: bbox extends right from (x, y)', () => {
    const t = createText({ x: 10, y: 50, content: 'ABCDE', fontSize: 16 });
    const b = getNodeBBox(t);
    // width ≈ 5 chars × 16 × 0.6 = 48
    expect(b.width).toBeCloseTo(48, 1);
    // height ≈ 16 × 1.2 = 19.2
    expect(b.height).toBeCloseTo(19.2, 1);
    // y = baseline - fontSize
    expect(b.y).toBeCloseTo(34, 1);
  });

  it('middle-anchored text: bbox centered on x', () => {
    const t = createText({
      x: 100,
      y: 50,
      content: 'AB',
      fontSize: 10,
      textAnchor: 'middle',
    });
    const b = getNodeBBox(t);
    // width ≈ 2 × 10 × 0.6 = 12; centered at x=100 → starts at 94
    expect(b.x).toBeCloseTo(94, 1);
    expect(b.width).toBeCloseTo(12, 1);
  });
});

describe('getNodeBBox — groups', () => {
  it('empty group: degenerate bbox at transform origin', () => {
    const g = createGroup([], { transform: translate(50, 50) });
    const b = getNodeBBox(g);
    expect(b).toEqual({ x: 50, y: 50, width: 0, height: 0 });
  });

  it('group: union of children world bboxes', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 20, y: 5, width: 10, height: 10 });
    const g = createGroup([a, b]);
    expect(getNodeBBox(g)).toEqual({ x: 0, y: 0, width: 30, height: 15 });
  });

  it('nested group with transform: child transform composes with parent', () => {
    const child = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const inner = createGroup([child], { transform: translate(5, 5) });
    const outer = createGroup([inner], { transform: translate(100, 100) });
    expect(getNodeBBox(outer)).toEqual({ x: 105, y: 105, width: 10, height: 10 });
  });
});

describe('intersectsBBox', () => {
  it('overlapping boxes intersect', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    expect(intersectsBBox(a, b)).toBe(true);
  });

  it('touching at edge counts as intersection', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 10, y: 0, width: 5, height: 5 };
    expect(intersectsBBox(a, b)).toBe(true);
  });

  it('disjoint boxes do not intersect', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 100, y: 100, width: 5, height: 5 };
    expect(intersectsBBox(a, b)).toBe(false);
  });

  it('contained box intersects its container', () => {
    const outer = { x: 0, y: 0, width: 100, height: 100 };
    const inner = { x: 25, y: 25, width: 5, height: 5 };
    expect(intersectsBBox(outer, inner)).toBe(true);
    expect(intersectsBBox(inner, outer)).toBe(true);
  });
});

describe('getNodesWorldBBox (D-118)', () => {
  it('returns null for an empty selection / unknown ids', () => {
    const root = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    expect(getNodesWorldBBox(root, new Set())).toBeNull();
    expect(getNodesWorldBBox(root, new Set(['nope' as never]))).toBeNull();
  });

  it('unions the world boxes of multiple selected leaves', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 90, y: 90, width: 10, height: 10 });
    const root = createGroup([a, b, createRect({ x: 500, y: 500, width: 5, height: 5 })]);
    const box = getNodesWorldBBox(root, new Set([a.id, b.id]));
    expect(box).not.toBeNull();
    // a∪b spans (0,0)→(100,100); the third (unselected) rect is excluded.
    expect(approxBox(box!, { x: 0, y: 0, width: 100, height: 100 })).toBe(true);
  });

  it('composes the ancestor transform chain (leaf inside a translated group)', () => {
    const leaf = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const group = createGroup([leaf], { transform: translate(100, 50) });
    const root = createGroup([group]);
    const box = getNodesWorldBBox(root, new Set([leaf.id]));
    // The leaf's world box reflects the group's +100/+50 translation.
    expect(approxBox(box!, { x: 100, y: 50, width: 10, height: 10 })).toBe(true);
  });

  it('a selected group frames its whole subtree', () => {
    const group = createGroup([
      createRect({ x: 0, y: 0, width: 10, height: 10 }),
      createRect({ x: 40, y: 40, width: 10, height: 10 }),
    ]);
    const root = createGroup([group]);
    const box = getNodesWorldBBox(root, new Set([group.id]));
    expect(approxBox(box!, { x: 0, y: 0, width: 50, height: 50 })).toBe(true);
  });
});
