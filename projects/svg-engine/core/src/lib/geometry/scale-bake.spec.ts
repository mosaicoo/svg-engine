import {
  createEllipse,
  createGroup,
  createImage,
  createLine,
  createPolygon,
  createPolyline,
  createRect,
  createText,
} from '../model/node-factory';
import { IDENTITY_TRANSFORM, multiply, rotate, translate } from '../types/transform';
import {
  bakeEllipse,
  bakeGroup,
  bakeImage,
  bakeLine,
  bakePolygon,
  bakePolyline,
  bakeRect,
  bakeScaleIntoNode,
  bakeText,
  isIdentityOrTranslate,
  scaleAxisInterval,
  scalePoint,
} from './scale-bake';

describe('scaleAxisInterval', () => {
  it('positive scale around start: interval grows to the right', () => {
    expect(scaleAxisInterval(10, 20, 10, 2)).toEqual({ start: 10, length: 40 });
  });

  it('positive scale around end: interval grows to the left', () => {
    // start=10, length=20, anchor=30 (right edge), scale=2 → leftmost 10→-10, rightmost 30→30
    expect(scaleAxisInterval(10, 20, 30, 2)).toEqual({ start: -10, length: 40 });
  });

  it('scale of 1 is identity', () => {
    expect(scaleAxisInterval(10, 20, 0, 1)).toEqual({ start: 10, length: 20 });
  });

  it('scale of 0 collapses interval to anchor', () => {
    expect(scaleAxisInterval(10, 20, 5, 0)).toEqual({ start: 5, length: 0 });
  });

  it('negative scale flips to the other side of the anchor', () => {
    // start=10, length=20, anchor=10, scale=-1 → endpoints 10→10 and 30→-10 → start=-10, length=20
    expect(scaleAxisInterval(10, 20, 10, -1)).toEqual({ start: -10, length: 20 });
  });

  it('negative scale always returns non-negative length', () => {
    const r = scaleAxisInterval(0, 100, 50, -3);
    expect(r.length).toBeGreaterThanOrEqual(0);
    expect(r.length).toBe(300);
  });
});

describe('scalePoint', () => {
  it('scales x and y independently around anchor', () => {
    expect(scalePoint({ x: 10, y: 20 }, { x: 0, y: 0 }, 2, 3)).toEqual({ x: 20, y: 60 });
  });

  it('anchor itself is invariant', () => {
    const a = { x: 5, y: 7 };
    expect(scalePoint(a, a, 17, -42)).toEqual(a);
  });

  it('negative scale mirrors point through anchor on that axis', () => {
    expect(scalePoint({ x: 10, y: 10 }, { x: 0, y: 0 }, -1, 1)).toEqual({ x: -10, y: 10 });
  });
});

describe('bakeRect', () => {
  it('scales width/height + repositions x/y around anchor', () => {
    const r = createRect({ x: 10, y: 10, width: 20, height: 30 });
    const baked = bakeRect(r, 2, 2, { x: 10, y: 10 });
    expect(baked.x).toBe(10);
    expect(baked.y).toBe(10);
    expect(baked.width).toBe(40);
    expect(baked.height).toBe(60);
  });

  it('preserves id, style, transform, metadata', () => {
    const r = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { style: { fill: 'red', stroke: 'blue', strokeWidth: 2 } },
    );
    const baked = bakeRect(r, 2, 2, { x: 0, y: 0 });
    expect(baked.id).toBe(r.id);
    expect(baked.style).toEqual(r.style);
    expect(baked.transform).toEqual(r.transform);
  });

  it('handles negative scale by flipping position with positive width', () => {
    const r = createRect({ x: 10, y: 10, width: 20, height: 20 });
    // Anchor at TL (10,10), drag past anchor → sx = -1
    const baked = bakeRect(r, -1, 1, { x: 10, y: 10 });
    expect(baked.x).toBe(-10); // flipped to the left of anchor
    expect(baked.width).toBe(20); // length always positive
    expect(baked.height).toBe(20); // y unchanged
  });

  it('scales rx/ry by absolute magnitude', () => {
    const r = createRect({ x: 0, y: 0, width: 10, height: 10, rx: 4, ry: 2 });
    const baked = bakeRect(r, -2, 3, { x: 0, y: 0 });
    expect(baked.rx).toBe(8); // |4 * -2| = 8
    expect(baked.ry).toBe(6); // |2 * 3| = 6
  });

  it('leaves rx/ry undefined when source had none', () => {
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const baked = bakeRect(r, 2, 2, { x: 0, y: 0 });
    expect(baked.rx).toBeUndefined();
    expect(baked.ry).toBeUndefined();
  });
});

