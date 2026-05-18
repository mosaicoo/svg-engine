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
