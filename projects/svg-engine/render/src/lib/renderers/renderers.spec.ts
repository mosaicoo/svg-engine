import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
  type SvgNode,
  translate,
} from 'svg-engine/core';
import { SvgeNodeRenderer } from './node-renderer.component';

@Component({
  selector: 'svge-test-host-svg',
  standalone: true,
  imports: [SvgeNodeRenderer],
  template: `<svg><svg:g svgeNode [node]="node()"></svg:g></svg>`,
})
class HostSvgComponent {
  readonly node = signal<SvgNode>(createRect({ x: 0, y: 0, width: 1, height: 1 }));
}

function mount(node: SvgNode): {
  fixture: ReturnType<typeof TestBed.createComponent<HostSvgComponent>>;
  svg: SVGSVGElement;
} {
  TestBed.configureTestingModule({ imports: [HostSvgComponent] });
  const fixture = TestBed.createComponent(HostSvgComponent);
  fixture.componentInstance.node.set(node);
  fixture.detectChanges();
  const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
  return { fixture, svg };
}

describe('Renderer dispatch — built-in node types', () => {
  it('renders a <rect> with geometry attributes and data-node-id', () => {
    const node = createRect({ x: 10, y: 20, width: 30, height: 40 });
    const { svg } = mount(node);
    const g = svg.querySelector(`g[data-node-id="${node.id}"]`);
    expect(g).not.toBeNull();
    const rect = g!.querySelector('rect');
    expect(rect).not.toBeNull();
    expect(rect!.getAttribute('x')).toBe('10');
    expect(rect!.getAttribute('y')).toBe('20');
    expect(rect!.getAttribute('width')).toBe('30');
    expect(rect!.getAttribute('height')).toBe('40');
  });

  it('omits transform attribute for identity transform', () => {
    const node = createRect({ x: 0, y: 0, width: 1, height: 1 });
    const { svg } = mount(node);
    const g = svg.querySelector(`g[data-node-id="${node.id}"]`);
    expect(g!.hasAttribute('transform')).toBe(false);
  });

  it('emits transform="matrix(...)" when non-identity', () => {
    const node = createRect({ x: 0, y: 0, width: 1, height: 1 }, { transform: translate(5, 7) });
    const { svg } = mount(node);
    const g = svg.querySelector(`g[data-node-id="${node.id}"]`);
    expect(g!.getAttribute('transform')).toBe('matrix(1 0 0 1 5 7)');
  });

  it('renders <ellipse>', () => {
    const node = createEllipse({ cx: 50, cy: 60, rx: 10, ry: 5 });
    const { svg } = mount(node);
    const el = svg.querySelector(`g[data-node-id="${node.id}"] ellipse`);
    expect(el).not.toBeNull();
    expect(el!.getAttribute('cx')).toBe('50');
    expect(el!.getAttribute('rx')).toBe('10');
  });

  it('renders <line>', () => {
    const node = createLine({ x1: 0, y1: 0, x2: 100, y2: 50 });
    const { svg } = mount(node);
    const el = svg.querySelector(`g[data-node-id="${node.id}"] line`);
    expect(el).not.toBeNull();
    expect(el!.getAttribute('x2')).toBe('100');
  });

  it('renders <polygon> with serialized points', () => {
    const node = createPolygon([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 10 },
    ]);
    const { svg } = mount(node);
    const el = svg.querySelector(`g[data-node-id="${node.id}"] polygon`);
    expect(el!.getAttribute('points')).toBe('0,0 10,0 5,10');
  });

  it('renders <polyline> with fill defaulting to none', () => {
    const node = createPolyline([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
    ]);
    const { svg } = mount(node);
    const el = svg.querySelector(`g[data-node-id="${node.id}"] polyline`);
    expect(el).not.toBeNull();
    expect(el!.getAttribute('fill')).toBeTruthy();
  });

  it('renders <path>', () => {
    const node = createPath('M0 0 L 10 10');
    const { svg } = mount(node);
    const el = svg.querySelector(`g[data-node-id="${node.id}"] path`);
    expect(el!.getAttribute('d')).toBe('M0 0 L 10 10');
  });

  it('renders <text> with content', () => {
    const node = createText({ x: 5, y: 15, content: 'Hello' });
    const { svg } = mount(node);
    const el = svg.querySelector(`g[data-node-id="${node.id}"] text`);
    expect(el!.textContent?.trim()).toBe('Hello');
    expect(el!.getAttribute('x')).toBe('5');
  });

  it('renders <image> with href', () => {
    const node = createImage({
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      href: 'data:image/png;base64,iVBORw0KGgo=',
    });
    const { svg } = mount(node);
    const el = svg.querySelector(`g[data-node-id="${node.id}"] image`);
    expect(el!.getAttribute('href')).toContain('data:image/png');
  });

  it('renders a <g> for group and recurses into children', () => {
    const child = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const node = createGroup([child]);
    const { svg } = mount(node);
    const groupEl = svg.querySelector(`g[data-node-id="${node.id}"]`);
    expect(groupEl).not.toBeNull();
    const childRect = groupEl!.querySelector(`g[data-node-id="${child.id}"] rect`);
    expect(childRect).not.toBeNull();
  });

  it('renders nested groups recursively (3 levels deep)', () => {
    const leaf = createRect({ x: 0, y: 0, width: 1, height: 1 });
    const inner = createGroup([leaf]);
    const middle = createGroup([inner]);
    const root = createGroup([middle]);
    const { svg } = mount(root);
    const leafRect = svg.querySelector(`g[data-node-id="${leaf.id}"] rect`);
    expect(leafRect).not.toBeNull();
  });

  // ── GROUP-STYLE-FIX (A) — paint/filter/opacity on the group <g> ──
  // The wrapper <g> of a GROUP must express the group's own style; for
  // LEAF nodes the per-type directive paints the inner element and the
  // group-gated bindings stay null (no double-apply). Mirrors the
  // exporter, which already emits these on <g>.
  it('binds fill / stroke / stroke-width on the group wrapper <g>', () => {
    const group = createGroup([createRect({ x: 0, y: 0, width: 5, height: 5 })], {
      style: { fill: '#00ff00', stroke: '#ff00ff', strokeWidth: 3 },
    });
    const { svg } = mount(group);
    const g = svg.querySelector(`g[data-node-id="${group.id}"]`);
    expect(g!.getAttribute('fill')).toBe('#00ff00');
    expect(g!.getAttribute('stroke')).toBe('#ff00ff');
    expect(g!.getAttribute('stroke-width')).toBe('3');
  });

  it('binds filter + opacity (group-as-unit) on the group wrapper <g>', () => {
    const group = createGroup([createRect({ x: 0, y: 0, width: 5, height: 5 })], {
      style: { filter: 'url(#blur)', opacity: 0.5 },
    });
    const { svg } = mount(group);
    const g = svg.querySelector(`g[data-node-id="${group.id}"]`);
    expect(g!.getAttribute('filter')).toBe('url(#blur)');
    expect(g!.getAttribute('opacity')).toBe('0.5');
  });

  it('formats stroke-dasharray as a space-joined string on the group <g>', () => {
    const group = createGroup([createRect({ x: 0, y: 0, width: 5, height: 5 })], {
      style: { strokeDasharray: [4, 2] },
    });
    const { svg } = mount(group);
    const g = svg.querySelector(`g[data-node-id="${group.id}"]`);
    expect(g!.getAttribute('stroke-dasharray')).toBe('4 2');
  });

  it('emits NO paint/filter attrs for a group whose style is empty', () => {
    // Empty-style groups (e.g. via createGroup without style) must not
    // gain spurious attributes — regression guard for existing docs.
    const group = createGroup([createRect({ x: 0, y: 0, width: 5, height: 5 })], {
      style: {},
    });
    const { svg } = mount(group);
    const g = svg.querySelector(`g[data-node-id="${group.id}"]`);
    expect(g!.getAttribute('fill')).toBeNull();
    expect(g!.getAttribute('stroke')).toBeNull();
    expect(g!.getAttribute('filter')).toBeNull();
    expect(g!.getAttribute('opacity')).toBeNull();
  });

  it('does NOT bind a LEAF node style on its wrapper <g> (no double-apply)', () => {
    // Leaf paint lives on the inner element via the per-type directive;
    // the group-gated wrapper bindings must stay null for leaves so
    // filter/opacity are never applied twice.
    const rect = createRect(
      { x: 0, y: 0, width: 5, height: 5 },
      { style: { fill: '#123456', filter: 'url(#blur)' } },
    );
    const { svg } = mount(rect);
    const g = svg.querySelector(`g[data-node-id="${rect.id}"]`);
    const rectEl = svg.querySelector(`g[data-node-id="${rect.id}"] rect`);
    expect(g!.getAttribute('fill')).toBeNull();
    expect(g!.getAttribute('filter')).toBeNull();
    expect(rectEl!.getAttribute('fill')).toBe('#123456');
    expect(rectEl!.getAttribute('filter')).toBe('url(#blur)');
  });
});