describe('bakeEllipse', () => {
  it('scales center as point + radii by |sx|/|sy|', () => {
    const e = createEllipse({ cx: 10, cy: 20, rx: 5, ry: 10 });
    const baked = bakeEllipse(e, 2, 3, { x: 0, y: 0 });
    expect(baked.cx).toBe(20);
    expect(baked.cy).toBe(60);
    expect(baked.rx).toBe(10);
    expect(baked.ry).toBe(30);
  });

  it('negative scale: cx/cy mirrored, radii stay positive', () => {
    const e = createEllipse({ cx: 10, cy: 10, rx: 5, ry: 5 });
    const baked = bakeEllipse(e, -1, -1, { x: 0, y: 0 });
    expect(baked.cx).toBe(-10);
    expect(baked.cy).toBe(-10);
    expect(baked.rx).toBe(5);
    expect(baked.ry).toBe(5);
  });
});

describe('bakeLine', () => {
  it('scales both endpoints around anchor', () => {
    const l = createLine({ x1: 0, y1: 0, x2: 10, y2: 10 });
    const baked = bakeLine(l, 2, 2, { x: 0, y: 0 });
    expect(baked.x1).toBe(0);
    expect(baked.y1).toBe(0);
    expect(baked.x2).toBe(20);
    expect(baked.y2).toBe(20);
  });

  it('handles non-uniform scale', () => {
    const l = createLine({ x1: 1, y1: 1, x2: 5, y2: 7 });
    const baked = bakeLine(l, 3, -1, { x: 1, y: 4 });
    expect(baked.x1).toBe(1); // anchor.x → unchanged on x
    expect(baked.y1).toBe(7); // y=1, anchor=4, scale=-1 → 4 + (1-4)*-1 = 7
    expect(baked.x2).toBe(13); // 1 + (5-1)*3 = 13
    expect(baked.y2).toBe(1); // 4 + (7-4)*-1 = 1
  });
});

describe('bakePolygon / bakePolyline', () => {
  it('polygon scales every vertex around anchor', () => {
    const p = createPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    const baked = bakePolygon(p, 2, 2, { x: 0, y: 0 });
    expect(baked.points).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ]);
  });

  it('polyline scales like polygon', () => {
    const p = createPolyline([
      { x: 5, y: 5 },
      { x: 10, y: 10 },
    ]);
    const baked = bakePolyline(p, 0.5, 0.5, { x: 0, y: 0 });
    expect(baked.points).toEqual([
      { x: 2.5, y: 2.5 },
      { x: 5, y: 5 },
    ]);
  });

  it('does not mutate the source points array', () => {
    const original = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    const p = createPolygon(original);
    bakePolygon(p, 5, 5, { x: 0, y: 0 });
    expect(original).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]);
  });
});

describe('bakeImage', () => {
  it('behaves like rect for x/y/w/h', () => {
    const img = createImage({ x: 10, y: 10, width: 20, height: 20, href: 'a.png' });
    const baked = bakeImage(img, 2, 2, { x: 10, y: 10 });
    expect(baked.x).toBe(10);
    expect(baked.y).toBe(10);
    expect(baked.width).toBe(40);
    expect(baked.height).toBe(40);
    expect(baked.href).toBe('a.png');
  });
});

describe('bakeText', () => {
  it('uniform scale: x/y move, fontSize scales by |sx|', () => {
    const t = createText({ x: 10, y: 20, content: 'hi', fontSize: 12 });
    const baked = bakeText(t, 2, 2, { x: 0, y: 0 });
    expect(baked.x).toBe(20);
    expect(baked.y).toBe(40);
    expect(baked.fontSize).toBe(24);
  });

  it('non-uniform scale: x/y move, fontSize PRESERVED (no stretch in text model)', () => {
    const t = createText({ x: 10, y: 20, content: 'hi', fontSize: 12 });
    const baked = bakeText(t, 2, 3, { x: 0, y: 0 });
    expect(baked.x).toBe(20);
    expect(baked.y).toBe(60);
    expect(baked.fontSize).toBe(12); // preserved
  });

  it('negative uniform scale: fontSize uses |sx|', () => {
    const t = createText({ x: 0, y: 0, content: 'hi', fontSize: 10 });
    const baked = bakeText(t, -2, -2, { x: 0, y: 0 });
    expect(baked.fontSize).toBe(20);
  });

  it('leaves fontSize undefined when source had none', () => {
    const t = createText({ x: 0, y: 0, content: 'hi' });
    const baked = bakeText(t, 2, 2, { x: 0, y: 0 });
    expect(baked.fontSize).toBeUndefined();
  });
});

