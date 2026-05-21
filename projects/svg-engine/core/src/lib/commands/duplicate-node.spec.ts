import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../document/document-factory';
import { createGroup, createRect } from '../model/node-factory';
import { CommandBus } from '../command-bus/command-bus.service';
import { EditorStateService } from '../state/editor-state.service';
import { HistoryService } from '../history/history.service';
import { TestBed } from '@angular/core/testing';
import { DuplicateNodeCommand } from './duplicate-node.command';
import { InsertNodeCommand } from './insert-node.command';

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  const bus = TestBed.inject(CommandBus);
  const history = TestBed.inject(HistoryService);
  state.resetDocument(createEmptyDocument());
  history.clear();
  return { state, bus, history };
}

describe('DuplicateNodeCommand', () => {
  it('empty originalIds → no-op success', () => {
    const { state, bus } = setup();
    const before = state.document().root;
    bus.dispatch(new DuplicateNodeCommand([]));
    expect(state.document().root).toBe(before);
  });

  it('duplicates a single rect into the same parent, offset by 10px (default)', () => {
    const { state, bus } = setup();
    const rect = createRect({ x: 10, y: 20, width: 30, height: 40 });
    bus.dispatch(new InsertNodeCommand(state.document().root.id, rect));
    const cmd = new DuplicateNodeCommand([rect.id]);
    bus.dispatch(cmd);
    const children = (
      state.document().root as {
        readonly children: readonly { readonly id: string; readonly type: string }[];
      }
    ).children;
    expect(children.length).toBe(2);
    expect(children[0]!.id).toBe(rect.id);
    expect(children[1]!.id).not.toBe(rect.id);
    expect(children[1]!.type).toBe('rect');
    expect(cmd.getInsertedIds().length).toBe(1);
    expect(cmd.getInsertedIds()[0]).toBe(children[1]!.id);
  });

  it('cannot duplicate the document root (fails atomically)', () => {
    const { state, bus, history } = setup();
    const rootId = state.document().root.id;
    bus.dispatch(new DuplicateNodeCommand([rootId]));
    // Document untouched + nothing pushed onto history.
    expect(
      (state.document().root as { readonly children: readonly unknown[] }).children.length,
    ).toBe(0);
    expect(history.canUndo()).toBe(false);
  });

  it('undo removes the duplicate(s) and restores the original-only document', () => {
    const { state, bus } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    bus.dispatch(new InsertNodeCommand(state.document().root.id, rect));
    bus.dispatch(new DuplicateNodeCommand([rect.id]));
    expect(
      (state.document().root as { readonly children: readonly unknown[] }).children.length,
    ).toBe(2);
    bus.undo();
    expect(
      (state.document().root as { readonly children: readonly unknown[] }).children.length,
    ).toBe(1);
  });

  it('duplicates a group deep-cloning children with new ids', () => {
    const { state, bus } = setup();
    const r1 = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const r2 = createRect({ x: 20, y: 0, width: 10, height: 10 });
    const g = createGroup([r1, r2]);
    bus.dispatch(new InsertNodeCommand(state.document().root.id, g));
    bus.dispatch(new DuplicateNodeCommand([g.id]));
    const children = (
      state.document().root as {
        readonly children: readonly {
          readonly id: string;
          readonly type: string;
          readonly children?: readonly { readonly id: string }[];
        }[];
      }
    ).children;
    expect(children.length).toBe(2);
    const dup = children[1]!;
    expect(dup.type).toBe('group');
    expect(dup.id).not.toBe(g.id);
    // children of the duplicate must have fresh ids (no collision with originals)
    expect(dup.children?.[0]!.id).not.toBe(r1.id);
    expect(dup.children?.[1]!.id).not.toBe(r2.id);
  });
});