// ── D-068 follow-up — id on <path> for textPath href resolution ────
//
// Bug: D-053 added textPath rendering (<text><textPath href="#id">),
// but the path-renderer never emitted `id` — only `data-node-id` on
// the wrapper <g>. SVG <textPath href> resolves the fragment against
// element ids (the standard `id` attribute), not `data-*`. Result:
// once the D-068 Inspector finally let users set textPathRef, the
// text disappeared because the path wasn't findable by id. Fix:
// emit `[attr.id]="node().id"` from path-renderer.directive.
describe('Path renderer — D-068 follow-up: emits id for textPath resolution', () => {
  it('emits id="..." on the <path> element matching the node id', () => {
    const node = createPath('M0 0 L10 10');
    const { svg } = mount(node);
    const path = svg.querySelector(`g[data-node-id="${node.id}"] path`);
    expect(path).not.toBeNull();
    expect(path!.getAttribute('id')).toBe(node.id);
  });

  it('id matches the node id 1:1 (textPath fragment resolution depends on this)', () => {
    // The whole point of emitting id is that a downstream <textPath
    // href="#…"> resolves the fragment. The exact equality check below
    // is what the browser does internally to match href fragments.
    // (Bypasses `querySelector('#...')` because UUIDs starting with a
    // digit aren't valid CSS selectors without CSS.escape, and jsdom's
    // CSS.escape support is uneven — DOM-level id comparison is the
    // right invariant to assert here, not the CSS selector ergonomics.)
    const node = createPath('M0 0 L1 1');
    const { svg } = mount(node);
    const path = svg.querySelector('path');
    expect(path).not.toBeNull();
    expect(path!.id).toBe(node.id);
    // Defensive: native getElementById uses string equality, not CSS
    // selectors — this is the path browsers take for `href="#…"`.
    expect(svg.ownerDocument.getElementById(node.id)).toBe(path);
  });
});

