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
