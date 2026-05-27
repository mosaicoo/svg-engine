import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  createEmptyDocument,
  createGroup,
  EditorStateService,
  withPageFlag,
} from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';
import { SelectionService } from '../selection/selection.service';
import { ActivePageService } from './active-page.service';
import { SvgePageSelectionOverlay } from './page-selection-overlay.component';

/**
 * **PAGES-REFACTOR Fase 2** specs — verify the overlay's reactive
 * gating (`overlay()` computed) and bracket path geometry.
 *
 * Component is constructed via `runInInjectionContext` because the
 * `inject()` calls in class fields require an active DI context.
 * Spec uses access casts to read protected members — acceptable
 * because the spec lives next to the component and tracks its
 * implementation contract directly.
 */
describe('PAGES-REFACTOR Fase 2 — SvgePageSelectionOverlay', () => {
  /**
   * Local protected-access shim — describes the slice of the
   * component we want to observe. Centralised here so each test
   * stays readable.
   */
  interface OverlayShape {
    overlay: () => { x: number; y: number; width: number; height: number; label: string } | null;
    bracketTL: (o: { x: number; y: number }) => string;
    bracketBR: (o: { x: number; y: number; width: number; height: number }) => string;
  }

  function setup(): {
    state: EditorStateService;
    sel: SelectionService;
    viewport: ViewportService;
    activePage: ActivePageService;
    overlay: OverlayShape;
  } {
    TestBed.configureTestingModule({});
    const state = TestBed.inject(EditorStateService);
    state.resetDocument(createEmptyDocument());
    const sel = TestBed.inject(SelectionService);
    const viewport = TestBed.inject(ViewportService);
    const activePage = TestBed.inject(ActivePageService);
    // Instantiate the component inside the TestBed's root injector so
    // its inject() fields resolve. We don't need a host fixture
    // because we're only exercising signal-driven computed methods.
    const injector = TestBed.inject(Injector);
    const overlay = runInInjectionContext(
      injector,
      () => new SvgePageSelectionOverlay(),
    ) as unknown as OverlayShape;
    return { state, sel, viewport, activePage, overlay };
  }

  it('overlay() returns null when no page exists', () => {
    const { overlay } = setup();
    expect(overlay.overlay()).toBeNull();
  });

  it('overlay() returns null when a page exists but is NOT selected', () => {
    const { state, activePage, overlay } = setup();
    const vb = { x: 0, y: 0, width: 800, height: 600 };
    const baseGroup = createGroup([], { metadata: { name: 'Cover' } });
    const page = withPageFlag(baseGroup, vb, 'Cover');
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [page] },
    });
    // Force the active page synchronously (the auto-recovery effect()
    // is async in tests; we set explicitly so the assertion is
    // deterministic). Selection stays empty → overlay must be null.
    activePage.setActive(page.id);
    expect(overlay.overlay()).toBeNull();
  });

  it('overlay() returns viewBox + label when the active page is selected', () => {
    const { state, sel, activePage, overlay } = setup();
    const vb = { x: 0, y: 0, width: 800, height: 600 };
    const baseGroup = createGroup([], { metadata: { name: 'Cover' } });
    const page = withPageFlag(baseGroup, vb, 'Cover');
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [page] },
    });
    activePage.setActive(page.id);
    sel.select(page.id);

    const o = overlay.overlay();
    expect(o).not.toBeNull();
    expect(o!.x).toBe(0);
    expect(o!.y).toBe(0);
    expect(o!.width).toBe(800);
    expect(o!.height).toBe(600);
    expect(o!.label).toBe('Cover — 800×600');
  });

  it('bracketTL emits a 3-vertex path starting at corner-going-down', () => {
    const { viewport, overlay } = setup();
    viewport.reset();
    const armDoc = 12 / viewport.zoom();
    const d = overlay.bracketTL({ x: 0, y: 0 });
    expect(d).toBe(`M0,${armDoc} L0,0 L${armDoc},0`);
  });

  it('bracketBR emits a 3-vertex path ending at corner-going-up', () => {
    const { viewport, overlay } = setup();
    viewport.reset();
    const armDoc = 12 / viewport.zoom();
    const d = overlay.bracketBR({ x: 0, y: 0, width: 800, height: 600 });
    expect(d).toBe(`M${800 - armDoc},600 L800,600 L800,${600 - armDoc}`);
  });
});