// ── D-069 — Text renderer: typography basics bindings ─────────────────
describe('Text renderer — D-069 typography basics', () => {
  it('emits font-style attribute when node.fontStyle is set', () => {
    const node: SvgNode = { ...createText({ x: 0, y: 0, content: 'Hi' }), fontStyle: 'italic' };
    const { svg } = mount(node);
    const text = svg.querySelector(`g[data-node-id="${node.id}"] text`);
    expect(text).not.toBeNull();
    expect(text!.getAttribute('font-style')).toBe('italic');
  });

  it('emits text-decoration attribute when node.textDecoration is set', () => {
    const node: SvgNode = {
      ...createText({ x: 0, y: 0, content: 'Hi' }),
      textDecoration: 'underline',
    };
    const { svg } = mount(node);
    const text = svg.querySelector(`g[data-node-id="${node.id}"] text`);
    expect(text!.getAttribute('text-decoration')).toBe('underline');
  });

  it('does NOT emit font-style/text-decoration when undefined', () => {
    const node = createText({ x: 0, y: 0, content: 'Hi' });
    const { svg } = mount(node);
    const text = svg.querySelector(`g[data-node-id="${node.id}"] text`);
    expect(text!.hasAttribute('font-style')).toBe(false);
    expect(text!.hasAttribute('text-decoration')).toBe(false);
  });

  it('multi-line tspan dy defaults to 1.2em when lineHeight is undefined', () => {
    const node = createText({ x: 0, y: 0, content: 'line 1\nline 2' });
    const { svg } = mount(node);
    const tspans = svg.querySelectorAll(`g[data-node-id="${node.id}"] tspan`);
    expect(tspans.length).toBe(2);
    // First tspan: dy='0' (no shift); second: dy='1.2em' (default)
    expect(tspans[0]!.getAttribute('dy')).toBe('0');
    expect(tspans[1]!.getAttribute('dy')).toBe('1.2em');
  });

  it('multi-line tspan dy uses node.lineHeight when set', () => {
    const node: SvgNode = {
      ...createText({ x: 0, y: 0, content: 'line 1\nline 2\nline 3' }),
      lineHeight: 1.5,
    };
    const { svg } = mount(node);
    const tspans = svg.querySelectorAll(`g[data-node-id="${node.id}"] tspan`);
    expect(tspans.length).toBe(3);
    expect(tspans[0]!.getAttribute('dy')).toBe('0');
    expect(tspans[1]!.getAttribute('dy')).toBe('1.5em');
    expect(tspans[2]!.getAttribute('dy')).toBe('1.5em');
  });

  it('lineHeight <= 0 or non-finite falls back to default 1.2 (defensive)', () => {
    const bad: SvgNode = {
      ...createText({ x: 0, y: 0, content: 'a\nb' }),
      lineHeight: 0,
    };
    const { svg } = mount(bad);
    const tspans = svg.querySelectorAll(`g[data-node-id="${bad.id}"] tspan`);
    expect(tspans[1]!.getAttribute('dy')).toBe('1.2em');
  });
});

