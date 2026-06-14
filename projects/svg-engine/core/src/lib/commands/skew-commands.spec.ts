import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument } from '../document/document-factory';
import { createGroup, createRect } from '../model/node-factory';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import type { NodeId } from '../types/node-id';
import { applyTransform } from '../types/transform';
import { composePivotSkew, SkewNodeCommand } from './skew-node.command';
import { SkewNodesCommand } from './skew-nodes.command';

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

/** Round each matrix slot to kill float noise (tan of π/4 etc). */
function round6(t: readonly number[]): number[] {
  return t.map((n) => Math.round(n * 1e6) / 1e6);
}

describe('composePivotSkew', () => {
  it('skewX by 45° around the origin shears (0,10) → (10,10)', () => {
    // skewX(π/4) = [1,0,tan(π/4),1,0,0] = [1,0,1,1,0,0].
    const m = composePivotSkew([1, 0, 0, 1, 0, 0], Math.PI / 4, 0, { x: 0, y: 0 });
    const p = applyTransform(m, 0, 10);
    expect(round6([p.x, p.y])).toEqual([10, 10]);
  });

  it('skewY by 45° around the origin shears (10,0) → (10,10)', () => {
    const m = composePivotSkew([1, 0, 0, 1, 0, 0], 0, Math.PI / 4, { x: 0, y: 0 });
    const p = applyTransform(m, 10, 0);
    expect(round6([p.x, p.y])).toEqual([10, 10]);
  });

  it('keeps the pivot point stationary', () => {
    const pivot = { x: 25, y: 40 };
    const m = composePivotSkew([1, 0, 0, 1, 0, 0], Math.PI / 6, Math.PI / 8, pivot);
    const p = applyTransform(m, pivot.x, pivot.y);
    expect(round6([p.x, p.y])).toEqual([pivot.x, pivot.y]);
  });
});

describe('SkewNodeCommand', () => {
  it('rejects non-finite skew angles', () => {
    expect(() => new SkewNodeCommand('n' as NodeId, NaN, 0, { x: 0, y: 0 })).toThrow(RangeError);
  });

  it('applies the pivot skew and undo restores the original transform', () => {
    const { state, ctx } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a], { id: state.document().root.id }),
    });
    const cmd = new SkewNodeCommand(a.id, Math.PI / 4, 0, { x: 0, y: 0 });
    cmd.execute(ctx);
    const skewed = findNodeById(state.document().root, a.id)!.transform;
    const p = applyTransform(skewed, 0, 10);
    expect(round6([p.x, p.y])).toEqual([10, 10]);

    cmd.undo(ctx);
    expect(findNodeById(state.document().root, a.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('fails for a missing node', () => {
    const { ctx } = setup();
    expect(new SkewNodeCommand('ghost' as NodeId, 0.1, 0, { x: 0, y: 0 }).execute(ctx).ok).toBe(
      false,
    );
  });
});

describe('SkewNodesCommand', () => {
  it('shears every node about the SHARED pivot by the same angles', () => {
    const { state, ctx } = setup();
    const { a, b } = seed(state);
    new SkewNodesCommand(
      [
        { id: a.id, parentMatrix: null },
        { id: b.id, parentMatrix: null },
      ],
      { x: 0, y: 0 },
      Math.PI / 4,
      0,
    ).execute(ctx);

    const ra = findNodeById(state.document().root, a.id);
    const pa = applyTransform(ra!.transform, 0, 10);
    expect(round6([pa.x, pa.y])).toEqual([10, 10]);
    const rb = findNodeById(state.document().root, b.id);
    const pb = applyTransform(rb!.transform, 0, 10);
    expect(round6([pb.x, pb.y])).toEqual([10, 10]);
  });

  it('group skew of ONE top-level node equals SkewNodeCommand (parity)', () => {
    const { state, ctx } = setup();

    const a1 = createRect({ x: 30, y: 40, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a1], { id: state.document().root.id }),
    });
    new SkewNodeCommand(a1.id, Math.PI / 7, Math.PI / 9, { x: 50, y: 50 }).execute(ctx);
    const singleT = findNodeById(state.document().root, a1.id)!.transform;

    state.resetDocument(createEmptyDocument());
    const a2 = createRect({ x: 30, y: 40, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a2], { id: state.document().root.id }),
    });
    new SkewNodesCommand(
      [{ id: a2.id, parentMatrix: null }],
      { x: 50, y: 50 },
      Math.PI / 7,
      Math.PI / 9,
    ).execute(ctx);
    const batchT = findNodeById(state.document().root, a2.id)!.transform;

    expect(round6(batchT)).toEqual(round6(singleT));
  });

  it('undo restores ALL nodes to their original transforms', () => {
    const { state, ctx } = setup();
    const { a, b } = seed(state);
    const cmd = new SkewNodesCommand(
      [
        { id: a.id, parentMatrix: null },
        { id: b.id, parentMatrix: null },
      ],
      { x: 25, y: 25 },
      Math.PI / 6,
      Math.PI / 6,
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
    expect(new SkewNodesCommand([], { x: 0, y: 0 }, 0.1, 0).execute(ctx).ok).toBe(true);
    expect(state.document()).toBe(before);
  });

  it('skips a missing id but still applies the present ones (partial batch)', () => {
    const { state, ctx } = setup();
    const { a } = seed(state);
    new SkewNodesCommand(
      [
        { id: a.id, parentMatrix: null },
        { id: 'ghost' as NodeId, parentMatrix: null },
      ],
      { x: 0, y: 0 },
      Math.PI / 4,
      0,
    ).execute(ctx);
    const ra = findNodeById(state.document().root, a.id);
    const p = applyTransform(ra!.transform, 0, 10);
    expect(round6([p.x, p.y])).toEqual([10, 10]);
  });
});
