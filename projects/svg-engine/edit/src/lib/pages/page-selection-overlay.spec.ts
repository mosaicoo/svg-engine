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
import { PageDragService } from './page-drag.service';
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
    // **PAGES-REFACTOR follow-up #3** — `resizeHandles()` was removed
    // when the 8 square handles + move-handle square were dropped in
    // favor of "L-brackets only" visual. The 4 corner L-brackets ARE
    // the resize affordance now (each bracket-group binds pointerdown
    // directly to onResizeHandlePointerDown). Tests that assert handle
    // positions are obsolete — the bracket-path geometry specs already
    // cover the corner positions, and the drag-preview specs cover the
    // resize math via the `_drag` signal.
    // **Mid-edge brackets follow-up** — 4 new straight-line bracket
    // paths centered on the midpoint of each edge. Same projection
    // contract as the corner L's (zoom-stable via `midBracketLenDoc`).
    bracketT: (o: { x: number; y: number; width: number }) => string;
    bracketB: (o: { x: number; y: number; width: number; height: number }) => string;
    bracketL: (o: { x: number; y: number; height: number }) => string;
    bracketR: (o: { x: number; y: number; width: number; height: number }) => string;
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
    // **PAGES-REFACTOR follow-up #3** — bracket arm bumped from 12 → 16 px
    // when the bracket-as-handle refactor landed (wider visible affordance
    // matches the wider invisible hit-area painted underneath).
    const armDoc = 16 / viewport.zoom();
    const d = overlay.bracketTL({ x: 0, y: 0 });
    expect(d).toBe(`M0,${armDoc} L0,0 L${armDoc},0`);
  });

  it('bracketBR emits a 3-vertex path ending at corner-going-up', () => {
    const { viewport, overlay } = setup();
    viewport.reset();
    // **PAGES-REFACTOR follow-up #3** — bracket arm bumped from 12 → 16 px
    // when the bracket-as-handle refactor landed (wider visible affordance
    // matches the wider invisible hit-area painted underneath).
    const armDoc = 16 / viewport.zoom();
    const d = overlay.bracketBR({ x: 0, y: 0, width: 800, height: 600 });
    expect(d).toBe(`M${800 - armDoc},600 L800,600 L800,${600 - armDoc}`);
  });

  // ─────────────────────────────────────────────────────────────────
  // Mid-edge brackets follow-up — geometry of the 4 new edge marks
  // ─────────────────────────────────────────────────────────────────
  //
  // Mid-edge length is `BRACKET_ARM_PX * 2 = 32` CSS px, half on each
  // side of the edge midpoint. At zoom=1, midDoc=32 (zoom-stable doc
  // unit). The marks are aligned with the edge (collinear with it),
  // so the constant axis equals the edge coordinate exactly.

  it('bracketT emits a horizontal segment centered on the top edge', () => {
    const { viewport, overlay } = setup();
    viewport.reset();
    const halfDoc = 32 / viewport.zoom() / 2;
    const d = overlay.bracketT({ x: 0, y: 0, width: 800 });
    expect(d).toBe(`M${400 - halfDoc},0 L${400 + halfDoc},0`);
  });

  it('bracketB emits a horizontal segment centered on the bottom edge', () => {
    const { viewport, overlay } = setup();
    viewport.reset();
    const halfDoc = 32 / viewport.zoom() / 2;
    const d = overlay.bracketB({ x: 0, y: 0, width: 800, height: 600 });
    expect(d).toBe(`M${400 - halfDoc},600 L${400 + halfDoc},600`);
  });

  it('bracketL emits a vertical segment centered on the left edge', () => {
    const { viewport, overlay } = setup();
    viewport.reset();
    const halfDoc = 32 / viewport.zoom() / 2;
    const d = overlay.bracketL({ x: 0, y: 0, height: 600 });
    expect(d).toBe(`M0,${300 - halfDoc} L0,${300 + halfDoc}`);
  });

  it('bracketR emits a vertical segment centered on the right edge', () => {
    const { viewport, overlay } = setup();
    viewport.reset();
    const halfDoc = 32 / viewport.zoom() / 2;
    const d = overlay.bracketR({ x: 0, y: 0, width: 800, height: 600 });
    expect(d).toBe(`M800,${300 - halfDoc} L800,${300 + halfDoc}`);
  });

  // ─────────────────────────────────────────────────────────────────
  // Fase 6 specs — drag-→-dispatch via the 4 corner brackets
  // ─────────────────────────────────────────────────────────────────
  //
  // **PAGES-REFACTOR follow-up #3** — the "resizeHandles returns 8
  // entries" spec was removed when the 8 square resize handles were
  // dropped in favor of "L-brackets only" visual. The 4 corner
  // brackets (tl/tr/bl/br) double as the resize affordance — their
  // positions are covered by the bracket geometry specs above. Edge
  // resize was dropped entirely; precision one-axis resize lives in
  // the Inspector Page tab instead.

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

  // ─────────────────────────────────────────────────────────────────
  // Mid-edge brackets follow-up — single-axis resize math
  // ─────────────────────────────────────────────────────────────────

  it('drag preview: resize T (top edge) shifts y up and grows height, x/width pinned', () => {
    const { state, sel, activePage, overlay } = setup();
    seedActiveSelectedPage(state, activePage, sel);
    const inner = overlay as unknown as { _drag: { set: (v: unknown) => void } };
    inner._drag.set({
      kind: 'resize',
      anchor: 't',
      pageId: state.document().root.children[0]!.id,
      startViewBox: { x: 0, y: 0, width: 800, height: 600 },
      startPoint: { x: 400, y: 0 },
      currentPoint: { x: 700, y: -40 }, // dy = -40 → top moves UP 40; dx ignored
    });
    const o = overlay.overlay();
    // Top anchor: y shifts to -40, height grows by 40, x/width unchanged.
    expect(o!.x).toBe(0);
    expect(o!.y).toBe(-40);
    expect(o!.width).toBe(800);
    expect(o!.height).toBe(640);
  });

  it('drag preview: resize B (bottom edge) grows height only, top edge pinned', () => {
    const { state, sel, activePage, overlay } = setup();
    seedActiveSelectedPage(state, activePage, sel);
    const inner = overlay as unknown as { _drag: { set: (v: unknown) => void } };
    inner._drag.set({
      kind: 'resize',
      anchor: 'b',
      pageId: state.document().root.children[0]!.id,
      startViewBox: { x: 0, y: 0, width: 800, height: 600 },
      startPoint: { x: 400, y: 600 },
      currentPoint: { x: 500, y: 750 }, // dy = 150; dx ignored
    });
    const o = overlay.overlay();
    expect(o!.x).toBe(0);
    expect(o!.y).toBe(0);
    expect(o!.width).toBe(800);
    expect(o!.height).toBe(750);
  });

  it('drag preview: resize L (left edge) shifts x right and shrinks width, right edge pinned', () => {
    const { state, sel, activePage, overlay } = setup();
    seedActiveSelectedPage(state, activePage, sel);
    const inner = overlay as unknown as { _drag: { set: (v: unknown) => void } };
    inner._drag.set({
      kind: 'resize',
      anchor: 'l',
      pageId: state.document().root.children[0]!.id,
      startViewBox: { x: 0, y: 0, width: 800, height: 600 },
      startPoint: { x: 0, y: 300 },
      currentPoint: { x: 120, y: 600 }, // dx = 120; dy ignored
    });
    const o = overlay.overlay();
    // Left anchor: x moves to 120, width shrinks to 680 (right pinned at 800).
    expect(o!.x).toBe(120);
    expect(o!.y).toBe(0);
    expect(o!.width).toBe(680);
    expect(o!.height).toBe(600);
  });

  it('drag preview: resize R (right edge) grows width only, left edge pinned', () => {
    const { state, sel, activePage, overlay } = setup();
    seedActiveSelectedPage(state, activePage, sel);
    const inner = overlay as unknown as { _drag: { set: (v: unknown) => void } };
    inner._drag.set({
      kind: 'resize',
      anchor: 'r',
      pageId: state.document().root.children[0]!.id,
      startViewBox: { x: 0, y: 0, width: 800, height: 600 },
      startPoint: { x: 800, y: 300 },
      currentPoint: { x: 950, y: 100 }, // dx = 150; dy ignored
    });
    const o = overlay.overlay();
    expect(o!.x).toBe(0);
    expect(o!.y).toBe(0);
    expect(o!.width).toBe(950);
    expect(o!.height).toBe(600);
  });

  it('drag preview: resize R clamps to MIN_PAGE_DIM when over-dragged left', () => {
    const { state, sel, activePage, overlay } = setup();
    seedActiveSelectedPage(state, activePage, sel);
    const inner = overlay as unknown as { _drag: { set: (v: unknown) => void } };
    // Drag right edge way past the left edge — width would go negative. Clamp.
    inner._drag.set({
      kind: 'resize',
      anchor: 'r',
      pageId: state.document().root.children[0]!.id,
      startViewBox: { x: 0, y: 0, width: 800, height: 600 },
      startPoint: { x: 800, y: 300 },
      currentPoint: { x: -200, y: 300 }, // dx = -1000 → would make w = -200
    });
    const o = overlay.overlay();
    // MIN_PAGE_DIM is 10, so width clamps to 10. x stays 0 (left pinned).
    expect(o!.x).toBe(0);
    expect(o!.width).toBe(10);
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

  it('pointerup with a mid-edge (R) resize drag dispatches ResizePageCommand with single-axis delta', () => {
    const { state, sel, activePage, overlay } = setup();
    const page = seedActiveSelectedPage(state, activePage, sel);
    const inner = overlay as unknown as {
      _drag: { set: (v: unknown) => void };
      onHandlePointerUp: (e: unknown) => void;
    };
    inner._drag.set({
      kind: 'resize',
      anchor: 'r',
      pageId: page.id,
      startViewBox: { x: 0, y: 0, width: 800, height: 600 },
      startPoint: { x: 800, y: 300 },
      currentPoint: { x: 1100, y: 500 }, // dx = 300, dy = 200 (must be ignored)
    });
    inner.onHandlePointerUp({ target: null, pointerId: 1 });
    const after = findNodeById(state.document().root, page.id);
    // Mid-edge R: width grows by 300; height + origin must stay untouched.
    expect(getPageViewBox(after!)).toEqual({ x: 0, y: 0, width: 1100, height: 600 });
  });

  // ─────────────────────────────────────────────────────────────────
  // PAGES-REFACTOR follow-up #4 — shared drag preview + ESC cancel
  // ─────────────────────────────────────────────────────────────────

  it('pushes the previewed viewBox into PageDragService on every _drag mutation', () => {
    const { state, sel, activePage, overlay } = setup();
    const page = seedActiveSelectedPage(state, activePage, sel);
    const pageDrag = TestBed.inject(PageDragService);
    const inner = overlay as unknown as { _drag: { set: (v: unknown) => void } };

    // No drag → no preview.
    expect(pageDrag.previewFor(page.id)).toBeNull();

    // Begin a move drag.
    inner._drag.set({
      kind: 'move',
      anchor: null,
      pageId: page.id,
      startViewBox: { x: 0, y: 0, width: 800, height: 600 },
      startPoint: { x: 0, y: 0 },
      currentPoint: { x: 50, y: 30 },
    });
    // Effects flush on the next microtask in test environment.
    TestBed.flushEffects();
    expect(pageDrag.previewFor(page.id)).toEqual({ x: 50, y: 30, width: 800, height: 600 });

    // Update mid-drag.
    inner._drag.set({
      kind: 'move',
      anchor: null,
      pageId: page.id,
      startViewBox: { x: 0, y: 0, width: 800, height: 600 },
      startPoint: { x: 0, y: 0 },
      currentPoint: { x: 200, y: 150 },
    });
    TestBed.flushEffects();
    expect(pageDrag.previewFor(page.id)).toEqual({ x: 200, y: 150, width: 800, height: 600 });

    // End drag → preview clears.
    inner._drag.set(null);
    TestBed.flushEffects();
    expect(pageDrag.previewFor(page.id)).toBeNull();
  });

  it('ESC cancels an in-flight drag without dispatching and clears the preview', () => {
    const { state, sel, activePage, overlay } = setup();
    const page = seedActiveSelectedPage(state, activePage, sel);
    const pageDrag = TestBed.inject(PageDragService);
    const inner = overlay as unknown as {
      _drag: { set: (v: unknown) => void };
      onEscape: (e: Event) => void;
    };

    // Snapshot the pre-drag stored viewBox to confirm ESC didn't mutate it.
    const storedBefore = getPageViewBox(findNodeById(state.document().root, page.id)!);

    // Begin a resize drag mid-gesture.
    inner._drag.set({
      kind: 'resize',
      anchor: 'br',
      pageId: page.id,
      startViewBox: { x: 0, y: 0, width: 800, height: 600 },
      startPoint: { x: 800, y: 600 },
      currentPoint: { x: 1000, y: 800 },
    });
    TestBed.flushEffects();
    expect(pageDrag.previewFor(page.id)).toEqual({ x: 0, y: 0, width: 1000, height: 800 });

    // Fire ESC. Stub Event so stopPropagation / preventDefault no-op.
    const fakeEvent = {
      stopPropagation: () => undefined,
      preventDefault: () => undefined,
    } as unknown as Event;
    inner.onEscape(fakeEvent);
    TestBed.flushEffects();

    // Stored viewBox must be UNCHANGED (no command was dispatched).
    const storedAfter = getPageViewBox(findNodeById(state.document().root, page.id)!);
    expect(storedAfter).toEqual(storedBefore);
    // Preview cleared — PageOverlay would now fall back to stored.
    expect(pageDrag.previewFor(page.id)).toBeNull();
    // Local _drag was reset to null (so the inner `previewViewBox`
    // helper returns the stored vb unchanged on the next read). We
    // peek at the protected `_drag` via the same cast pattern other
    // tests use rather than going through `overlay()` — the latter
    // depends on TestBed change-detection timing in ways unrelated
    // to what this test is actually exercising.
    const drag = (overlay as unknown as { _drag: () => unknown })._drag();
    expect(drag).toBeNull();
  });

  it('ESC outside a drag is a no-op (the handler short-circuits before stopping propagation)', () => {
    const { state, sel, activePage, overlay } = setup();
    seedActiveSelectedPage(state, activePage, sel);
    const inner = overlay as unknown as { onEscape: (e: Event) => void };

    // Track whether stopPropagation was called — it MUST NOT be called
    // when _drag is null so ESC still reaches other handlers (close
    // dialog, deselect, etc.).
    let stopped = false;
    const fakeEvent = {
      stopPropagation: () => {
        stopped = true;
      },
      preventDefault: () => undefined,
    } as unknown as Event;
    inner.onEscape(fakeEvent);
    expect(stopped).toBe(false);
  });
});
