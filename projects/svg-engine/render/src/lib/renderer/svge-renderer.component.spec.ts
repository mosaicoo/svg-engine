import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  bbox,
  type BoundingBox,
  createGroup,
  createRect,
  type SvgNode,
} from '@mosaicoo/svg-engine/core';
import { ViewportService } from '../viewport/viewport.service';
import { projectDocumentToRenderer, SvgeRenderer } from './svge-renderer.component';

@Component({
  selector: 'svge-test-host-renderer',
  standalone: true,
  imports: [SvgeRenderer],
  template: `
    <svge-renderer
      [tree]="tree()"
      [viewBox]="viewBox()"
      [width]="width()"
      [height]="height()"
      [ariaLabel]="label()"
    />
  `,
})
class HostRendererComponent {
  readonly tree = signal<SvgNode>(createGroup([]));
  readonly viewBox = signal<BoundingBox | null>(null);
  readonly width = signal<number | null>(null);
  readonly height = signal<number | null>(null);
  readonly label = signal<string | null>(null);
}

function mount() {
  TestBed.configureTestingModule({ imports: [HostRendererComponent] });
  const fixture = TestBed.createComponent(HostRendererComponent);
  fixture.detectChanges();
  const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;
  return { fixture, svg, viewport: TestBed.inject(ViewportService) };
}

describe('SvgeRenderer', () => {
  it('renders an <svg> element with role="img"', () => {
    const { svg } = mount();
    expect(svg).not.toBeNull();
    expect(svg.getAttribute('role')).toBe('img');
  });

  it('binds aria-label when provided', () => {
    const { svg, fixture } = mount();
    fixture.componentInstance.label.set('My drawing');
    fixture.detectChanges();
    expect(svg.getAttribute('aria-label')).toBe('My drawing');
  });

  it('uses explicit viewBox as seed (zoom=1, pan=0 → matches input exactly)', () => {
    const { svg, fixture } = mount();
    fixture.componentInstance.viewBox.set(bbox(10, 20, 100, 50));
    fixture.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('10 20 100 50');
  });

  it('uses ViewportService viewBox when input is null', () => {
    const { svg, viewport, fixture } = mount();
    viewport.setContentBox(bbox(0, 0, 200, 200));
    viewport.reset();
    fixture.componentInstance.viewBox.set(null);
    fixture.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 200');
  });

  it('mirrors explicit viewBox into ViewportService.contentBox', () => {
    const { fixture, viewport } = mount();
    fixture.componentInstance.viewBox.set(bbox(5, 5, 50, 50));
    fixture.detectChanges();
    expect(viewport.contentBox()).toEqual({ x: 5, y: 5, width: 50, height: 50 });
  });

  it('zoom on ViewportService updates the rendered viewBox even when input is set', () => {
    const { svg, viewport, fixture } = mount();
    fixture.componentInstance.viewBox.set(bbox(0, 0, 800, 600));
    fixture.detectChanges();
    // Sanity: zoom=1 → viewBox attribute matches the seed
    expect(svg.getAttribute('viewBox')).toBe('0 0 800 600');

    // Zoom in 2× → window halves to 400×300, centered
    viewport.setZoom(2);
    fixture.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('200 150 400 300');

    // Zoom back out → original
    viewport.reset();
    fixture.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('0 0 800 600');
  });

  it('pan on ViewportService updates the rendered viewBox even when input is set', () => {
    const { svg, viewport, fixture } = mount();
    fixture.componentInstance.viewBox.set(bbox(0, 0, 800, 600));
    fixture.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('0 0 800 600');

    viewport.setPan(50, 30);
    fixture.detectChanges();
    expect(svg.getAttribute('viewBox')).toBe('50 30 800 600');
  });

  it('renders the children of the input tree', () => {
    const { fixture, svg } = mount();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    fixture.componentInstance.tree.set(createGroup([rect]));
    fixture.detectChanges();
    expect(svg.querySelector(`g[data-node-id="${rect.id}"] rect`)).not.toBeNull();
  });

  it('width/height bind to the SVG element when provided', () => {
    const { fixture, svg } = mount();
    fixture.componentInstance.width.set(800);
    fixture.componentInstance.height.set(600);
    fixture.detectChanges();
    expect(svg.getAttribute('width')).toBe('800');
    expect(svg.getAttribute('height')).toBe('600');
  });
});

describe('projectDocumentToRenderer', () => {
  it('extracts root and viewBox from a document', () => {
    const doc = {
      id: 'd1' as never,
      viewBox: bbox(0, 0, 100, 100),
      root: createGroup([]),
    };
    const proj = projectDocumentToRenderer(doc);
    expect(proj.tree).toBe(doc.root);
    expect(proj.viewBox).toBe(doc.viewBox);
  });
});
