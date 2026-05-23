import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEmptyDocument,
  EditorStateService,
  isGroupNode,
  parsePathToAnchors,
  type PathNode,
  type Point,
} from 'svg-engine/core';
import { PluginRegistry } from '../plugin/plugin-registry.service';
import { provideSvgEnginePlugin } from '../plugin/provide-plugin';
import { PenOverlay } from './pen-overlay.component';
import { PEN_TOOL_ID, penToolPlugin } from './pen-tool.plugin';
import { PenToolService } from './pen-tool.service';
import type { ToolPointerEvent } from './tool';
import { ToolHostService } from './tool-host.service';
import { ToolRegistry } from './tool-registry.service';

/**
 * Build a `ToolPointerEvent` at a doc point (no modifier keys) — used
 * to simulate the full pointer-routing path that the playground
 * exercises in production. Matches the helper in `builtin-tools.spec.ts`.
 */
function evtAt(point: Point): ToolPointerEvent {
  return {
    raw: new PointerEvent('pointerdown', { pointerId: 1 }),
    docPoint: point,
    screenX: 0,
    screenY: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  };
}

function keyEvt(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, bubbles: true });
}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideSvgEnginePlugin(penToolPlugin)],
  });
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  const host = TestBed.inject(ToolHostService);
  host.activate(PEN_TOOL_ID);
  const pen = TestBed.inject(PenToolService);
  return {
    state,
    host,
    pen,
    bus: TestBed.inject(CommandBus),
  };
}

/** Read the only path node in the document (or `null`). Asserts there's at most one. */
function onlyPath(state: EditorStateService): PathNode | null {
  const root = state.document().root;
  if (!isGroupNode(root)) return null;
  const paths = root.children.filter((c): c is PathNode => c.type === 'path');
  expect(paths.length).toBeLessThanOrEqual(1);
  return paths[0] ?? null;
}

describe('penToolPlugin — registration', () => {
  it('registers Pen tool at bootstrap', () => {
    TestBed.configureTestingModule({ providers: [provideSvgEnginePlugin(penToolPlugin)] });
    const reg = TestBed.inject(ToolRegistry);
    const ids = reg.tools().map((t) => t.id);
    expect(ids).toContain(PEN_TOOL_ID);
  });

  it('shortcut "b" activates the Pen tool', () => {
    TestBed.configureTestingModule({ providers: [provideSvgEnginePlugin(penToolPlugin)] });
    const reg = TestBed.inject(ToolRegistry);
    expect(reg.getByShortcut('b')?.id).toBe(PEN_TOOL_ID);
  });

  it('uninstalling the plugin removes the Pen tool', () => {
    TestBed.configureTestingModule({ providers: [provideSvgEnginePlugin(penToolPlugin)] });
    const pluginReg = TestBed.inject(PluginRegistry);
    const toolReg = TestBed.inject(ToolRegistry);
    expect(toolReg.tools().length).toBe(1);
    pluginReg.uninstall(penToolPlugin.id);
    expect(toolReg.tools().length).toBe(0);
  });
});

describe('PenTool — click creates cusp anchors, drag creates smooth anchors', () => {
  it('two clicks → 2-anchor cusp path on Enter', () => {
    const { host, pen, state } = setup();
    // Click 1
    host.routePointerDown(evtAt({ x: 10, y: 10 }));
    host.routePointerUp(evtAt({ x: 10, y: 10 }));
    // Click 2
    host.routePointerDown(evtAt({ x: 100, y: 50 }));
    host.routePointerUp(evtAt({ x: 100, y: 50 }));

    expect(pen.anchors()).toHaveLength(2);
    expect(pen.anchors()[0]!.kind).toBe('cusp');
    expect(pen.anchors()[1]!.kind).toBe('cusp');
    // Enter finalises
    host.routeKeyDown(keyEvt('Enter'));

    const path = onlyPath(state);
    expect(path).not.toBeNull();
    // Open path → simple "M ... L ..." (no Z)
    expect(path!.d).toContain('M10 10');
    expect(path!.d).toContain('L100 50');
    expect(path!.d).not.toContain('Z');
    // State cleared
    expect(pen.anchors()).toHaveLength(0);
  });

  it('drag creates a symmetric anchor with mirrored handles', () => {
    const { host, pen } = setup();
    // Press at (50, 50), drag to (80, 50) — handles point along +X.
    host.routePointerDown(evtAt({ x: 50, y: 50 }));
    host.routePointerMove(evtAt({ x: 80, y: 50 }));
    host.routePointerUp(evtAt({ x: 80, y: 50 }));

    expect(pen.anchors()).toHaveLength(1);
    const a = pen.anchors()[0]!;
    expect(a.kind).toBe('symmetric');
    expect(a.point).toEqual({ x: 50, y: 50 });
    expect(a.handleOut).toEqual({ x: 80, y: 50 });
    // handleIn = 2·anchor − handleOut = (20, 50) — perfect mirror.
    expect(a.handleIn).toEqual({ x: 20, y: 50 });
  });

  it('drag below the threshold falls back to a cusp anchor', () => {
    const { host, pen } = setup();
    // 2px drag — under the 4px threshold → treated as click.
    host.routePointerDown(evtAt({ x: 10, y: 10 }));
    host.routePointerMove(evtAt({ x: 12, y: 10 }));
    host.routePointerUp(evtAt({ x: 12, y: 10 }));

    expect(pen.anchors()).toHaveLength(1);
    expect(pen.anchors()[0]!.kind).toBe('cusp');
    // Cusp anchor placed at the press point, NOT the release point —
    // matches the "click = where you started" intuition.
    expect(pen.anchors()[0]!.point).toEqual({ x: 10, y: 10 });
  });
});

