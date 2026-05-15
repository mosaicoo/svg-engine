import { TestBed } from '@angular/core/testing';
import { fail, ok, type Command } from '../commands/command';
import { InsertNodeCommand } from '../commands/insert-node.command';
import { MoveNodeCommand } from '../commands/move-node.command';
import { createEmptyDocument } from '../document/document-factory';
import { HistoryService } from '../history/history.service';
import { createRect } from '../model/node-factory';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import { CommandBus } from './command-bus.service';

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  const history = TestBed.inject(HistoryService);
  const bus = TestBed.inject(CommandBus);
  state.resetDocument(createEmptyDocument());
  history.clear();
  return { state, history, bus };
}

describe('CommandBus / dispatch', () => {
  it('pushes command to history on success', () => {
    const { state, history, bus } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    const cmd = new InsertNodeCommand(state.document().root.id, rect);

    const r = bus.dispatch(cmd);

    expect(r.ok).toBe(true);
    expect(history.canUndo()).toBe(true);
    expect(history.peekUndo()).toBe(cmd);
  });

  it('does not push command to history on failure', () => {
    const { history, bus } = setup();
    const failing: Command = {
      id: 'failing',
      label: 'failing',
      execute: () => fail('boom'),
      undo: () => ok(),
    };

    const r = bus.dispatch(failing);

    expect(r.ok).toBe(false);
    expect(history.canUndo()).toBe(false);
  });

  it('clears redo stack on new dispatch', () => {
    const { state, history, bus } = setup();
    const rect1 = createRect({ x: 0, y: 0, width: 1, height: 1 });
    const rect2 = createRect({ x: 5, y: 5, width: 1, height: 1 });

    bus.dispatch(new InsertNodeCommand(state.document().root.id, rect1));
    bus.undo();
    expect(history.canRedo()).toBe(true);

    bus.dispatch(new InsertNodeCommand(state.document().root.id, rect2));
    expect(history.canRedo()).toBe(false);
  });
});

describe('CommandBus / undo + redo round-trip', () => {
  it('undo+redo restores the same final state', () => {
    const { state, bus } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    bus.dispatch(new InsertNodeCommand(state.document().root.id, rect));
    bus.dispatch(new MoveNodeCommand(rect.id, 50, 60));

    const afterDispatch = state.document();

    bus.undo();
    bus.undo();

    expect(state.document().root.children).toHaveLength(0);

    bus.redo();
    bus.redo();

    const moved = findNodeById(state.document().root, rect.id);
    expect(moved?.transform).toEqual([1, 0, 0, 1, 50, 60]);
    expect(state.document().root.children).toEqual(afterDispatch.root.children);
  });

  it('reports failure when nothing to undo', () => {
    const { bus } = setup();
    const r = bus.undo();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Nothing to undo/);
  });

  it('reports failure when nothing to redo', () => {
    const { bus } = setup();
    const r = bus.redo();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Nothing to redo/);
  });

  it('failed undo leaves stacks untouched', () => {
    const { history, bus } = setup();
    const flaky: Command = {
      id: 'flaky',
      label: 'flaky',
      execute: () => ok(),
      undo: () => fail('cannot undo'),
    };
    bus.dispatch(flaky);
    expect(history.canUndo()).toBe(true);

    const r = bus.undo();

    expect(r.ok).toBe(false);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });
});
