import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../document/document-factory';
import { createGroup, createRect } from '../model/node-factory';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import type { NodeId } from '../types/node-id';
import { applyTransform } from '../types/transform';
import { RotateNodesCommand } from './rotate-nodes.command';
import { RotateNodeCommand } from './rotate-node.command';

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

/** Round each matrix slot to kill float noise (sin/cos of π/2 etc). */
function round6(t: readonly number[]): number[] {
  return t.map((n) => Math.round(n * 1e6) / 1e6);
}

describe('RotateNodesCommand', () => {
  it('rotates every node about the SHARED pivot by the same angle', () => {
    const { state, ctx } = setup();
    const { a, b } = seed(state);
    // 90° about origin: a point (1,0) → (0,1). Both nodes rotate rigidly.
    new RotateNodesCommand(
      [
        { id: a.id, parentMatrix: null },
        { id: b.id, parentMatrix: null },
      ],
      { x: 0, y: 0 },
      Math.PI / 2,
    ).execute(ctx);

    // a's origin (0,0) stays at (0,0) under rotation about origin.
    const ra = findNodeById(state.document().root, a.id);
    const pa = applyTransform(ra!.transform, 0, 0);
    expect(round6([pa.x, pa.y])).toEqual([0, 0]);
    // b sits at local origin (0,0) but its transform is identity, so its
    // own origin also maps to (0,0)... instead verify b's far corner
    // (its node-space (0,0) is doc (100,0) only via geometry, not
    // transform). Assert via a doc-space point: rotate (100,0) about
    // origin by 90° → (0,100). Apply b's NEW transform to (100,0).
    const rb = findNodeById(state.document().root, b.id);
    const pb = applyTransform(rb!.transform, 100, 0);
    expect(round6([pb.x, pb.y])).toEqual([0, 100]);
  });

  it('group rotation of ONE top-level node equals RotateNodeCommand (parity)', () => {
    // Proves the batch path can never drift from the single path: same
    // pivot + angle must produce the same transform for a lone node.
    // Both runs share ONE TestBed (setup() is called once); each builds
    // its own node in a fresh document via resetDocument.
    const { state, ctx } = setup();

    const a1 = createRect({ x: 30, y: 40, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a1], { id: state.document().root.id }),
    });
    new RotateNodeCommand(a1.id, Math.PI / 3, { x: 50, y: 50 }).execute(ctx);
    const singleT = findNodeById(state.document().root, a1.id)!.transform;

    // Fresh document for the batch run (same TestBed, no re-configure).
    state.resetDocument(createEmptyDocument());
    const a2 = createRect({ x: 30, y: 40, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a2], { id: state.document().root.id }),
    });
    new RotateNodesCommand(
      [{ id: a2.id, parentMatrix: null }],
      { x: 50, y: 50 },
      Math.PI / 3,
    ).execute(ctx);
    const batchT = findNodeById(state.document().root, a2.id)!.transform;

    expect(round6(batchT)).toEqual(round6(singleT));
  });

  it('undo restores ALL nodes to their original transforms', () => {
    const { state, ctx } = setup();
    const { a, b } = seed(state);
    const cmd = new RotateNodesCommand(
      [
        { id: a.id, parentMatrix: null },
        { id: b.id, parentMatrix: null },
      ],
      { x: 25, y: 25 },
      Math.PI / 4,
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
    expect(new RotateNodesCommand([], { x: 0, y: 0 }, 1).execute(ctx).ok).toBe(true);
    expect(state.document()).toBe(before);
  });

  it('skips a missing id but still applies the present ones (partial batch)', () => {
    const { state, ctx } = setup();
    const { a } = seed(state);
    new RotateNodesCommand(
      [
        { id: a.id, parentMatrix: null },
        { id: 'ghost' as NodeId, parentMatrix: null },
      ],
      { x: 0, y: 0 },
      Math.PI / 2,
    ).execute(ctx);
    const ra = findNodeById(state.document().root, a.id);
    const p = applyTransform(ra!.transform, 10, 0);
    expect(round6([p.x, p.y])).toEqual([0, 10]); // (10,0) rot 90° about origin → (0,10)
  });
});