describe('Text renderer — D-100 rich text (per-run styling)', () => {
  it('emits one tspan per run carrying its style overrides', () => {
    const node = createText({
      x: 0,
      y: 0,
      content: 'Hello world',
      runs: [{ text: 'Hello ' }, { text: 'world', fill: '#e00', fontWeight: 'bold' }],
    });
    const { svg } = mount(node);
    const tspans = svg.querySelectorAll(`g[data-node-id="${node.id}"] tspan`);
    expect(tspans.length).toBe(2);
    expect(tspans[0]!.textContent).toBe('Hello ');
    expect(tspans[1]!.textContent).toBe('world');
    expect(tspans[1]!.getAttribute('fill')).toBe('#e00');
    expect(tspans[1]!.getAttribute('font-weight')).toBe('bold');
    // No dy on rich-text runs — they're inline, not lines.
    expect(tspans[0]!.hasAttribute('dy')).toBe(false);
  });

  it('a run omitting a field does not emit that attribute (inherits parent)', () => {
    const node = createText({
      x: 0,
      y: 0,
      content: 'ab',
      runs: [{ text: 'a' }, { text: 'b', fill: '#08f' }],
    });
    const { svg } = mount(node);
    const tspans = svg.querySelectorAll(`g[data-node-id="${node.id}"] tspan`);
    expect(tspans[0]!.hasAttribute('fill')).toBe(false);
    expect(tspans[1]!.getAttribute('fill')).toBe('#08f');
  });

  it('runs take precedence over the multi-line \\n path', () => {
    // content has a newline but runs are present → render as inline runs,
    // not as dy-stacked lines.
    const node = createText({
      x: 0,
      y: 0,
      content: 'a b',
      runs: [{ text: 'a ' }, { text: 'b', fontStyle: 'italic' }],
    });
    const { svg } = mount(node);
    const tspans = svg.querySelectorAll(`g[data-node-id="${node.id}"] tspan`);
    expect(tspans.length).toBe(2);
    expect(tspans[0]!.hasAttribute('dy')).toBe(false);
  });

  it('empty runs array falls back to plain single-line text', () => {
    const node = createText({ x: 0, y: 0, content: 'plain', runs: [] });
    const { svg } = mount(node);
    const text = svg.querySelector(`g[data-node-id="${node.id}"] text`);
    expect(text!.querySelectorAll('tspan').length).toBe(0);
    expect(text!.textContent).toBe('plain');
  });
});
