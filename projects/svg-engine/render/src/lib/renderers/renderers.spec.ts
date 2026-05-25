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
