import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ViewportService } from 'svg-engine/render';
import { GuidesOverlay } from './guides-overlay.component';
import { WorkspaceService } from './workspace.service';

@Component({
  standalone: true,
  imports: [GuidesOverlay],
  template: `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="200" height="200">
      <g svgeGuidesOverlay></g>
    </svg>
  `,
})
class TestHost {}

function setup() {
  TestBed.configureTestingModule({ imports: [TestHost] });
  const fixture = TestBed.createComponent(TestHost);
  document.body.appendChild(fixture.nativeElement);
  const ws = TestBed.inject(WorkspaceService);
  ws.clearGuides();
  const viewport = TestBed.inject(ViewportService);
  viewport.reset();
  fixture.detectChanges();
  return { fixture, ws, viewport };
}

function hitZones(host: HTMLElement): SVGLineElement[] {
  return Array.from(host.querySelectorAll<SVGLineElement>('line.guide-hit'));
}

describe('GuidesOverlay — render', () => {
  it('renders no lines when no guides exist', () => {
    const { fixture } = setup();
    expect(hitZones(fixture.nativeElement).length).toBe(0);
  });

  it('renders one hit-zone line + one visible line per guide', () => {
    const { fixture, ws } = setup();
    ws.addGuide('h', 50);
    ws.addGuide('v', 30);
    fixture.detectChanges();
    expect(hitZones(fixture.nativeElement).length).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('line.guide').length).toBe(2);
  });

  it('horizontal hit-zone has ns-resize cursor; vertical has ew-resize', () => {
    const { fixture, ws } = setup();
    ws.addGuide('h', 50);
    ws.addGuide('v', 30);
    fixture.detectChanges();
    const hits = hitZones(fixture.nativeElement);
    expect(hits[0]?.classList.contains('ns')).toBe(true);
    expect(hits[1]?.classList.contains('ew')).toBe(true);
  });
});

describe('GuidesOverlay — dblclick removes', () => {
  it('double-clicking a guide removes it via WorkspaceService.removeGuide', () => {
    const { fixture, ws } = setup();
    ws.addGuide('h', 50);
    fixture.detectChanges();
    expect(ws.guides().length).toBe(1);
    const hit = hitZones(fixture.nativeElement)[0]!;
    hit.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    expect(ws.guides().length).toBe(0);
  });
});

describe('GuidesOverlay — clipBounds fallback', () => {
  /**
   * jsdom doesn't implement `getScreenCTM`, so `computeClipBoundsFromCtm`
   * returns null and the overlay falls back to `viewport.viewBox()`.
   * Guides should still render with sensible endpoints — verifying the
   * fallback path here prevents a regression where a missing CTM
   * silently collapses the lines to length 0.
   */
  it('falls back to viewport.viewBox() bounds when getScreenCTM is unavailable (jsdom)', () => {
    const { fixture, ws, viewport } = setup();
    // Viewport default in jsdom is contentBox = {0,0,800,600} at zoom=1.
    const vb = viewport.viewBox();
    ws.addGuide('h', 100);
    ws.addGuide('v', 200);
    fixture.detectChanges();
    const visible = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<SVGLineElement>('line.guide'),
    );
    expect(visible.length).toBe(2);
    // Horizontal guide spans the full viewBox horizontally.
    const h = visible.find((l) => l.classList.contains('horizontal'))!;
    expect(Number(h.getAttribute('x1'))).toBe(vb.x);
    expect(Number(h.getAttribute('x2'))).toBe(vb.x + vb.width);
    expect(Number(h.getAttribute('y1'))).toBe(100);
    // Vertical guide spans the full viewBox vertically.
    const v = visible.find((l) => l.classList.contains('vertical'))!;
    expect(Number(v.getAttribute('y1'))).toBe(vb.y);
    expect(Number(v.getAttribute('y2'))).toBe(vb.y + vb.height);
    expect(Number(v.getAttribute('x1'))).toBe(200);
  });

  it('updates guide endpoints when viewport pans (still on fallback path)', () => {
    const { fixture, ws, viewport } = setup();
    ws.addGuide('h', 50);
    fixture.detectChanges();
    viewport.pan(100, 0);
    fixture.detectChanges();
    const h = (fixture.nativeElement as HTMLElement).querySelector<SVGLineElement>(
      'line.guide.horizontal',
    )!;
    const expectedVb = viewport.viewBox();
    expect(Number(h.getAttribute('x1'))).toBeCloseTo(expectedVb.x, 6);
    expect(Number(h.getAttribute('x2'))).toBeCloseTo(expectedVb.x + expectedVb.width, 6);
  });
});

describe('GuidesOverlay — drag state machine', () => {
  /**
   * jsdom doesn't implement `getScreenCTM()`. The drag handlers
   * bail early when `screenToDoc` returns null (no CTM), so this
   * test verifies the early-bail behavior is safe (no errors).
   *
   * Real drag-distance assertions live in the browser via manual
   * QA — the math is identical to SelectionOverlay's screenToDoc
   * which is already covered in its own component (transformation
   * via SVGMatrix is browser-implemented; we can't fake it sanely).
   */
  it('pointerdown without screen CTM (jsdom) does not throw', () => {
    const { fixture, ws } = setup();
    ws.addGuide('h', 50);
    fixture.detectChanges();
    const hit = hitZones(fixture.nativeElement)[0]!;
    expect(() => {
      hit.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, pointerId: 1 }),
      );
      hit.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 20, pointerId: 1 }),
      );
      hit.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: 10, clientY: 20, pointerId: 1 }),
      );
    }).not.toThrow();
    // Guide position unchanged (drag never started due to null CTM).
    expect(ws.guides()[0]?.position).toBe(50);
  });
});

describe('GuidesOverlay — locked (D-121)', () => {
  it('hit-zones carry the locked class + tabindex -1 when guides are locked', () => {
    const { fixture, ws } = setup();
    ws.addGuide('h', 50);
    ws.setGuidesLocked(true);
    fixture.detectChanges();
    const hit = hitZones(fixture.nativeElement)[0]!;
    expect(hit.classList.contains('locked')).toBe(true);
    expect(hit.getAttribute('tabindex')).toBe('-1');
  });

  it('double-clicking a locked guide does NOT remove it', () => {
    const { fixture, ws } = setup();
    ws.addGuide('h', 50);
    ws.setGuidesLocked(true);
    fixture.detectChanges();
    const hit = hitZones(fixture.nativeElement)[0]!;
    hit.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    expect(ws.guides().length).toBe(1); // still present — lock blocked the remove
  });

  it('Delete keydown on a locked guide does NOT remove it', () => {
    const { fixture, ws } = setup();
    ws.addGuide('h', 50);
    ws.setGuidesLocked(true);
    fixture.detectChanges();
    const hit = hitZones(fixture.nativeElement)[0]!;
    hit.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    fixture.detectChanges();
    expect(ws.guides().length).toBe(1);
  });

  it('unlocking restores interactivity (dblclick removes again)', () => {
    const { fixture, ws } = setup();
    ws.addGuide('h', 50);
    ws.setGuidesLocked(true);
    fixture.detectChanges();
    ws.setGuidesLocked(false);
    fixture.detectChanges();
    const hit = hitZones(fixture.nativeElement)[0]!;
    expect(hit.classList.contains('locked')).toBe(false);
    hit.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    expect(ws.guides().length).toBe(0);
  });
});
