import { toNodeId } from 'svg-engine/core';
import { findRenderedNode, getCombinedBBox, getRenderedNodeBBox } from './node-bbox';

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
