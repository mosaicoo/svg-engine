import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../document/document-factory';
import { createGroup, createRect } from '../model/node-factory';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import type { NodeId } from '../types/node-id';
import { ResizeNodesCommand } from './resize-nodes.command';

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  return { state, ctx: { state } };
}

function seed(state: EditorStateService) {
  const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
  const b = createRect({ x: 100, y: 0, width: 10, height: 10 });
  state.setDocument({
    ...state.document(),
    root: createGroup([a, b], { id: state.document().root.id }),
  });
  return { a, b };
}

describe('ResizeNodesCommand', () => {
  it('applies the SAME anchored scale to every node (about the shared anchor)', () => {
    const { state, ctx } = setup();
    const { a, b } = seed(state);
    // anchor at origin, 2× → M·identity = [2,0,0,2,0,0] for each node.
    const cmd = new ResizeNodesCommand(
      [
        { id: a.id, parentMatrix: null },
        { id: b.id, parentMatrix: null },
      ],
      { x: 0, y: 0 },
      2,
      2,
    );
    expect(cmd.execute(ctx).ok).toBe(true);
    expect(findNodeById(state.document().root, a.id)?.transform).toEqual([2, 0, 0, 2, 0, 0]);
    expect(findNodeById(state.document().root, b.id)?.transform).toEqual([2, 0, 0, 2, 0, 0]);
  });

  it('scales about a non-origin anchor (translation reflects the pivot)', () => {
    const { state, ctx } = setup();
    const { a } = seed(state);
    // anchor {10,10}, 2× → T(10,10)·S(2)·T(-10,-10) = [2,0,0,2,-10,-10]
    new ResizeNodesCommand([{ id: a.id, parentMatrix: null }], { x: 10, y: 10 }, 2, 2).execute(ctx);
    expect(findNodeById(state.document().root, a.id)?.transform).toEqual([2, 0, 0, 2, -10, -10]);
  });

  it('undo restores ALL nodes to their original transforms', () => {
    const { state, ctx } = setup();
    const { a, b } = seed(state);
    const cmd = new ResizeNodesCommand(
      [
        { id: a.id, parentMatrix: null },
        { id: b.id, parentMatrix: null },
      ],
      { x: 0, y: 0 },
      3,
      3,
    );
    cmd.execute(ctx);
    cmd.undo(ctx);
    expect(findNodeById(state.document().root, a.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(findNodeById(state.document().root, b.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('empty entries → no-op success (no document mutation)', () => {
    const { state, ctx } = setup();
    seed(state);
    const before = state.document();
    expect(new ResizeNodesCommand([], { x: 0, y: 0 }, 2, 2).execute(ctx).ok).toBe(true);
    expect(state.document()).toBe(before);
  });

  it('skips a missing id but still applies the present ones (partial batch)', () => {
    const { state, ctx } = setup();
    const { a } = seed(state);
    new ResizeNodesCommand(
      [
        { id: a.id, parentMatrix: null },
        { id: 'ghost' as NodeId, parentMatrix: null },
      ],
      { x: 0, y: 0 },
      2,
      2,
    ).execute(ctx);
    expect(findNodeById(state.document().root, a.id)?.transform).toEqual([2, 0, 0, 2, 0, 0]);
  });
});
