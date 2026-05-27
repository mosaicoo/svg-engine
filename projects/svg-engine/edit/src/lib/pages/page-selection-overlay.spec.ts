import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  createEmptyDocument,
  createGroup,
  EditorStateService,
  getPageViewBox,
  withPageFlag,
} from 'svg-engine/core';
import { findNodeById } from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';
import { CommandBus } from 'svg-engine/core';
import { SelectionService } from '../selection/selection.service';
import { PAGE_TOOL_ID } from '../tool/builtin-tools';
import { ToolHostService } from '../tool/tool-host.service';
import { ToolRegistry } from '../tool/tool-registry.service';
import { ActivePageService } from './active-page.service';
import { SvgePageSelectionOverlay } from './page-selection-overlay.component';

/**
 * **PAGES-REFACTOR Fase 2 + Fase 6** specs — verify the overlay's
 * reactive gating (`overlay()` computed), bracket path geometry,
 * resize-handle positions, and the drag-→-dispatch lifecycle for
 * the move handle and the 8 resize handles.
 *
 * Component is constructed via `runInInjectionContext` because the
 * `inject()` calls in class fields require an active DI context.
 * Spec uses access casts to read protected members AND to invoke the
 * pointer handlers directly — acceptable because the spec lives next
 * to the component and tracks its implementation contract directly
 * (and there's no public DOM-driven way to feed pointer events to
 * the overlay outside a full TestBed fixture).
 */
