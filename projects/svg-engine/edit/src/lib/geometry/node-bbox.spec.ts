import { toNodeId } from 'svg-engine/core';
import {
  findRenderedNode,
  getCombinedBBox,
  getRenderedNodeBBox,
  getRenderedParentMatrix,
} from './node-bbox';

const SVG_NS = 'http://www.w3.org/2000/svg';

function buildSvg(): SVGSVGElement {
  // jsdom does not implement the SVG layout/getBBox APIs by default, so we
  // patch them with simple stubs that return predictable rects derived from
  // the element's `data-test-bbox` attribute. This lets us validate the
  // composition logic (matrix walking, AABB) without requiring a real
  // browser layout engine.
  const root = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  root.setAttribute('viewBox', '0 0 800 600');
  document.body.appendChild(root);
  return root;
}

function makeG(parent: Element, id: string, bboxStr: string, transformAttr?: string): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement;
  g.setAttribute('data-node-id', id);
  g.setAttribute('data-test-bbox', bboxStr);
  if (transformAttr !== undefined) g.setAttribute('transform', transformAttr);
  // Stub getBBox using the data-test-bbox value
  (g as SVGGraphicsElement & { getBBox: () => DOMRect }).getBBox = () => {
    const [x, y, w, h] = bboxStr.split(',').map(Number) as [number, number, number, number];
    return new DOMRect(x, y, w, h);
  };
  parent.appendChild(g);
  return g;
}

describe('findRenderedNode', () => {
  it('returns the element with matching data-node-id', () => {
    const svg = buildSvg();
    const g = makeG(svg, 'a', '0,0,10,10');
    expect(findRenderedNode(svg, toNodeId('a'))).toBe(g);
    svg.remove();
  });

  it('returns null when not found', () => {
    const svg = buildSvg();
    expect(findRenderedNode(svg, toNodeId('nope'))).toBeNull();
    svg.remove();
  });
});

describe('getRenderedNodeBBox', () => {
  it('returns null for missing nodes', () => {
    const svg = buildSvg();
    expect(getRenderedNodeBBox(svg, toNodeId('nope'))).toBeNull();
    svg.remove();
  });

  it('returns the local bbox when no transforms apply', () => {
    const svg = buildSvg();
    makeG(svg, 'a', '10,20,100,50');
    expect(getRenderedNodeBBox(svg, toNodeId('a'))).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
    svg.remove();
  });

  it('applies the element transform to the bbox', () => {
    const svg = buildSvg();
    makeG(svg, 'a', '0,0,10,10', 'translate(50, 30)');
    const bb = getRenderedNodeBBox(svg, toNodeId('a'));
    expect(bb).toEqual({ x: 50, y: 30, width: 10, height: 10 });
    svg.remove();
  });

  it('returns null for zero-area geometry', () => {
    const svg = buildSvg();
    makeG(svg, 'a', '0,0,0,0');
    expect(getRenderedNodeBBox(svg, toNodeId('a'))).toBeNull();
    svg.remove();
  });
});

