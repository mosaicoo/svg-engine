import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEmptyDocument,
  createRect,
  EditorStateService,
  findNodeById,
  HistoryService,
  InsertNodeCommand,
} from '@mosaicoo/svg-engine/core';
import { PluginRegistry } from '../plugin/plugin-registry.service';
import { ShortcutRegistry } from '../shortcut/shortcut-registry.service';
import { SelectionService } from './selection.service';
import { selectionNudgePlugin } from './selection-nudge.plugin';

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  const selection = TestBed.inject(SelectionService);
  const bus = TestBed.inject(CommandBus);
  const history = TestBed.inject(HistoryService);
  const pluginReg = TestBed.inject(PluginRegistry);
  const shortcuts = TestBed.inject(ShortcutRegistry);
  state.resetDocument(createEmptyDocument());
  history.clear();
  selection.clear();
  return { state, selection, bus, history, pluginReg, shortcuts };
}

function key(combo: string): KeyboardEvent {
  // Build a KeyboardEvent the way ShortcutService matches it. parseCombo
  // accepts forms like 'ArrowUp', 'Shift+ArrowDown'. We replicate the
  // parse so the test exercises the same code path the runtime uses.
  const parts = combo.split('+');
  const keyToken = parts[parts.length - 1]!;
  const mods = parts.slice(0, -1).map((s) => s.toLowerCase());
  return new KeyboardEvent('keydown', {
    key: keyToken,
    shiftKey: mods.includes('shift'),
    ctrlKey: mods.includes('ctrl') || mods.includes('control'),
    altKey: mods.includes('alt') || mods.includes('option'),
    metaKey: mods.includes('meta') || mods.includes('cmd'),
    cancelable: true,
  });
}

describe('selectionNudgePlugin — registration', () => {
  it('install registers all 8 arrow shortcuts; uninstall removes them', () => {
    const { pluginReg, shortcuts } = setup();
    const before = shortcuts.shortcuts().length;
    pluginReg.install(selectionNudgePlugin);
    expect(shortcuts.shortcuts().length).toBe(before + 8);
    pluginReg.uninstall(selectionNudgePlugin.id);
    expect(shortcuts.shortcuts().length).toBe(before);
  });

  it('declares the current PLUGIN_API_VERSION', async () => {
    const { PLUGIN_API_VERSION } = await import('../plugin/plugin');
    expect(selectionNudgePlugin.apiVersion).toBe(PLUGIN_API_VERSION);
  });
});

describe('selectionNudgePlugin — nudge behaviour', () => {
  it('ArrowRight moves a single selected node by +1 in x', () => {
    const { state, selection, bus, pluginReg, shortcuts } = setup();
    const rect = createRect({ x: 10, y: 20, width: 30, height: 30 });
    bus.dispatch(new InsertNodeCommand(state.document().root.id, rect));
    selection.select(rect.id);
    pluginReg.install(selectionNudgePlugin);
    const ev = key('ArrowRight');
    const matched = shortcuts.tryMatch(ev);
    expect(matched).not.toBeNull();
    matched?.run(ev);
    const moved = findNodeById(state.document().root, rect.id);
    // Translate(1,0) appended to identity transform => transform[4] == 1
    expect((moved as unknown as { transform: readonly number[] }).transform[4]).toBe(1);
  });

  it('Shift+ArrowDown moves selection by +10 in y (large step)', () => {
    const { state, selection, bus, pluginReg, shortcuts } = setup();
    const rect = createRect({ x: 0, y: 0, width: 5, height: 5 });
    bus.dispatch(new InsertNodeCommand(state.document().root.id, rect));
    selection.select(rect.id);
    pluginReg.install(selectionNudgePlugin);
    const ev = key('Shift+ArrowDown');
    shortcuts.tryMatch(ev)?.run(ev);
    const moved = findNodeById(state.document().root, rect.id);
    expect((moved as unknown as { transform: readonly number[] }).transform[5]).toBe(10);
  });

  it('empty selection: arrow press is a no-op but still preventDefault', () => {
    const { selection, history, pluginReg, shortcuts } = setup();
    selection.clear();
    pluginReg.install(selectionNudgePlugin);
    const before = history.canUndo();
    const ev = key('ArrowUp');
    shortcuts.tryMatch(ev)?.run(ev);
    // No command pushed onto history
    expect(history.canUndo()).toBe(before);
    // preventDefault was called (avoids page-scroll while canvas focused)
    expect(ev.defaultPrevented).toBe(true);
  });

  it('multi-select: ALL selected nodes move by the same delta in one undo entry', () => {
    const { state, selection, bus, history, pluginReg, shortcuts } = setup();
    const a = createRect({ x: 0, y: 0, width: 5, height: 5 });
    const b = createRect({ x: 50, y: 50, width: 5, height: 5 });
    bus.dispatch(new InsertNodeCommand(state.document().root.id, a));
    bus.dispatch(new InsertNodeCommand(state.document().root.id, b));
    selection.selectMany([a.id, b.id]);
    pluginReg.install(selectionNudgePlugin);
    const before = history.undoStack().length;
    const ev = key('ArrowLeft');
    shortcuts.tryMatch(ev)?.run(ev);
    expect(history.undoStack().length).toBe(before + 1); // ONE entry, not two
    const movedA = findNodeById(state.document().root, a.id);
    const movedB = findNodeById(state.document().root, b.id);
    expect((movedA as unknown as { transform: readonly number[] }).transform[4]).toBe(-1);
    expect((movedB as unknown as { transform: readonly number[] }).transform[4]).toBe(-1);
  });
});
