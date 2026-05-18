import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PageOverlay } from './page-overlay.component';
import { WorkspaceService } from './workspace.service';

/**
 * Tiny SVG harness — the PageOverlay component's selector is
 * `g[svgePageOverlay]` so we must mount it inside an `<svg:g>` inside
 * an `<svg>` to give the SVG namespace its proper home.
 */
@Component({
  standalone: true,
  imports: [PageOverlay],
  template: `<svg xmlns="http://www.w3.org/2000/svg">
    <svg:g svgePageOverlay></svg:g>
  </svg>`,
})
class TestHost {}

function setup() {
  TestBed.configureTestingModule({ imports: [TestHost] });
  const ws = TestBed.inject(WorkspaceService);
  ws.resetPage();
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  return { ws, fixture };
}

function pageRect(host: HTMLElement): SVGRectElement | null {
  return host.querySelector('.page-rect');
}

function marginRect(host: HTMLElement): SVGRectElement | null {
  return host.querySelector('.margin-rect');
}

describe('PageOverlay — default render', () => {
  it('renders a page rect with default DEFAULT_PAGE dimensions (800×600 landscape)', () => {
    const { fixture } = setup();
    const r = pageRect(fixture.nativeElement);
    expect(r).not.toBeNull();
    expect(r?.getAttribute('width')).toBe('800');
    expect(r?.getAttribute('height')).toBe('600');
    expect(r?.getAttribute('x')).toBe('0');
    expect(r?.getAttribute('y')).toBe('0');
  });

  it('does NOT render the margin rect when all margins are zero', () => {
    const { fixture } = setup();
    expect(marginRect(fixture.nativeElement)).toBeNull();
  });
});

describe('PageOverlay — reacts to WorkspaceService.patchPage', () => {
  it('width / height change reflects immediately on the rect attributes', () => {
    const { ws, fixture } = setup();
    ws.patchPage({ width: 400, height: 300 });
    fixture.detectChanges();
    const r = pageRect(fixture.nativeElement);
    expect(r?.getAttribute('width')).toBe('400');
    expect(r?.getAttribute('height')).toBe('300');
  });

  it('orientation portrait with landscape-shaped dims swaps width/height', () => {
    const { ws, fixture } = setup();
    // Page is 800×600 (landscape-shaped). Asking portrait → swap to 600×800.
    ws.patchPage({ orientation: 'portrait' });
    fixture.detectChanges();
    const r = pageRect(fixture.nativeElement);
    expect(r?.getAttribute('width')).toBe('600');
    expect(r?.getAttribute('height')).toBe('800');
  });

  it('orientation portrait with already-portrait dims does NOT swap', () => {
    const { ws, fixture } = setup();
    ws.patchPage({ width: 400, height: 700, orientation: 'portrait' });
    fixture.detectChanges();
    const r = pageRect(fixture.nativeElement);
    expect(r?.getAttribute('width')).toBe('400');
    expect(r?.getAttribute('height')).toBe('700');
  });
});

describe('PageOverlay — margins', () => {
  it('renders the inset dashed rect when any margin > 0', () => {
    const { ws, fixture } = setup();
    ws.patchPage({ margins: { top: 10, right: 20, bottom: 10, left: 20 } });
    fixture.detectChanges();
    const m = marginRect(fixture.nativeElement);
    expect(m).not.toBeNull();
    // page = 800×600 landscape; inset 10/20/10/20 → 760×580 at (20,10)
    expect(m?.getAttribute('x')).toBe('20');
    expect(m?.getAttribute('y')).toBe('10');
    expect(m?.getAttribute('width')).toBe('760');
    expect(m?.getAttribute('height')).toBe('580');
  });

  it('does NOT render margin rect when margins exceed page (invalid combo)', () => {
    const { ws, fixture } = setup();
    // Margins that consume the whole page or more → no inner rect.
    ws.patchPage({
      width: 100,
      height: 100,
      margins: { top: 50, right: 60, bottom: 50, left: 60 },
    });
    fixture.detectChanges();
    expect(marginRect(fixture.nativeElement)).toBeNull();
  });
});
