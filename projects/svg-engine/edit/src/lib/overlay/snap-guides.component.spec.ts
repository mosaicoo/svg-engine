import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SnapService } from '../snap/snap.service';
import { SnapGuides } from './snap-guides.component';

@Component({
  standalone: true,
  imports: [SnapGuides],
  template: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <svg:g svgeSnapGuides></svg:g>
  </svg>`,
})
class TestHost {}

function setup() {
  TestBed.configureTestingModule({ imports: [TestHost] });
  const fixture = TestBed.createComponent(TestHost);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const svc = TestBed.inject(SnapService);
  svc.clearActiveGuides();
  return { fixture, svc };
}

function findGuides(host: HTMLElement): SVGLineElement[] {
  return Array.from(host.querySelectorAll<SVGLineElement>('line.guide'));
}

describe('SnapGuides component (g[svgeSnapGuides])', () => {
  it('renders nothing when there are no active guides', () => {
    const { fixture } = setup();
    expect(findGuides(fixture.nativeElement)).toEqual([]);
  });

  it('renders one vertical line per x guide', () => {
    const { fixture, svc } = setup();
    svc.setActiveGuides([{ axis: 'x', value: 100, source: 'grid' }]);
    fixture.detectChanges();
    const guides = findGuides(fixture.nativeElement);
    expect(guides.length).toBe(1);
    expect(guides[0]!.getAttribute('x1')).toBe('100');
    expect(guides[0]!.getAttribute('x2')).toBe('100');
    // y1/y2 cover the viewport span
    expect(guides[0]!.classList.contains('grid')).toBe(true);
  });

  it('renders one horizontal line per y guide', () => {
    const { fixture, svc } = setup();
    svc.setActiveGuides([{ axis: 'y', value: 50, source: 'object' }]);
    fixture.detectChanges();
    const guides = findGuides(fixture.nativeElement);
    expect(guides.length).toBe(1);
    expect(guides[0]!.getAttribute('y1')).toBe('50');
    expect(guides[0]!.getAttribute('y2')).toBe('50');
    expect(guides[0]!.classList.contains('object')).toBe(true);
  });

  it('extends each guide far beyond the viewBox (infinite-line behavior)', () => {
    // The renderer letterboxes its viewBox (preserveAspectRatio meet), so a
    // guide bounded by the viewBox stops short of the canvas edge. Guides
    // must over-reach the viewport (default contentBox 800x600) on the
    // spanning axis; the host .canvas-cell clips the excess. Endpoints are
    // off-screen by design — we assert they are well outside the viewport.
    const { fixture, svc } = setup();
    svc.setActiveGuides([
      { axis: 'y', value: 50, source: 'object' }, // horizontal line (spans X)
      { axis: 'x', value: 100, source: 'grid' }, // vertical line (spans Y)
    ]);
    fixture.detectChanges();
    const [horizontal, vertical] = findGuides(fixture.nativeElement);
    // Horizontal line reaches far left of origin and far right of the
    // 800-wide viewport — not clamped to the viewBox width.
    expect(Number(horizontal!.getAttribute('x1'))).toBeLessThan(-100);
    expect(Number(horizontal!.getAttribute('x2'))).toBeGreaterThan(900);
    // Vertical line reaches far above origin and far below the 600-tall
    // viewport — not clamped to the viewBox height.
    expect(Number(vertical!.getAttribute('y1'))).toBeLessThan(-100);
    expect(Number(vertical!.getAttribute('y2'))).toBeGreaterThan(700);
  });

  it('clears guides reactively when service clears', () => {
    const { fixture, svc } = setup();
    svc.setActiveGuides([{ axis: 'x', value: 0, source: 'grid' }]);
    fixture.detectChanges();
    expect(findGuides(fixture.nativeElement).length).toBe(1);
    svc.clearActiveGuides();
    fixture.detectChanges();
    expect(findGuides(fixture.nativeElement).length).toBe(0);
  });
});