describe('PAGES-REFACTOR Fase 2 + Fase 6 — SvgePageSelectionOverlay', () => {
  /**
   * Local protected-access shim. Centralised here so each test stays
   * readable and the cast surface is documented in one place.
   */
  interface OverlayShape {
    overlay: () => { x: number; y: number; width: number; height: number; label: string } | null;
    bracketTL: (o: { x: number; y: number }) => string;
    bracketBR: (o: { x: number; y: number; width: number; height: number }) => string;
    resizeHandles: () => readonly { anchor: string; x: number; y: number }[];
    onMoveHandlePointerDown: (e: unknown) => void;
    onResizeHandlePointerDown: (e: unknown, anchor: string) => void;
    onHandlePointerMove: (e: unknown) => void;
    onHandlePointerUp: (e: unknown) => void;
  }

  function setup(): {
    state: EditorStateService;
    sel: SelectionService;
    viewport: ViewportService;
    activePage: ActivePageService;
    bus: CommandBus;
    overlay: OverlayShape;
  } {
    TestBed.configureTestingModule({});
    const state = TestBed.inject(EditorStateService);
    state.resetDocument(createEmptyDocument());
    const sel = TestBed.inject(SelectionService);
    const viewport = TestBed.inject(ViewportService);
    const activePage = TestBed.inject(ActivePageService);
    const bus = TestBed.inject(CommandBus);
    const injector = TestBed.inject(Injector);
    const overlay = runInInjectionContext(
      injector,
      () => new SvgePageSelectionOverlay(),
    ) as unknown as OverlayShape;
    return { state, sel, viewport, activePage, bus, overlay };
  }

  /**
   * Activate the Page tool in the TestBed-provided ToolHostService.
   * **PAGES-REFACTOR follow-up** gates `overlay()` on this — without
   * it, every spec that exercises the overlay's `overlay()` computed
   * returns null and the spec fails.
   *
   * Registers a minimal stub Tool so `activate(PAGE_TOOL_ID)` resolves
   * (the host validates the id is registered before promoting it).
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

  function seedActiveSelectedPage(
    state: EditorStateService,
    activePage: ActivePageService,
    sel: SelectionService,
  ) {
    const vb = { x: 0, y: 0, width: 800, height: 600 };
    const page = withPageFlag(createGroup([], { metadata: { name: 'Cover' } }), vb, 'Cover');
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [page] },
    });
    // Auto-recovery effect is async in tests; pin synchronously.
    activePage.setActive(page.id);
    sel.select(page.id);
    // **PAGES-REFACTOR follow-up** — overlay is gated on the Page tool
    // being active (Artboard Tool pattern). Activate it so the existing
    // specs that assert on the overlay's brackets/handles/preview still
    // pass.
    activatePageTool();
    return page;
  }

  // ─────────────────────────────────────────────────────────────────
  // Fase 2 specs — gating + geometry
  // ─────────────────────────────────────────────────────────────────

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
    activePage.setActive(page.id);
    expect(overlay.overlay()).toBeNull();
  });

  it('overlay() returns viewBox + label when the active page is selected', () => {
    const { state, sel, activePage, overlay } = setup();
    seedActiveSelectedPage(state, activePage, sel);
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

  // ─────────────────────────────────────────────────────────────────
  // Fase 6 specs — 8 resize handles + drag-→-dispatch
  // ─────────────────────────────────────────────────────────────────

  it('resizeHandles returns 8 entries (4 corners + 4 edges) at the right positions', () => {
    const { state, sel, activePage, overlay } = setup();
    seedActiveSelectedPage(state, activePage, sel);
    const hs = overlay.resizeHandles();
    expect(hs).toHaveLength(8);
    // 800×600 page at origin → expected positions per anchor.
    const map = new Map(hs.map((h) => [h.anchor, { x: h.x, y: h.y }]));
    expect(map.get('tl')).toEqual({ x: 0, y: 0 });
    expect(map.get('t')).toEqual({ x: 400, y: 0 });
    expect(map.get('tr')).toEqual({ x: 800, y: 0 });
    expect(map.get('r')).toEqual({ x: 800, y: 300 });
    expect(map.get('br')).toEqual({ x: 800, y: 600 });
    expect(map.get('b')).toEqual({ x: 400, y: 600 });
    expect(map.get('bl')).toEqual({ x: 0, y: 600 });
    expect(map.get('l')).toEqual({ x: 0, y: 300 });
  });

  /**
   * The component's `screenToDoc` private uses
   * `SVGSVGElement.createSVGPoint` + matrixTransform — jsdom's SVG
   * implementation is incomplete here, so the pointer-event path
   * isn't directly testable without a full TestBed fixture. We test
   * the drag math via the private `_drag` signal + the public
   * `overlay()` computed: when `_drag` is set with a known
   * `currentPoint`, `overlay()` returns the previewed box, and the
   * pointerup handler dispatches the corresponding command with that
   * value. This proves: gestures preview correctly + the final
   * dispatched value matches the preview. The command-execution wire
   * is exercised by the MovePageCommand / ResizePageCommand specs.
   */
  it('drag preview: setting _drag with a delta moves the overlay rect (move)', () => {
    const { state, sel, activePage, overlay } = setup();
    seedActiveSelectedPage(state, activePage, sel);
    // Inject a fake drag state via the private signal — same shape
    // the pointerdown handler would set.
    const inner = overlay as unknown as {
      _drag: { set: (v: unknown) => void };
    };
    inner._drag.set({
      kind: 'move',
      anchor: null,
      pageId: state.document().root.children[0]!.id,
      startViewBox: { x: 0, y: 0, width: 800, height: 600 },
      startPoint: { x: 0, y: 0 },
      currentPoint: { x: 50, y: 30 },
    });
    const o = overlay.overlay();
    expect(o!.x).toBe(50);
    expect(o!.y).toBe(30);
    expect(o!.width).toBe(800);
    expect(o!.height).toBe(600);
  });

  it('drag preview: resize TR moves top + grows width based on cursor delta', () => {
    const { state, sel, activePage, overlay } = setup();
    seedActiveSelectedPage(state, activePage, sel);
    const inner = overlay as unknown as {
      _drag: { set: (v: unknown) => void };
    };
    inner._drag.set({
      kind: 'resize',
      anchor: 'tr',
      pageId: state.document().root.children[0]!.id,
      startViewBox: { x: 0, y: 0, width: 800, height: 600 },
      startPoint: { x: 800, y: 0 },
      currentPoint: { x: 900, y: -50 }, // cursor dragged 100 right + 50 up
    });
    const o = overlay.overlay();
    // TR anchor: y shifts up (top moved up by 50), width grows by 100,
    // height grows by 50 (because y moved up while bottom stays).
    expect(o!.x).toBe(0);
    expect(o!.y).toBe(-50);
    expect(o!.width).toBe(900);
    expect(o!.height).toBe(650);
  });

  it('drag preview: resize BL clamps to MIN_PAGE_DIM when over-dragged', () => {
    const { state, sel, activePage, overlay } = setup();
    seedActiveSelectedPage(state, activePage, sel);
    const inner = overlay as unknown as {
      _drag: { set: (v: unknown) => void };
    };
    // Drag BL beyond the right edge — width would go negative. Clamp.
    inner._drag.set({
      kind: 'resize',
      anchor: 'bl',
      pageId: state.document().root.children[0]!.id,
      startViewBox: { x: 0, y: 0, width: 800, height: 600 },
      startPoint: { x: 0, y: 600 },
      currentPoint: { x: 900, y: 500 }, // dragged past right edge
    });
    const o = overlay.overlay();
    // BL anchor: x increases (would clamp at x2 - MIN_PAGE_DIM = 790).
    // height shrinks by 100 → 500 (still valid).
    expect(o!.x).toBe(790);
    expect(o!.width).toBe(10);
    expect(o!.height).toBe(500);
  });

  /**
   * End-to-end-ish: bypass the pointer event chain by calling the
   * pointerup handler with a stubbed _drag state. Verifies that the
   * handler dispatches MovePageCommand with the right final origin.
   */
  it('pointerup with a move drag dispatches MovePageCommand and applies the new origin', () => {
    const { state, sel, activePage, bus, overlay } = setup();
    const page = seedActiveSelectedPage(state, activePage, sel);
    const inner = overlay as unknown as {
      _drag: { set: (v: unknown) => void };
      onHandlePointerUp: (e: unknown) => void;
    };
    inner._drag.set({
      kind: 'move',
      anchor: null,
      pageId: page.id,
      startViewBox: { x: 0, y: 0, width: 800, height: 600 },
      startPoint: { x: 0, y: 0 },
      currentPoint: { x: 100, y: 50 },
    });
    // Empty stub — the handler only reads target for releasePointer
    // which is best-effort and no-ops when target lacks the method.
    inner.onHandlePointerUp({ target: null, pointerId: 1 });
    const after = findNodeById(state.document().root, page.id);
    expect(getPageViewBox(after!)).toEqual({ x: 100, y: 50, width: 800, height: 600 });
    // _drag must have been cleared.
    expect(overlay.overlay()!.x).toBe(100);
    expect(overlay.overlay()!.y).toBe(50);
    // Side-bus: prevent unused warning + sanity-check bus is reachable.
    expect(bus).toBeDefined();
  });

  it('pointerup with a resize drag dispatches ResizePageCommand and applies the new viewBox', () => {
    const { state, sel, activePage, overlay } = setup();
    const page = seedActiveSelectedPage(state, activePage, sel);
    const inner = overlay as unknown as {
      _drag: { set: (v: unknown) => void };
      onHandlePointerUp: (e: unknown) => void;
    };
    inner._drag.set({
      kind: 'resize',
      anchor: 'br',
      pageId: page.id,
      startViewBox: { x: 0, y: 0, width: 800, height: 600 },
      startPoint: { x: 800, y: 600 },
      currentPoint: { x: 1000, y: 800 },
    });
    inner.onHandlePointerUp({ target: null, pointerId: 1 });
    const after = findNodeById(state.document().root, page.id);
    expect(getPageViewBox(after!)).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  });
});
