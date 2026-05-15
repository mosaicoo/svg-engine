import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MarqueeService } from '../marquee/marquee.service';
import { Marquee } from './marquee.component';

@Component({
  standalone: true,
  imports: [Marquee],
  template: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <svg:g svgeMarquee></svg:g>
  </svg>`,
})
class TestHost {}

function setup() {
  TestBed.configureTestingModule({ imports: [TestHost] });
  const fixture = TestBed.createComponent(TestHost);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const svc = TestBed.inject(MarqueeService);
  svc.cancel();
  return { fixture, svc };
}

function findMarqueeRect(host: HTMLElement): SVGRectElement | null {
  return host.querySelector<SVGRectElement>('rect.marquee');
}

describe('Marquee component (g[svgeMarquee])', () => {
  it('renders nothing while no gesture is active', () => {
    const { fixture } = setup();
    expect(findMarqueeRect(fixture.nativeElement)).toBeNull();
  });

  it("renders a dashed rect with the service's current geometry", () => {
    const { fixture, svc } = setup();
    svc.start({ x: 10, y: 20 }, 'replace', new Set());
    svc.update({ x: 50, y: 60 });
    fixture.detectChanges();

    const rect = findMarqueeRect(fixture.nativeElement);
    expect(rect).not.toBeNull();
    expect(rect!.getAttribute('x')).toBe('10');
    expect(rect!.getAttribute('y')).toBe('20');
    expect(rect!.getAttribute('width')).toBe('40');
    expect(rect!.getAttribute('height')).toBe('40');
  });

  it('removes the rect when end() clears the gesture', () => {
    const { fixture, svc } = setup();
    svc.start({ x: 0, y: 0 }, 'replace', new Set());
    svc.update({ x: 30, y: 30 });
    fixture.detectChanges();
    expect(findMarqueeRect(fixture.nativeElement)).not.toBeNull();

    svc.end();
    fixture.detectChanges();
    expect(findMarqueeRect(fixture.nativeElement)).toBeNull();
  });

  it('updates reactively as the service signal changes', () => {
    const { fixture, svc } = setup();
    svc.start({ x: 0, y: 0 }, 'replace', new Set());
    svc.update({ x: 10, y: 10 });
    fixture.detectChanges();
    let rect = findMarqueeRect(fixture.nativeElement);
    expect(rect!.getAttribute('width')).toBe('10');

    svc.update({ x: 100, y: 50 });
    fixture.detectChanges();
    rect = findMarqueeRect(fixture.nativeElement);
    expect(rect!.getAttribute('width')).toBe('100');
    expect(rect!.getAttribute('height')).toBe('50');
  });
});