describe('bakeGroup', () => {
  it('recursively bakes children via the provided callback', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 20, y: 0, width: 5, height: 5 });
    const g = createGroup([a, b]);
    const baked = bakeGroup(g, 2, 2, { x: 0, y: 0 }, (child) => {
      if (child.type !== 'rect') return null;
      return bakeRect(child, 2, 2, { x: 0, y: 0 });
    });
    expect(baked.children.length).toBe(2);
    expect((baked.children[0] as typeof a).width).toBe(20);
    expect((baked.children[1] as typeof b).x).toBe(40);
  });

  it('keeps a child untouched when bakeChild returns null', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const g = createGroup([a]);
    const baked = bakeGroup(g, 2, 2, { x: 0, y: 0 }, () => null);
    expect(baked.children[0]).toBe(a); // same reference — unchanged
  });

  it("does NOT mutate the group's own transform", () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const g = createGroup([a], { transform: translate(5, 5) });
    const baked = bakeGroup(g, 2, 2, { x: 0, y: 0 }, (c) => c);
    expect(baked.transform).toEqual(g.transform);
  });
});

describe('isIdentityOrTranslate', () => {
  it('identity matrix → true', () => {
    expect(isIdentityOrTranslate(IDENTITY_TRANSFORM)).toBe(true);
  });

  it('pure translate → true', () => {
    expect(isIdentityOrTranslate(translate(100, 50))).toBe(true);
  });

  it('rotation → false', () => {
    expect(isIdentityOrTranslate(rotate(Math.PI / 4))).toBe(false);
  });

  it('rotation composed with translate → false', () => {
    expect(isIdentityOrTranslate(multiply(translate(10, 10), rotate(Math.PI / 6)))).toBe(false);
  });

  it('scale matrix (e.g., [2,0,0,2,0,0]) → false', () => {
    expect(isIdentityOrTranslate([2, 0, 0, 2, 0, 0])).toBe(false);
  });

  it('handles floating-point noise within 1e-9 tolerance', () => {
    expect(isIdentityOrTranslate([1 + 1e-12, 0, 0, 1, 0, 0])).toBe(true);
  });
});

