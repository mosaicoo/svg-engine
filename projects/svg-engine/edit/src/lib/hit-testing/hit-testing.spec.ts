import { createGroup, createRect, toNodeId, withLayerFlag, withPageFlag } from 'svg-engine/core';
import {
  collectNodeAncestorIds,
  findOwningNodeId,
  organizationalContainerPredicate,
  resolveNodeIdFromEvent,
  resolveSelectableNodeId,
  resolveSelectableNodeIdFromElement,
} from './hit-testing';

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

describe('collectNodeAncestorIds', () => {
  it('returns ids deepest-first up to the document root', () => {
    const { rect } = makeSvgTree();
    expect(collectNodeAncestorIds(rect)).toEqual([toNodeId('inner-id'), toNodeId('outer-id')]);
  });

  it('returns an empty array when no ancestor carries data-node-id', () => {
    const { bg } = makeSvgTree();
    expect(collectNodeAncestorIds(bg)).toEqual([]);
  });
});

describe('resolveSelectableNodeId — deep mode', () => {
  it('returns the deepest id (same as resolveNodeIdFromEvent)', () => {
    const { rect } = makeSvgTree();
    const event = { target: rect } as unknown as Event;
    expect(resolveSelectableNodeId(event, { mode: 'deep', rootId: toNodeId('outer-id') })).toBe(
      'inner-id',
    );
  });
});

describe('resolveSelectableNodeId — group mode', () => {
  it('returns the direct child of the document root when no isolation', () => {
    const { rect } = makeSvgTree();
    // Chain on `rect` is [inner-id, outer-id]; outer is the document
    // root, so the topmost selectable is the one before it → inner-id.
    const event = { target: rect } as unknown as Event;
    expect(resolveSelectableNodeId(event, { mode: 'group', rootId: toNodeId('outer-id') })).toBe(
      'inner-id',
    );
  });

  it('returns the direct child of the isolation root when active', () => {
    // Build a 3-level chain so isolation has somewhere to scope to.
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const root = document.createElementNS(SVG_NS, 'g');
    root.setAttribute('data-node-id', 'root');
    const lvl1 = document.createElementNS(SVG_NS, 'g');
    lvl1.setAttribute('data-node-id', 'lvl1');
    const lvl2 = document.createElementNS(SVG_NS, 'g');
    lvl2.setAttribute('data-node-id', 'lvl2');
    const leaf = document.createElementNS(SVG_NS, 'rect');
    leaf.setAttribute('data-node-id', 'leaf');
    lvl2.appendChild(leaf);
    lvl1.appendChild(lvl2);
    root.appendChild(lvl1);
    const event = { target: leaf } as unknown as Event;
    // Without isolation: returns child of root = lvl1
    expect(resolveSelectableNodeId(event, { mode: 'group', rootId: toNodeId('root') })).toBe(
      'lvl1',
    );
    // With isolation on lvl1: returns child of lvl1 = lvl2
    expect(
      resolveSelectableNodeId(event, {
        mode: 'group',
        rootId: toNodeId('root'),
        isolationRootId: toNodeId('lvl1'),
      }),
    ).toBe('lvl2');
    // With isolation on lvl2: returns child of lvl2 = leaf
    expect(
      resolveSelectableNodeId(event, {
        mode: 'group',
        rootId: toNodeId('root'),
        isolationRootId: toNodeId('lvl2'),
      }),
    ).toBe('leaf');
  });

  it('returns null when the click target is not under the scope root (out of isolation)', () => {
    // Two separate subtrees: scope is on subtreeA, click is in subtreeB.
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const subtreeA = document.createElementNS(SVG_NS, 'g');
    subtreeA.setAttribute('data-node-id', 'subA');
    const subtreeB = document.createElementNS(SVG_NS, 'g');
    subtreeB.setAttribute('data-node-id', 'subB');
    const leafB = document.createElementNS(SVG_NS, 'rect');
    leafB.setAttribute('data-node-id', 'leafB');
    subtreeB.appendChild(leafB);
    const event = { target: leafB } as unknown as Event;
    // Scope on subA; leafB's chain is [leafB, subB] — no `subA` in
    // the chain, so the resolver returns null.
    expect(
      resolveSelectableNodeId(event, {
        mode: 'group',
        rootId: toNodeId('docRoot'),
        isolationRootId: toNodeId('subA'),
      }),
    ).toBeNull();
  });

  it('returns the scope root itself when target IS the scope root element', () => {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const scopeRoot = document.createElementNS(SVG_NS, 'g');
    scopeRoot.setAttribute('data-node-id', 'scope');
    const event = { target: scopeRoot } as unknown as Event;
    expect(
      resolveSelectableNodeId(event, {
        mode: 'group',
        rootId: toNodeId('docRoot'),
        isolationRootId: toNodeId('scope'),
      }),
    ).toBe('scope');
  });
});

/**
 * **PAGES-FIX-3** — verifies that the active page can act as an
 * "implicit isolation root" so that click-on-shape inside a page
 * resolves to the SHAPE (not bubbles up to the page itself).
 *
 * The contract is: pass `isolationRootId: pageId` and the resolver
 * behaves exactly like a one-level isolation scoped to the page —
 * leaves selectable, page itself selectable when clicked directly,
 * clicks outside the page return null.
 */