describe('getRenderedNodeBBox — shapes inside groups (regression coverage)', () => {
  it('shape inside translated group: bbox reflects group translation', () => {
    const svg = buildSvg();
    const group = makeG(svg, 'g1', '0,0,0,0', 'translate(100, 50)');
    makeG(group, 'shape', '10,10,30,20');
    expect(getRenderedNodeBBox(svg, toNodeId('shape'))).toEqual({
      x: 110,
      y: 60,
      width: 30,
      height: 20,
    });
    svg.remove();
  });

  it('shape with own transform inside translated group: bbox composes both', () => {
    const svg = buildSvg();
    const group = makeG(svg, 'g1', '0,0,0,0', 'translate(100, 50)');
    makeG(group, 'shape', '0,0,10,10', 'translate(5, 5)');
    // shape-local (0..10) + own translate(5,5) → (5..15) + group translate(100,50) → (105..115, 55..65)
    expect(getRenderedNodeBBox(svg, toNodeId('shape'))).toEqual({
      x: 105,
      y: 55,
      width: 10,
      height: 10,
    });
    svg.remove();
  });

  it('shape inside rotated group: bbox is correct AABB of rotated corners', () => {
    const svg = buildSvg();
    const group = makeG(svg, 'g1', '0,0,0,0', 'rotate(90)');
    makeG(group, 'shape', '10,0,20,10');
    // After rotate(90) around origin: (x,y) → (-y, x)
    // Corners (10,0), (30,0), (30,10), (10,10) → (0,10), (0,30), (-10,30), (-10,10)
    // AABB: x=-10, y=10, w=10, h=20
    const bb = getRenderedNodeBBox(svg, toNodeId('shape'))!;
    expect(bb.x).toBeCloseTo(-10, 4);
    expect(bb.y).toBeCloseTo(10, 4);
    expect(bb.width).toBeCloseTo(10, 4);
    expect(bb.height).toBeCloseTo(20, 4);
    svg.remove();
  });

  it('shape inside nested groups: bbox composes the whole chain', () => {
    const svg = buildSvg();
    const outer = makeG(svg, 'outer', '0,0,0,0', 'translate(100, 0)');
    const inner = makeG(outer, 'inner', '0,0,0,0', 'translate(0, 50)');
    makeG(inner, 'shape', '0,0,20,20');
    expect(getRenderedNodeBBox(svg, toNodeId('shape'))).toEqual({
      x: 100,
      y: 50,
      width: 20,
      height: 20,
    });
    svg.remove();
  });
});

describe('getRenderedParentMatrix — ancestor-only matrix for ResizeNodeCommand', () => {
  it('returns null when the node is directly under the svg root', () => {
    const svg = buildSvg();
    makeG(svg, 'shape', '0,0,10,10', 'translate(5, 5)');
    expect(getRenderedParentMatrix(svg, toNodeId('shape'))).toBeNull();
    svg.remove();
  });

  it('returns the parent group transform when shape lives inside a translated group', () => {
    const svg = buildSvg();
    const group = makeG(svg, 'g1', '0,0,0,0', 'translate(100, 50)');
    makeG(group, 'shape', '0,0,10,10');
    // Identity 2x3 = [1,0,0,1,0,0]; translate(100, 50) → [1,0,0,1,100,50]
    expect(getRenderedParentMatrix(svg, toNodeId('shape'))).toEqual([1, 0, 0, 1, 100, 50]);
    svg.remove();
  });

  it('composes nested group transforms (outer + inner) — shape transform NOT included', () => {
    const svg = buildSvg();
    const outer = makeG(svg, 'outer', '0,0,0,0', 'translate(100, 0)');
    const inner = makeG(outer, 'inner', '0,0,0,0', 'translate(0, 50)');
    makeG(inner, 'shape', '0,0,10,10', 'translate(7, 7)');
    // Parent matrix should NOT include shape's own (7,7) — only the
    // ancestor chain. translate(100,0) * translate(0,50) = translate(100,50).
    expect(getRenderedParentMatrix(svg, toNodeId('shape'))).toEqual([1, 0, 0, 1, 100, 50]);
    svg.remove();
  });
});

describe('getCombinedBBox', () => {
  it('returns null when no ids are rendered', () => {
    const svg = buildSvg();
    expect(getCombinedBBox(svg, [toNodeId('x'), toNodeId('y')])).toBeNull();
    svg.remove();
  });

  it('returns the union of all rendered bboxes', () => {
    const svg = buildSvg();
    makeG(svg, 'a', '0,0,50,50');
    makeG(svg, 'b', '100,100,30,30');
    const combined = getCombinedBBox(svg, [toNodeId('a'), toNodeId('b')]);
    expect(combined).toEqual({ x: 0, y: 0, width: 130, height: 130 });
    svg.remove();
  });

  it('skips ids that do not resolve to a rendered element', () => {
    const svg = buildSvg();
    makeG(svg, 'a', '10,10,20,20');
    const combined = getCombinedBBox(svg, [toNodeId('a'), toNodeId('missing')]);
    expect(combined).toEqual({ x: 10, y: 10, width: 20, height: 20 });
    svg.remove();
  });
});
