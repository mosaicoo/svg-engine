import { TestBed } from '@angular/core/testing';
import {
  createEmptyDocument,
  EditorStateService,
  isGroupNode,
  type Point,
  type TextNode,
} from '@mosaicoo/svg-engine/core';
import { PluginRegistry } from '../plugin/plugin-registry.service';
import { provideSvgEnginePlugin } from '../plugin/provide-plugin';
import { PLACEHOLDER_TEXT, TEXT_TOOL_ID, textToolPlugin } from './text-tool.plugin';
import { InlineTextEditorService } from './text-tool.service';
import type { ToolPointerEvent } from './tool';
import { ToolHostService } from './tool-host.service';
import { ToolRegistry } from './tool-registry.service';

function evtAt(point: Point, button = 0): ToolPointerEvent {
  return {
    raw: new PointerEvent('pointerdown', { pointerId: 1, button }),
    docPoint: point,
    screenX: 0,
    screenY: 0,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  };
}

function setup() {
  TestBed.configureTestingModule({
    providers: [provideSvgEnginePlugin(textToolPlugin)],
  });
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  const host = TestBed.inject(ToolHostService);
  host.activate(TEXT_TOOL_ID);
  return {
    state,
    host,
    editorSvc: TestBed.inject(InlineTextEditorService),
  };
}

function textChildren(state: EditorStateService): readonly TextNode[] {
  const root = state.document().root;
  if (!isGroupNode(root)) return [];
  return root.children.filter((c): c is TextNode => c.type === 'text');
}

describe('textToolPlugin — registration', () => {
  it('registers the Text tool at bootstrap', () => {
    TestBed.configureTestingModule({ providers: [provideSvgEnginePlugin(textToolPlugin)] });
    expect(
      TestBed.inject(ToolRegistry)
        .tools()
        .map((t) => t.id),
    ).toContain(TEXT_TOOL_ID);
  });

  it('shortcut "t" activates the Text tool', () => {
    TestBed.configureTestingModule({ providers: [provideSvgEnginePlugin(textToolPlugin)] });
    expect(TestBed.inject(ToolRegistry).getByShortcut('t')?.id).toBe(TEXT_TOOL_ID);
  });

  it('uninstalling removes the Text tool', () => {
    TestBed.configureTestingModule({ providers: [provideSvgEnginePlugin(textToolPlugin)] });
    const pluginReg = TestBed.inject(PluginRegistry);
    const toolReg = TestBed.inject(ToolRegistry);
    expect(toolReg.tools().length).toBe(1);
    pluginReg.uninstall(textToolPlugin.id);
    expect(toolReg.tools().length).toBe(0);
  });
});

describe('TextTool — pointer behaviour', () => {
  it('click inserts a text node with placeholder content + opens editor', () => {
    const { state, host, editorSvc } = setup();
    host.routePointerDown(evtAt({ x: 50, y: 30 }));

    const texts = textChildren(state);
    expect(texts).toHaveLength(1);
    const node = texts[0]!;
    expect(node.content).toBe(PLACEHOLDER_TEXT);
    expect(node.x).toBe(50);
    // y is offset down by font-size * 0.8 (baseline approximation) —
    // 30 + 16 * 0.8 = 42.8.
    expect(node.y).toBeCloseTo(42.8, 1);
    // Editor service was notified about the new node id.
    expect(editorSvc.editingId()).toBe(node.id);
    expect(editorSvc.isPlaceholder()).toBe(true);
  });

  it('right-click does not insert anything (left-click only)', () => {
    const { state, host, editorSvc } = setup();
    host.routePointerDown(evtAt({ x: 50, y: 30 }, /* button: right */ 2));
    expect(textChildren(state)).toHaveLength(0);
    expect(editorSvc.editingId()).toBeNull();
  });

  it('multiple clicks open editor for the most recent node (one at a time)', () => {
    const { state, host, editorSvc } = setup();
    host.routePointerDown(evtAt({ x: 10, y: 10 }));
    const firstId = editorSvc.editingId();
    expect(firstId).not.toBeNull();

    host.routePointerDown(evtAt({ x: 100, y: 100 }));
    const secondId = editorSvc.editingId();
    expect(secondId).not.toBeNull();
    expect(secondId).not.toBe(firstId);

    expect(textChildren(state)).toHaveLength(2);
  });

  it('clicking on an existing text node opens edit on it (no new placeholder) — bug fix #1', () => {
    const { state, host, editorSvc } = setup();
    // Seed an existing text node in the document — the Text tool's
    // hit-test should find it via data-node-id on the event target.
    // We simulate the DOM target by constructing a PointerEvent with
    // an HTML element carrying the data-node-id attribute.
    host.routePointerDown(evtAt({ x: 30, y: 30 }));
    editorSvc.endEdit(); // close the editor opened by the click
    const seeded = textChildren(state);
    expect(seeded).toHaveLength(1);
    const existingId = seeded[0]!.id;

    // Forge a pointer event whose target carries the existing node id.
    // resolveNodeIdFromEvent walks the element's parent chain looking
    // for `data-node-id`; matching the existing seeded id makes the
    // tool's hit-test branch fire.
    const target = document.createElement('div');
    target.setAttribute('data-node-id', existingId);
    const raw = new PointerEvent('pointerdown', { pointerId: 1, button: 0 });
    Object.defineProperty(raw, 'target', { value: target });

    host.routePointerDown({
      raw,
      docPoint: { x: 30, y: 30 },
      screenX: 0,
      screenY: 0,
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
    });

    // No new placeholder — same single text node, but now in edit mode
    // with isPlaceholder=false (we are editing existing content).
    expect(textChildren(state)).toHaveLength(1);
    expect(editorSvc.editingId()).toBe(existingId);
    expect(editorSvc.isPlaceholder()).toBe(false);
  });
});

describe('InlineTextEditorService — state machine', () => {
  it('beginEdit sets both editingId and isPlaceholder', () => {
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(InlineTextEditorService);
    svc.endEdit(); // ensure clean state
    expect(svc.editingId()).toBeNull();
    expect(svc.isPlaceholder()).toBe(false);

    const fakeId = 'fake-id' as unknown as Parameters<typeof svc.beginEdit>[0];
    svc.beginEdit(fakeId, true);
    expect(svc.editingId()).toBe(fakeId);
    expect(svc.isPlaceholder()).toBe(true);

    svc.endEdit();
    expect(svc.editingId()).toBeNull();
    expect(svc.isPlaceholder()).toBe(false);
  });

  it('beginEdit with placeholder=false sets the flag accordingly', () => {
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(InlineTextEditorService);
    svc.endEdit();
    const fakeId = 'fake' as unknown as Parameters<typeof svc.beginEdit>[0];
    svc.beginEdit(fakeId, false);
    expect(svc.isPlaceholder()).toBe(false);
    svc.endEdit();
  });
});