describe('PenTool — close path by clicking the first anchor', () => {
  it('clicking near first anchor (≤ 8px) closes + finalises', () => {
    const { host, pen, state } = setup();
    // 3-click triangle outline + close on the first vertex.
    host.routePointerDown(evtAt({ x: 0, y: 0 }));
    host.routePointerUp(evtAt({ x: 0, y: 0 }));
    host.routePointerDown(evtAt({ x: 100, y: 0 }));
    host.routePointerUp(evtAt({ x: 100, y: 0 }));
    host.routePointerDown(evtAt({ x: 50, y: 80 }));
    host.routePointerUp(evtAt({ x: 50, y: 80 }));

    // Click on the first anchor (within snap radius).
    host.routePointerDown(evtAt({ x: 3, y: 4 })); // distance = 5 ≤ 8

    const path = onlyPath(state);
    expect(path).not.toBeNull();
    expect(path!.d).toMatch(/Z$/);
    // State cleared after finalise.
    expect(pen.anchors()).toHaveLength(0);
  });

  it('clicking beyond snap radius places a new anchor instead of closing', () => {
    const { host, pen, state } = setup();
    host.routePointerDown(evtAt({ x: 0, y: 0 }));
    host.routePointerUp(evtAt({ x: 0, y: 0 }));
    host.routePointerDown(evtAt({ x: 100, y: 0 }));
    host.routePointerUp(evtAt({ x: 100, y: 0 }));
    // Distance to first anchor = sqrt(81 + 144) = 15 > 8 → NOT close.
    host.routePointerDown(evtAt({ x: 9, y: 12 }));
    host.routePointerUp(evtAt({ x: 9, y: 12 }));

    expect(pen.anchors()).toHaveLength(3);
    expect(onlyPath(state)).toBeNull(); // no commit yet
  });
});

describe('PenTool — keyboard shortcuts', () => {
  it('Escape discards in-progress path without dispatching', () => {
    const { host, pen, state } = setup();
    host.routePointerDown(evtAt({ x: 10, y: 10 }));
    host.routePointerUp(evtAt({ x: 10, y: 10 }));
    host.routePointerDown(evtAt({ x: 50, y: 50 }));
    host.routePointerUp(evtAt({ x: 50, y: 50 }));
    expect(pen.anchors()).toHaveLength(2);

    host.routeKeyDown(keyEvt('Escape'));

    expect(pen.anchors()).toHaveLength(0);
    expect(onlyPath(state)).toBeNull();
  });

  it('Enter on a 1-anchor path is a no-op (degenerate geometry)', () => {
    const { host, pen, state } = setup();
    host.routePointerDown(evtAt({ x: 10, y: 10 }));
    host.routePointerUp(evtAt({ x: 10, y: 10 }));

    host.routeKeyDown(keyEvt('Enter'));

    // Anchor stays — user can keep clicking to grow the path.
    expect(pen.anchors()).toHaveLength(1);
    expect(onlyPath(state)).toBeNull();
  });
});

describe('PenTool — switching tools mid-draft discards state (Affinity convention)', () => {
  it('deactivate() resets the pen service', () => {
    const { host, pen } = setup();
    host.routePointerDown(evtAt({ x: 10, y: 10 }));
    host.routePointerUp(evtAt({ x: 10, y: 10 }));
    expect(pen.anchors()).toHaveLength(1);

    // Deactivate without activating a new tool — Pen's onDeactivate
    // should reset (matches Affinity: leaving the tool drops the draft).
    host.deactivate();
    expect(pen.anchors()).toHaveLength(0);
  });
});