describe('resolveSelectableNodeId — PAGES-FIX-3 (page-as-scope-root)', () => {
  function makePageDom() {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const docRoot = document.createElementNS(SVG_NS, 'g');
    docRoot.setAttribute('data-node-id', 'doc-root');
    const page = document.createElementNS(SVG_NS, 'g');
    page.setAttribute('data-node-id', 'page-1');
    const shape = document.createElementNS(SVG_NS, 'rect');
    shape.setAttribute('data-node-id', 'shape-1');
    page.appendChild(shape);
    docRoot.appendChild(page);
    return { docRoot, page, shape };
  }

  it('returns the shape (not the page) when clicking a shape inside the active page', () => {
    const { shape } = makePageDom();
    const event = { target: shape } as unknown as Event;
    expect(
      resolveSelectableNodeId(event, {
        mode: 'group',
        rootId: toNodeId('doc-root'),
        isolationRootId: toNodeId('page-1'),
      }),
    ).toBe('shape-1');
  });

  it('returns the page itself when clicking the page background', () => {
    const { page } = makePageDom();
    const event = { target: page } as unknown as Event;
    expect(
      resolveSelectableNodeId(event, {
        mode: 'group',
        rootId: toNodeId('doc-root'),
        isolationRootId: toNodeId('page-1'),
      }),
    ).toBe('page-1');
  });

  it('without the page-as-scope-root fix, clicking a shape would resolve to the page (regression guard)', () => {
    const { shape } = makePageDom();
    const event = { target: shape } as unknown as Event;
    // Demonstrates the BUG: with isolationRootId omitted, scopeRoot
    // falls back to `doc-root`, and the direct child of doc-root in
    // the chain is the page → page is selected instead of the shape.
    expect(
      resolveSelectableNodeId(event, {
        mode: 'group',
        rootId: toNodeId('doc-root'),
      }),
    ).toBe('page-1');
  });
});

/**
 * Layers/Pages are organizational containers, NOT functional groups —
 * group-mode selection must "see through" them: a shape directly in a
 * layer selects the SHAPE; a shape inside a group inside a layer selects
 * the GROUP. Driven by the `isTransparentContainer` predicate.
 */
describe('resolveSelectableNodeId — transparent containers (layers/pages)', () => {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  function el(tag: string, id: string): Element {
    const e = document.createElementNS(SVG_NS, tag);
    e.setAttribute('data-node-id', id);
    return e;
  }
  /** doc-root > page > layer > [group >] shape. Returns the shape element. */
  function makeLayeredDom(withGroup: boolean): Element {
    const docRoot = el('g', 'doc-root');
    const page = el('g', 'page');
    const layer = el('g', 'layer');
    const shape = el('rect', 'shape');
    if (withGroup) {
      const group = el('g', 'group');
      group.appendChild(shape);
      layer.appendChild(group);
    } else {
      layer.appendChild(shape);
    }
    page.appendChild(layer);
    docRoot.appendChild(page);
    return shape;
  }
  // Scope = the active page; layer + page are transparent.
  const opts = {
    mode: 'group' as const,
    rootId: toNodeId('doc-root'),
    isolationRootId: toNodeId('page'),
    isTransparentContainer: (id: string) => id === 'layer' || id === 'page',
  };

  it('selects the SHAPE when it lives directly in a layer', () => {
    const shape = makeLayeredDom(false);
    expect(resolveSelectableNodeId({ target: shape } as unknown as Event, opts)).toBe('shape');
  });

  it('selects the GROUP when the shape is inside a group inside a layer', () => {
    const shape = makeLayeredDom(true);
    expect(resolveSelectableNodeId({ target: shape } as unknown as Event, opts)).toBe('group');
  });

  it('WITHOUT the predicate, selects the layer (legacy/regression guard)', () => {
    const shape = makeLayeredDom(false);
    expect(
      resolveSelectableNodeId({ target: shape } as unknown as Event, {
        mode: 'group',
        rootId: toNodeId('doc-root'),
        isolationRootId: toNodeId('page'),
      }),
    ).toBe('layer');
  });
});

describe('resolveSelectableNodeIdFromElement — D-091 (element-based twin)', () => {
  it('returns null for a null element', () => {
    expect(
      resolveSelectableNodeIdFromElement(null, { mode: 'group', rootId: toNodeId('root') }),
    ).toBeNull();
  });

  it('resolves group mode from an element exactly like the event-based resolver', () => {
    const { rect } = makeSvgTree();
    // Same scenario as the event-based group-mode test: chain [inner, outer],
    // outer = doc root → topmost selectable = inner.
    expect(
      resolveSelectableNodeIdFromElement(rect, { mode: 'group', rootId: toNodeId('outer-id') }),
    ).toBe('inner-id');
    // And the event-based resolver delegates to it (parity).
    expect(
      resolveSelectableNodeId({ target: rect } as unknown as Event, {
        mode: 'group',
        rootId: toNodeId('outer-id'),
      }),
    ).toBe('inner-id');
  });

  it('resolves deep mode to the closest owning id', () => {
    const { rect } = makeSvgTree();
    expect(
      resolveSelectableNodeIdFromElement(rect, { mode: 'deep', rootId: toNodeId('outer-id') }),
    ).toBe('inner-id');
  });
});

describe('organizationalContainerPredicate', () => {
  it('flags layer + page ids as transparent, plain groups/shapes as not', () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const plainGroup = createGroup([]);
    const layer = withLayerFlag(createGroup([]));
    const page = withPageFlag(createGroup([]), { x: 0, y: 0, width: 100, height: 100 });
    const root = createGroup([rect, plainGroup, layer, page]);
    const isTransparent = organizationalContainerPredicate(root);
    expect(isTransparent(layer.id)).toBe(true);
    expect(isTransparent(page.id)).toBe(true);
    expect(isTransparent(plainGroup.id)).toBe(false);
    expect(isTransparent(rect.id)).toBe(false);
  });
});
