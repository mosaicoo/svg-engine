import { TestBed } from '@angular/core/testing';
import { createEmptyDocument, EditorStateService, isGroupNode, type Point } from 'svg-engine/core';
import { PluginRegistry } from '../plugin/plugin-registry.service';
import { provideSvgEnginePlugin } from '../plugin/provide-plugin';
import {
  boundsOfDraft,
  DEFAULT_POLYGON_SIDES,
  regularPolygonPoints,
  ShapeToolService,
} from './shape-tool.service';
import {
  ELLIPSE_TOOL_ID,
  POLYGON_TOOL_ID,
  RECTANGLE_TOOL_ID,
  shapeToolsPlugin,
} from './shape-tools.plugin';
import type { ToolPointerEvent } from './tool';
import { ToolHostService } from './tool-host.service';
import { ToolRegistry } from './tool-registry.service';

function evtAt(point: Point, modifiers: { shift?: boolean; alt?: boolean } = {}): ToolPointerEvent {
  return {
    raw: new PointerEvent('pointerdown', { pointerId: 1 }),
    docPoint: point,
    screenX: 0,
    screenY: 0,
    shiftKey: modifiers.shift ?? false,
    altKey: modifiers.alt ?? false,
    ctrlKey: false,
    metaKey: false,
  };
}

function setup(toolId: string) {
  TestBed.configureTestingModule({
    providers: [provideSvgEnginePlugin(shapeToolsPlugin)],
  });
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  const host = TestBed.inject(ToolHostService);
  host.activate(toolId);
  return {
    state,
    host,
    shapes: TestBed.inject(ShapeToolService),
  };
}

function rootChildren(state: EditorStateService) {
  const root = state.document().root;
  return isGroupNode(root) ? root.children : [];
}

describe('shapeToolsPlugin — registration', () => {
  it('registers Rectangle, Ellipse and Polygon tools at bootstrap', () => {
    TestBed.configureTestingModule({ providers: [provideSvgEnginePlugin(shapeToolsPlugin)] });
    const ids = TestBed.inject(ToolRegistry)
      .tools()
      .map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining([RECTANGLE_TOOL_ID, ELLIPSE_TOOL_ID, POLYGON_TOOL_ID]),
    );
  });

  it('shortcuts r/e/y activate the right tools', () => {
    TestBed.configureTestingModule({ providers: [provideSvgEnginePlugin(shapeToolsPlugin)] });
    const reg = TestBed.inject(ToolRegistry);
    expect(reg.getByShortcut('r')?.id).toBe(RECTANGLE_TOOL_ID);
    expect(reg.getByShortcut('e')?.id).toBe(ELLIPSE_TOOL_ID);
    expect(reg.getByShortcut('y')?.id).toBe(POLYGON_TOOL_ID);
  });

  it('uninstalling removes all 3 tools as a set', () => {
    TestBed.configureTestingModule({ providers: [provideSvgEnginePlugin(shapeToolsPlugin)] });
    const pluginReg = TestBed.inject(PluginRegistry);
    const toolReg = TestBed.inject(ToolRegistry);
    expect(toolReg.tools().length).toBe(3);
    pluginReg.uninstall(shapeToolsPlugin.id);
    expect(toolReg.tools().length).toBe(0);
  });
});

describe('RectangleTool — gesture', () => {
  it('press-drag-release inserts a rect with the dragged bounds', () => {
    const { state, host } = setup(RECTANGLE_TOOL_ID);
    host.routePointerDown(evtAt({ x: 10, y: 20 }));
    host.routePointerMove(evtAt({ x: 110, y: 70 }));
    host.routePointerUp(evtAt({ x: 110, y: 70 }));

    const children = rootChildren(state);
    expect(children).toHaveLength(1);
    const rect = children[0]!;
    expect(rect.type).toBe('rect');
    if (rect.type !== 'rect') return; // narrow
    expect(rect.x).toBe(10);
    expect(rect.y).toBe(20);
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(50);
  });

  it('Shift constrains to square (uses smaller delta on both axes)', () => {
    const { state, host } = setup(RECTANGLE_TOOL_ID);
    host.routePointerDown(evtAt({ x: 0, y: 0 }));
    host.routePointerMove(evtAt({ x: 100, y: 20 }, { shift: true }));
    host.routePointerUp(evtAt({ x: 100, y: 20 }, { shift: true }));

    const rect = rootChildren(state)[0]!;
    if (rect.type !== 'rect') throw new Error('expected rect');
    // min(|100|, |20|) = 20 → 20×20 square (not 100×20).
    expect(rect.width).toBe(20);
    expect(rect.height).toBe(20);
  });

  it('Alt draws from center (start is the middle)', () => {
    const { state, host } = setup(RECTANGLE_TOOL_ID);
    host.routePointerDown(evtAt({ x: 50, y: 50 }));
    host.routePointerMove(evtAt({ x: 70, y: 60 }, { alt: true }));
    host.routePointerUp(evtAt({ x: 70, y: 60 }, { alt: true }));

    const rect = rootChildren(state)[0]!;
    if (rect.type !== 'rect') throw new Error('expected rect');
    // dx=20, dy=10 from center (50, 50) → bbox (30,40)–(70,60), 40×20.
    expect(rect.x).toBe(30);
    expect(rect.y).toBe(40);
    expect(rect.width).toBe(40);
    expect(rect.height).toBe(20);
  });

  it('reverse-direction drag inverts the corner correctly', () => {
    const { state, host } = setup(RECTANGLE_TOOL_ID);
    // Press at (100, 100), drag UP-LEFT to (40, 60).
    host.routePointerDown(evtAt({ x: 100, y: 100 }));
    host.routePointerMove(evtAt({ x: 40, y: 60 }));
    host.routePointerUp(evtAt({ x: 40, y: 60 }));

    const rect = rootChildren(state)[0]!;
    if (rect.type !== 'rect') throw new Error('expected rect');
    expect(rect.x).toBe(40);
    expect(rect.y).toBe(60);
    expect(rect.width).toBe(60);
    expect(rect.height).toBe(40);
  });

  it('release without movement (or under threshold) inserts nothing', () => {
    const { state, host } = setup(RECTANGLE_TOOL_ID);
    host.routePointerDown(evtAt({ x: 50, y: 50 }));
    host.routePointerUp(evtAt({ x: 50, y: 50 }));
    expect(rootChildren(state)).toHaveLength(0);

    // Tiny drag (1px) — also below the 2px MIN_SHAPE_EDGE_PX threshold.
    host.routePointerDown(evtAt({ x: 100, y: 100 }));
    host.routePointerMove(evtAt({ x: 101, y: 100 }));
    host.routePointerUp(evtAt({ x: 101, y: 100 }));
    expect(rootChildren(state)).toHaveLength(0);
  });

  it('Escape mid-drag cancels (no insertion)', () => {
    const { state, host, shapes } = setup(RECTANGLE_TOOL_ID);
    host.routePointerDown(evtAt({ x: 0, y: 0 }));
    host.routePointerMove(evtAt({ x: 50, y: 50 }));
    expect(shapes.isDrafting()).toBe(true);
    host.routeKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(shapes.isDrafting()).toBe(false);
    // pointerup with no draft is a no-op — no insertion.
    host.routePointerUp(evtAt({ x: 50, y: 50 }));
    expect(rootChildren(state)).toHaveLength(0);
  });
});

