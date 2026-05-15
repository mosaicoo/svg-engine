import { findOwningNodeId, resolveNodeIdFromEvent } from './hit-testing';

function makeSvgTree(): {
  root: SVGSVGElement;
  outer: Element;
  inner: Element;
  rect: Element;
  bg: Element;
} {
  // Build via DOM directly so we exercise the helper against real SVG
  // namespaced elements (jsdom supports this).
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const root = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  const outer = document.createElementNS(SVG_NS, 'g');
  outer.setAttribute('data-node-id', 'outer-id');
  const inner = document.createElementNS(SVG_NS, 'g');
  inner.setAttribute('data-node-id', 'inner-id');
  const rect = document.createElementNS(SVG_NS, 'rect');
  // bg = element inside <svg> but outside any node-id chain
  const bg = document.createElementNS(SVG_NS, 'g');
  inner.appendChild(rect);
  outer.appendChild(inner);
  root.appendChild(outer);
  root.appendChild(bg);
  return { root, outer, inner, rect, bg };
}

describe('findOwningNodeId', () => {
  it('returns null for null target', () => {
    expect(findOwningNodeId(null)).toBeNull();
  });

  it('returns the closest ancestor data-node-id', () => {
    const { rect } = makeSvgTree();
    expect(findOwningNodeId(rect)).toBe('inner-id');
  });

  it("returns the element's own id when it carries data-node-id", () => {
    const { outer } = makeSvgTree();
    expect(findOwningNodeId(outer)).toBe('outer-id');
  });

  it('returns null when no ancestor has data-node-id', () => {
    const { bg } = makeSvgTree();
    expect(findOwningNodeId(bg)).toBeNull();
  });

  it('walks up multiple levels to find the owner', () => {
    const { rect, inner } = makeSvgTree();
    // The closest is `inner`, but if we removed inner's attribute, we
    // should fall through to `outer`.
    inner.removeAttribute('data-node-id');
    expect(findOwningNodeId(rect)).toBe('outer-id');
  });
});

describe('resolveNodeIdFromEvent', () => {
  it('returns null for events whose target is not an Element', () => {
    const event = { target: null } as unknown as Event;
    expect(resolveNodeIdFromEvent(event)).toBeNull();
  });

  it('returns the closest ancestor id for a real DOM event', () => {
    const { rect } = makeSvgTree();
    const event = { target: rect } as unknown as Event;
    expect(resolveNodeIdFromEvent(event)).toBe('inner-id');
  });

  it('returns null when target is below an svg with no node ancestors', () => {
    const { bg } = makeSvgTree();
    const event = { target: bg } as unknown as Event;
    expect(resolveNodeIdFromEvent(event)).toBeNull();
  });
});
