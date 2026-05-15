import { TestBed } from '@angular/core/testing';
import { CommandBus, createEmptyDocument, EditorStateService, type Point } from 'svg-engine/core';
import { PluginRegistry } from '../plugin/plugin-registry.service';
import { provideSvgEnginePlugin } from '../plugin/provide-plugin';
import { SelectionService } from '../selection/selection.service';
import {
  PENCIL_TOOL_ID,
  pencilToolPlugin,
  pointsToPathD,
  SELECT_TOOL_ID,
  selectToolPlugin,
} from './builtin-tools';
import { ToolHostService } from './tool-host.service';
import { ToolRegistry } from './tool-registry.service';
import type { ToolPointerEvent } from './tool';

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

describe('selectToolPlugin + pencilToolPlugin — install via provider', () => {
  it('both plugins register their tools at bootstrap', () => {
    TestBed.configureTestingModule({
      providers: [
        provideSvgEnginePlugin(selectToolPlugin),
        provideSvgEnginePlugin(pencilToolPlugin),
      ],
    });
    const reg = TestBed.inject(ToolRegistry);
    const ids = reg.tools().map((t) => t.id);
    expect(ids).toEqual([SELECT_TOOL_ID, PENCIL_TOOL_ID]);
  });

  it('shortcuts are wired (v=select, p=pencil)', () => {
    TestBed.configureTestingModule({
      providers: [
        provideSvgEnginePlugin(selectToolPlugin),
        provideSvgEnginePlugin(pencilToolPlugin),
      ],
    });
    const reg = TestBed.inject(ToolRegistry);
    expect(reg.getByShortcut('v')?.id).toBe(SELECT_TOOL_ID);
    expect(reg.getByShortcut('p')?.id).toBe(PENCIL_TOOL_ID);
  });

  it('uninstalling a plugin removes its tool', () => {
    TestBed.configureTestingModule({
      providers: [provideSvgEnginePlugin(pencilToolPlugin)],
    });
    const pluginReg = TestBed.inject(PluginRegistry);
    const toolReg = TestBed.inject(ToolRegistry);
    expect(toolReg.tools().length).toBe(1);
    pluginReg.uninstall(pencilToolPlugin.id);
    expect(toolReg.tools().length).toBe(0);
  });
});

describe('PencilTool — end-to-end gesture', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [provideSvgEnginePlugin(pencilToolPlugin)],
    });
    const state = TestBed.inject(EditorStateService);
    state.resetDocument(createEmptyDocument());
    const host = TestBed.inject(ToolHostService);
    host.activate(PENCIL_TOOL_ID);
    return { state, host, bus: TestBed.inject(CommandBus) };
  }

  it('drawing with at least 2 points commits a path via InsertNodeCommand', () => {
    const { state, host } = setup();
    const before = state.document().root.children.length;
    host.routePointerDown(evtAt({ x: 0, y: 0 }));
    host.routePointerMove(evtAt({ x: 10, y: 10 }));
    host.routePointerMove(evtAt({ x: 20, y: 5 }));
    host.routePointerUp(evtAt({ x: 20, y: 5 }));
    const after = state.document().root.children;
    expect(after.length).toBe(before + 1);
    const inserted = after[after.length - 1]!;
    expect(inserted.type).toBe('path');
    expect((inserted as { d: string }).d).toBe('M0.0 0.0 L10.0 10.0 L20.0 5.0');
  });

  it('release without movement (single click) is a no-op', () => {
    const { state, host } = setup();
    const before = state.document().root.children.length;
    host.routePointerDown(evtAt({ x: 5, y: 5 }));
    host.routePointerUp(evtAt({ x: 5, y: 5 }));
    expect(state.document().root.children.length).toBe(before);
  });

  it('pointercancel discards the gesture', () => {
    const { state, host } = setup();
    const before = state.document().root.children.length;
    host.routePointerDown(evtAt({ x: 0, y: 0 }));
    host.routePointerMove(evtAt({ x: 50, y: 50 }));
    host.routePointerCancel(evtAt({ x: 50, y: 50 }));
    // A subsequent up shouldn't commit either — drawing flag is cleared.
    host.routePointerUp(evtAt({ x: 50, y: 50 }));
    expect(state.document().root.children.length).toBe(before);
  });

  it('switching to another tool mid-draft cancels the in-progress gesture', () => {
    TestBed.configureTestingModule({
      providers: [
        provideSvgEnginePlugin(selectToolPlugin),
        provideSvgEnginePlugin(pencilToolPlugin),
      ],
    });
    const state = TestBed.inject(EditorStateService);
    state.resetDocument(createEmptyDocument());
    const host = TestBed.inject(ToolHostService);
    host.activate(PENCIL_TOOL_ID);
    host.routePointerDown(evtAt({ x: 0, y: 0 }));
    host.routePointerMove(evtAt({ x: 10, y: 10 }));
    host.activate(SELECT_TOOL_ID);
    // After switching, the route still goes to select (no-op); previous
    // pencil draft is gone (onDeactivate cleared it).
    host.routePointerUp(evtAt({ x: 10, y: 10 }));
    expect(state.document().root.children.length).toBe(0);
  });

  it('clears selection on activate', () => {
    TestBed.configureTestingModule({
      providers: [provideSvgEnginePlugin(pencilToolPlugin)],
    });
    const sel = TestBed.inject(SelectionService);
    sel.select('some-node-id' as never);
    expect(sel.hasSelection()).toBe(true);
    const host = TestBed.inject(ToolHostService);
    host.activate(PENCIL_TOOL_ID);
    expect(sel.hasSelection()).toBe(false);
  });
});

describe('pointsToPathD', () => {
  it('returns empty string for empty input', () => {
    expect(pointsToPathD([])).toBe('');
  });

  it('first point is M, rest are L', () => {
    expect(pointsToPathD([{ x: 1, y: 2 }])).toBe('M1.0 2.0');
    expect(
      pointsToPathD([
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ]),
    ).toBe('M0.0 0.0 L5.0 5.0');
  });

  it('rounds to 1 decimal', () => {
    expect(pointsToPathD([{ x: 0.123, y: 0.987 }])).toBe('M0.1 1.0');
  });
});