describe('EllipseTool — gesture', () => {
  it('inserts an ellipse fitted to the dragged bounds', () => {
    const { state, host } = setup(ELLIPSE_TOOL_ID);
    host.routePointerDown(evtAt({ x: 10, y: 20 }));
    host.routePointerMove(evtAt({ x: 110, y: 80 }));
    host.routePointerUp(evtAt({ x: 110, y: 80 }));

    const node = rootChildren(state)[0]!;
    expect(node.type).toBe('ellipse');
    if (node.type !== 'ellipse') return;
    // bbox 100×60 → cx=60, cy=50, rx=50, ry=30.
    expect(node.cx).toBe(60);
    expect(node.cy).toBe(50);
    expect(node.rx).toBe(50);
    expect(node.ry).toBe(30);
  });

  it('Shift constrains to circle (rx === ry)', () => {
    const { state, host } = setup(ELLIPSE_TOOL_ID);
    host.routePointerDown(evtAt({ x: 0, y: 0 }));
    host.routePointerMove(evtAt({ x: 100, y: 50 }, { shift: true }));
    host.routePointerUp(evtAt({ x: 100, y: 50 }, { shift: true }));

    const node = rootChildren(state)[0]!;
    if (node.type !== 'ellipse') throw new Error('expected ellipse');
    expect(node.rx).toBe(node.ry);
  });
});

describe('PolygonTool — gesture', () => {
  it('inserts a regular polygon with DEFAULT_POLYGON_SIDES vertices', () => {
    const { state, host } = setup(POLYGON_TOOL_ID);
    host.routePointerDown(evtAt({ x: 0, y: 0 }));
    host.routePointerMove(evtAt({ x: 100, y: 100 }));
    host.routePointerUp(evtAt({ x: 100, y: 100 }));

    const node = rootChildren(state)[0]!;
    expect(node.type).toBe('polygon');
    if (node.type !== 'polygon') return;
    expect(node.points).toHaveLength(DEFAULT_POLYGON_SIDES);
    // First vertex is the TOP of the inscribed polygon (start angle -PI/2).
    // bbox 100×100 → cx=cy=50, rx=ry=50; top vertex = (50, 0).
    expect(node.points[0]!.x).toBeCloseTo(50, 4);
    expect(node.points[0]!.y).toBeCloseTo(0, 4);
  });
});

describe('boundsOfDraft + regularPolygonPoints — pure math', () => {
  it('boundsOfDraft handles negative drag direction', () => {
    const bounds = boundsOfDraft({
      kind: 'rect',
      start: { x: 100, y: 100 },
      current: { x: 40, y: 60 },
      constrainAspect: false,
      fromCenter: false,
    });
    expect(bounds).toEqual({ x: 40, y: 60, w: 60, h: 40 });
  });

  it('boundsOfDraft.fromCenter handles negative deltas (still positive bbox)', () => {
    const bounds = boundsOfDraft({
      kind: 'rect',
      start: { x: 50, y: 50 },
      current: { x: 30, y: 40 },
      constrainAspect: false,
      fromCenter: true,
    });
    // dx=-20, dy=-10 → bbox extends |20| each way horizontally,
    // |10| each way vertically → (30, 40) to (70, 60), 40×20.
    expect(bounds).toEqual({ x: 30, y: 40, w: 40, h: 20 });
  });

  it('regularPolygonPoints clamps sides to [3, 32]', () => {
    const tiny = regularPolygonPoints({ x: 0, y: 0, w: 10, h: 10 }, 2);
    expect(tiny).toHaveLength(3); // clamped up
    const huge = regularPolygonPoints({ x: 0, y: 0, w: 10, h: 10 }, 999);
    expect(huge).toHaveLength(32); // clamped down
  });

  it('regularPolygonPoints returns empty for zero-bounds', () => {
    expect(regularPolygonPoints({ x: 0, y: 0, w: 0, h: 10 }, 6)).toEqual([]);
    expect(regularPolygonPoints({ x: 0, y: 0, w: 10, h: 0 }, 6)).toEqual([]);
  });
});
