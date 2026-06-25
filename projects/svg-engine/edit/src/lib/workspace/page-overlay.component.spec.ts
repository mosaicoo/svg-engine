import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  createEmptyDocument,
  createGroup,
  EditorStateService,
  type SvgDocument,
  withPageFlag,
} from '@mosaicoo/svg-engine/core';
import { SvgeRenderer } from '@mosaicoo/svg-engine/render';
import { describe, expect, it } from 'vitest';
import { ActivePageService } from '../pages/active-page.service';
import { PAGE_TOOL_ID } from '../tool/builtin-tools';
import { ToolHostService } from '../tool/tool-host.service';
import { ToolRegistry } from '../tool/tool-registry.service';
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

/**
 * **PAGES-REFACTOR follow-up** — activate the built-in Page tool so
 * `PageOverlay.pageNodeId()` un-gates and exposes the active page id
 * as a hit-target. The component's new gate (Artboard Tool pattern)
 * keeps `data-node-id` null + `pointer-events: none` whenever any
 * other tool is active so clicks on the empty page area fall through
 * to the canvas → `SelectionService.clear()`. Tests that want to
 * assert on the hit-target side of the gate must call this helper.
 *
 * Registers a minimal stub Tool because `ToolHostService.activate(id)`
 * validates the id is registered before promoting it.
 */
function activatePageTool(): void {
  const reg = TestBed.inject(ToolRegistry);
  reg.register({
    id: PAGE_TOOL_ID,
    label: 'Page',
    icon: 'aspect_ratio',
    cursor: 'default',
  });
  TestBed.inject(ToolHostService).activate(PAGE_TOOL_ID);
}

function marginRect(host: HTMLElement): SVGRectElement | null {
  return host.querySelector('.margin-rect');
}

// ── Regression guards for commit a20635b (z-order) ──────────────
// The page rect has fill rgba(255,255,255,0.5); if rendered ON TOP
// of shapes (front slot), it veils them with semi-transparent white.
// SvgeRenderer exposes a `<ng-content select="[svgeBehind]">` slot
// that puts projected elements UNDER the content. Consumers MUST
// write `<svg:g svgePageOverlay svgeBehind>` literally — Angular
// content projection is compile-time, so runtime host bindings on
// PageOverlay don't affect the slot. These specs prove the actual
// DOM ordering, not just attribute presence (a prior version of the
// spec only checked attribute presence and missed the bug).

@Component({
  standalone: true,
  imports: [SvgeRenderer, PageOverlay],
  template: `<svge-renderer [tree]="doc.root" [viewBox]="doc.viewBox">
    <svg:g svgePageOverlay svgeBehind></svg:g>
  </svge-renderer>`,
})
class WithBehindHost {
  readonly doc: SvgDocument = createEmptyDocument();
}

@Component({
  standalone: true,
  imports: [SvgeRenderer, PageOverlay],
  template: `<svge-renderer [tree]="doc.root" [viewBox]="doc.viewBox">
    <svg:g svgePageOverlay></svg:g>
  </svge-renderer>`,
})
class WithoutBehindHost {
  readonly doc: SvgDocument = createEmptyDocument();
}