describe('PenOverlay — drag curve preview', () => {
  /**
   * Helper: create the overlay component bound to a fresh PenToolService
   * and return both. The component is detached from the DOM (we only need
   * its computeds, not the rendered SVG).
   */
  function setupOverlay() {
    TestBed.configureTestingModule({});
    const pen = TestBed.inject(PenToolService);
    pen.reset();
    const fixture = TestBed.createComponent(PenOverlay);
    // Expose protected computeds for assertion (Angular component
    // boundary, not a public-API contract).
    const cmp = fixture.componentInstance as unknown as {
      dragCurvePreview: () => string | null;
      dragHandlePreview: () => { start: Point; handleIn: Point; handleOut: Point } | null;
    };
    return { pen, cmp };
  }

  it('returns null when no drag is active', () => {
    const { cmp } = setupOverlay();
    expect(cmp.dragCurvePreview()).toBeNull();
  });

  it('returns null when the very first anchor is being placed (no previous anchor)', () => {
    const { pen, cmp } = setupOverlay();
    // Press + move with NO committed anchors → handle preview shows but
    // curve preview can't (nothing to attach the segment to).
    pen.beginPotentialDrag({ x: 50, y: 50 });
    pen.updateDrag({ x: 80, y: 50 });
    expect(cmp.dragHandlePreview()).not.toBeNull();
    expect(cmp.dragCurvePreview()).toBeNull();
  });

  it('returns null while cursor sits on the press point (no curvature yet)', () => {
    const { pen, cmp } = setupOverlay();
    pen.beginPotentialDrag({ x: 0, y: 0 });
    pen.commitClick();
    // Second anchor begins, no movement yet.
    pen.beginPotentialDrag({ x: 50, y: 50 });
    expect(cmp.dragCurvePreview()).toBeNull();
  });

  it('emits a cubic Bezier `d` between previous anchor and pending one during drag', () => {
    const { pen, cmp } = setupOverlay();
    // Commit a cusp at (0, 0) — the anchor we'll curve FROM.
    pen.beginPotentialDrag({ x: 0, y: 0 });
    pen.commitClick();
    // Start a drag at (50, 50), pull the handle to (80, 50).
    pen.beginPotentialDrag({ x: 50, y: 50 });
    pen.updateDrag({ x: 80, y: 50 });

    const d = cmp.dragCurvePreview();
    expect(d).not.toBeNull();
    // Previous anchor is cusp at (0,0) → handleOut = anchor → `C` starts
    // from (0,0). Pending anchor's handleIn = mirror through (50,50) =
    // (20, 50). Pending anchor point = (50, 50).
    expect(d).toBe('M0 0 C0 0 20 50 50 50');
  });

  it('updates the preview reactively as the cursor moves', () => {
    const { pen, cmp } = setupOverlay();
    pen.beginPotentialDrag({ x: 0, y: 0 });
    pen.commitClick();
    pen.beginPotentialDrag({ x: 100, y: 100 });
    pen.updateDrag({ x: 120, y: 100 });
    const first = cmp.dragCurvePreview();
    pen.updateDrag({ x: 160, y: 100 });
    const second = cmp.dragCurvePreview();
    expect(first).not.toBe(second); // computed re-evaluated with new drag state
    expect(second).toContain('100 100'); // anchor endpoint unchanged
  });

  it('clears the preview after commitDrag (no more drag state)', () => {
    const { pen, cmp } = setupOverlay();
    pen.beginPotentialDrag({ x: 0, y: 0 });
    pen.commitClick();
    pen.beginPotentialDrag({ x: 50, y: 50 });
    pen.updateDrag({ x: 80, y: 50 });
    expect(cmp.dragCurvePreview()).not.toBeNull();
    pen.commitDrag();
    expect(cmp.dragCurvePreview()).toBeNull();
  });
});

describe('PenToolService — serialisation round-trip', () => {
  it('open path produced by buildOpenPath parses back to the same anchors', () => {
    TestBed.configureTestingModule({});
    const pen = TestBed.inject(PenToolService);
    pen.reset();
    // Manually drive the service (bypassing the tool) — single-purpose
    // sanity check that the AnchorPoint shape we store matches what
    // anchorsToPathD expects.
    pen.beginPotentialDrag({ x: 0, y: 0 });
    pen.commitClick();
    pen.beginPotentialDrag({ x: 50, y: 50 });
    pen.updateDrag({ x: 80, y: 50 });
    pen.commitDrag();
    pen.beginPotentialDrag({ x: 100, y: 0 });
    pen.commitClick();

    const node = pen.buildOpenPath();
    expect(node).not.toBeNull();
    const subpaths = parsePathToAnchors(node!.d);
    expect(subpaths).toHaveLength(1);
    expect(subpaths[0]!.closed).toBe(false);
    expect(subpaths[0]!.anchors).toHaveLength(3);
    // The middle anchor is the smooth one (point at the drag start).
    expect(subpaths[0]!.anchors[1]!.point).toEqual({ x: 50, y: 50 });
  });
});
