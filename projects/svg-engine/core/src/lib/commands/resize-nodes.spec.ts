import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { createRect } from '../model/node-factory';
import { createEmptyDocument } from '../model/document';
import { EditorStateService } from '../state/editor-state.service';
import { CommandBus } from '../command-bus/command-bus.service';
import { findNodeById } from '../tree/tree-ops';
import type { NodeId } from '../types/node-id';
import { ResizeNodesCommand } from './resize-nodes.command';

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  const bus = TestBed.inject(CommandBus);
  state.resetDocument(createEmptyDocument());
  return { state, bus };
}

function seed(state: EditorStateService) {
  const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
  const b = createRect({ x: 100, y: 0, width: 10, height: 10 });
  state.resetDocument({
    ...state.document(),
    root: { ...state.document().root, children: [a, b] },
  });
  return { a, b };
}

describe('ResizeNodesCommand', () => {
  it('applies the SAME anchored scale to every node (about the shared anchor)', () => {
    const { state, bus } = setup();
    const { a, b } = seed(state);
    // anchor at origin, 2× → composeAnchoredScale(identity,2,2,{0,0}) = [2,0,0,2,0,0]
    bus.dispatch(
      new ResizeNodesCommand(
        [
          { id: a.id, parentMatrix: null },
          { id: b.id, parentMatrix: null },
        ],
        { x: 0, y: 0 },
        2,
        2,
      ),
    );
    const ra = findNodeById(state.document().root, a.id);
    const rb = findNodeById(state.document().root, b.id);
    expect(ra?.transform).toEqual([2, 0, 0, 2, 0, 0]);
    expect(rb?.transform).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it('scales about a non-origin anchor (translation component reflects the pivot)', () => {
    const { state, bus } = setup();
    const { a } = seed(state);
    // anchor {10,10}, 2× → scaleAt(2,2,10,10) = [2,0,0,2,-10,-10]
    bus.dispatch(
      new ResizeNodesCommand([{ id: a.id, parentMatrix: null }], { x: 10, y: 10 }, 2, 2),
    );
    const ra = findNodeById(state.document().root, a.id);
    expect(ra?.transform).toEqual([2, 0, 0, 2, -10, -10]);
  });

  it('undo restores ALL nodes to their original transforms', () => {
    const { state, bus } = setup();
    const { a, b } = seed(state);
    bus.dispatch(
      new ResizeNodesCommand(
        [
          { id: a.id, parentMatrix: null },
          { id: b.id, parentMatrix: null },
        ],
        { x: 0, y: 0 },
        3,
        3,
      ),
    );
    bus.undo();
    const ra = findNodeById(state.document().root, a.id);
    const rb = findNodeById(state.document().root, b.id);
    expect(ra?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(rb?.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('empty entries → no-op success (no document mutation)', () => {
    const { state, bus } = setup();
    seed(state);
    const before = state.document();
    const r = bus.dispatch(new ResizeNodesCommand([], { x: 0, y: 0 }, 2, 2));
    expect(r.ok).toBe(true);
    expect(state.document()).toBe(before);
  });

  it('skips a missing id but still applies the present ones (partial batch)', () => {
    const { state, bus } = setup();
    const { a } = seed(state);
    bus.dispatch(
      new ResizeNodesCommand(
        [
          { id: a.id, parentMatrix: null },
          { id: 'ghost' as NodeId, parentMatrix: null },
        ],
        { x: 0, y: 0 },
        2,
        2,
      ),
    );
    const ra = findNodeById(state.document().root, a.id);
    expect(ra?.transform).toEqual([2, 0, 0, 2, 0, 0]);
  });
});