describe('bakeScaleIntoNode — anchor coord-system (Bloco 4-IP-FixBugs)', () => {
  // Regression: pre-fix, dragging any resize edge of a MOVED shape made
  // the opposite edge drift. Root cause: `anchor` arrives in document
  // coords, but the per-type bake helpers expected node-local coords. For
  // a node with translate(tx, ty), bakeScaleIntoNode now subtracts
  // (tx, ty) from anchor before dispatching so the bake stays in local
  // coords. End-state: dragging the right-middle edge of a moved rect
  // keeps the left edge perfectly fixed in document space.

  it('rect with translate: dragging right-edge keeps left edge fixed in doc space', () => {
    // Local geometry: rect at (200, 100) sized 100×100. Translate (50, 50).
    // Visual bbox in doc space: { x: 250, y: 150, w: 100, h: 100 }.
    const rect = createRect(
      { x: 200, y: 100, width: 100, height: 100 },
      { transform: translate(50, 50) },
    );
    // Simulate dragging the `mr` handle by 1.5× the width. Anchor for
    // `mr` resize is `ml` of the doc-space bbox: (250, 200).
    const docAnchor = { x: 250, y: 200 };
    const baked = bakeScaleIntoNode(rect, 1.5, 1, docAnchor);
    expect(baked).not.toBeNull();
    if (baked === null || baked.type !== 'rect') throw new Error('expected baked rect');
    // Post-bake the left visual edge MUST still be at doc x=250
    // (= baked.x + transform[4]). Width grew from 100 to 150.
    expect(baked.x + baked.transform[4]).toBeCloseTo(250, 9);
    expect(baked.width).toBeCloseTo(150, 9);
    // Right visual edge: 250 + 150 = 400 (= original 350 + 50 stretch)
    expect(baked.x + baked.transform[4] + baked.width).toBeCloseTo(400, 9);
  });

  it('rect with translate: dragging top-edge keeps bottom edge fixed in doc space', () => {
    const rect = createRect(
      { x: 200, y: 100, width: 100, height: 100 },
      { transform: translate(50, 50) },
    );
    // `tc` handle → anchor = `bc` of doc bbox: (300, 250).
    const docAnchor = { x: 300, y: 250 };
    const baked = bakeScaleIntoNode(rect, 1, 1.5, docAnchor);
    if (baked === null || baked.type !== 'rect') throw new Error('expected baked rect');
    // Bottom visual edge stays at doc y=250.
    expect(baked.y + baked.transform[5] + baked.height).toBeCloseTo(250, 9);
    expect(baked.height).toBeCloseTo(150, 9);
    // Top visual edge: 250 - 150 = 100 (= original 150 stretched 50 upward)
    expect(baked.y + baked.transform[5]).toBeCloseTo(100, 9);
  });

  it('ellipse with translate: center scales around doc-space anchor correctly', () => {
    // Ellipse cx=100, cy=100, rx=50, ry=50 + translate(200, 200).
    // Visual center in doc space: (300, 300). Visual bbox: (250,250) → (350,350).
    const e = createEllipse(
      { cx: 100, cy: 100, rx: 50, ry: 50 },
      { transform: translate(200, 200) },
    );
    // Drag `mr` handle → anchor at doc (250, 300), sx=2, sy=1
    const docAnchor = { x: 250, y: 300 };
    const baked = bakeScaleIntoNode(e, 2, 1, docAnchor);
    if (baked === null || baked.type !== 'ellipse') throw new Error('expected baked ellipse');
    // Visual left edge (cx - rx + tx) must remain at doc x=250
    expect(baked.cx - baked.rx + baked.transform[4]).toBeCloseTo(250, 9);
    expect(baked.rx).toBeCloseTo(100, 9); // doubled
    expect(baked.ry).toBeCloseTo(50, 9); // unchanged (sy=1)
  });

  it('node with identity transform: behaviour unchanged (no regression)', () => {
    const rect = createRect({ x: 100, y: 100, width: 100, height: 100 });
    const baked = bakeScaleIntoNode(rect, 1.5, 1, { x: 100, y: 150 });
    if (baked === null || baked.type !== 'rect') throw new Error('expected baked rect');
    // Anchor at (100, 150) = left-middle. Right grows 50 → width=150.
    expect(baked.x).toBeCloseTo(100, 9);
    expect(baked.width).toBeCloseTo(150, 9);
  });

  it('returns null for rotated nodes (existing fallback contract preserved)', () => {
    const rect = createRect(
      { x: 0, y: 0, width: 100, height: 100 },
      { transform: rotate(Math.PI / 4) },
    );
    expect(bakeScaleIntoNode(rect, 2, 2, { x: 0, y: 0 })).toBeNull();
  });

  it('group with translate containing a child with translate: anchor composes down the chain', () => {
    // Group at translate(50, 50), containing rect at local (10, 10)
    // sized 100×100 with its own translate(20, 20). Document-space
    // bbox of rect: x = 10 + 50 + 20 = 80, y = 80, w = 100, h = 100.
    // Right edge in doc space: 180. User grabs the rect's right
    // edge → anchor for resize is the rect's left edge = doc x=80.
    const rect = createRect(
      { x: 10, y: 10, width: 100, height: 100 },
      { transform: translate(20, 20) },
    );
    const group = createGroup([rect], { transform: translate(50, 50) });
    // Drag right edge to double the width: sx=2 around doc anchor (80, 130)
    const baked = bakeScaleIntoNode(group, 2, 1, { x: 80, y: 130 });
    if (baked === null || baked.type !== 'group') throw new Error('expected baked group');
    const bakedRect = baked.children[0] as ReturnType<typeof createRect>;
    // Visual left edge: rect.x + rect.transform[4] + group.transform[4]
    //                  = bakedRect.x + 20 + 50 = doc 80
    expect(bakedRect.x + bakedRect.transform[4] + baked.transform[4]).toBeCloseTo(80, 9);
    expect(bakedRect.width).toBeCloseTo(200, 9);
  });
});