describe('PageOverlay × SvgeRenderer — actual DOM projection slot (regression guard a20635b)', () => {
  it('WITH svgeBehind: page-overlay <g> renders BEFORE the content <g svgeNode> (behind slot)', () => {
    TestBed.configureTestingModule({ imports: [WithBehindHost] });
    const fixture = TestBed.createComponent(WithBehindHost);
    fixture.detectChanges();
    const svgEl: SVGSVGElement | null = fixture.nativeElement.querySelector('svg');
    expect(svgEl).not.toBeNull();
    const pageG = svgEl!.querySelector('g[svgepageoverlay]');
    const contentG = svgEl!.querySelector('g[svgenode]');
    expect(pageG).not.toBeNull();
    expect(contentG).not.toBeNull();
    // Node.compareDocumentPosition: returns DOCUMENT_POSITION_FOLLOWING (4)
    // when the parameter follows the current node. So pageG.compareDocumentPosition(contentG)
    // having FOLLOWING bit set means contentG comes AFTER pageG — i.e., pageG is BEHIND.
    const pos = pageG!.compareDocumentPosition(contentG!);
    expect((pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0).toBe(true);
  });

  it('WITHOUT svgeBehind (control case): page-overlay <g> renders AFTER the content (front slot)', () => {
    // This is the BUG that affected svge-editor + svge-shell-pro after
    // their creation. Documented as a control case so any future
    // refactor that breaks projection semantics fails loudly here.
    TestBed.configureTestingModule({ imports: [WithoutBehindHost] });
    const fixture = TestBed.createComponent(WithoutBehindHost);
    fixture.detectChanges();
    const svgEl: SVGSVGElement | null = fixture.nativeElement.querySelector('svg');
    const pageG = svgEl!.querySelector('g[svgepageoverlay]');
    const contentG = svgEl!.querySelector('g[svgenode]');
    expect(pageG).not.toBeNull();
    expect(contentG).not.toBeNull();
    const pos = pageG!.compareDocumentPosition(contentG!);
    // Without svgeBehind, contentG should PRECEDE pageG (bug condition).
    expect((pos & Node.DOCUMENT_POSITION_PRECEDING) !== 0).toBe(true);
  });
});

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

describe('PAGES-REFACTOR Fase 4 — PageOverlay as persistent hit-target', () => {
  /**
   * Without an active D-079 page (legacy single-root document) the rect
   * must remain click-through: no `data-node-id` AND
   * `pointer-events: none`. Otherwise the rect would intercept all
   * canvas clicks in pre-D-079 docs, breaking selection on shapes.
   */
  it('legacy doc (no active D-079 page): rect has no data-node-id and pointer-events=none', () => {
    const { fixture } = setup();
    const r = pageRect(fixture.nativeElement);
    expect(r).not.toBeNull();
    expect(r?.getAttribute('data-node-id')).toBeNull();
    expect(r?.getAttribute('pointer-events')).toBe('none');
  });

  /**
   * With an active D-079 page AND the Page tool active, the rect carries
   * the page's id and `pointer-events=all` so clicks resolve to the page
   * node via {@link findOwningNodeId}. This replaces the PAGES-FIX-4
   * hit-target rect that used to live inside the page's `<g>` in
   * node-renderer (the rect was re-mounted on every selection change,
   * producing the visible flicker the user reported in 2026-05-26).
   *
   * **PAGES-REFACTOR follow-up** — gated on the Page tool being active
   * (Artboard Tool pattern). The hit-target only un-mounts when the
   * user has explicitly entered Page tool mode; with any other tool
   * active the rect stays click-through so the page is purely visual
   * reference.
   */
  it('active D-079 page + Page tool active: rect carries data-node-id and pointer-events=all', () => {
    TestBed.configureTestingModule({ imports: [TestHost] });
    const state = TestBed.inject(EditorStateService);
    state.resetDocument(createEmptyDocument());
    const vb = { x: 0, y: 0, width: 800, height: 600 };
    const page = withPageFlag(createGroup([], {}), vb, 'Cover');
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [page] },
    });
    const active = TestBed.inject(ActivePageService);
    // Auto-recovery effect is async in tests; set explicitly so the
    // assertion is deterministic.
    active.setActive(page.id);
    // PAGES-REFACTOR follow-up — un-gate the hit-target (see helper docs).
    activatePageTool();
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const r = pageRect(fixture.nativeElement);
    expect(r).not.toBeNull();
    expect(r?.getAttribute('data-node-id')).toBe(page.id);
    expect(r?.getAttribute('pointer-events')).toBe('all');
  });

  /**
   * **PAGES-REFACTOR follow-up gate** — even WITH an active D-079 page,
   * when the Page tool is NOT active the rect stays click-through.
   * Without this gate, clicking on the empty page interior with the
   * Select tool active would still resolve to the page node and the
   * user would see the page get "selected" (the bug the user reported:
   * "eu clico e a página vira retângulo selecionado"). The Artboard
   * Tool pattern eliminates that by making page selection an explicit
   * mode the user has to enter.
   */
  it('active D-079 page + Page tool NOT active: rect stays click-through (Artboard Tool gate)', () => {
    TestBed.configureTestingModule({ imports: [TestHost] });
    const state = TestBed.inject(EditorStateService);
    state.resetDocument(createEmptyDocument());
    const vb = { x: 0, y: 0, width: 800, height: 600 };
    const page = withPageFlag(createGroup([], {}), vb, 'Cover');
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [page] },
    });
    TestBed.inject(ActivePageService).setActive(page.id);
    // NB: deliberately NOT calling activatePageTool() — the default
    // ToolHostService has no active tool, so the gate's
    // `activeId() !== PAGE_TOOL_ID` short-circuits and the rect
    // stays inert.
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const r = pageRect(fixture.nativeElement);
    expect(r).not.toBeNull();
    expect(r?.getAttribute('data-node-id')).toBeNull();
    expect(r?.getAttribute('pointer-events')).toBe('none');
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
