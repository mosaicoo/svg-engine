import { TestBed } from '@angular/core/testing';
import { createEmptyDocument } from '../document/document-factory';
import { createGroup, createRect } from '../model/node-factory';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { applyTransform } from '../types/transform';
import { TranslateManyCommand } from './translate-many.command';

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  return { state, ctx: { state } };
}

describe('TranslateManyCommand', () => {
  it('translates two nodes by their respective deltas in one step', () => {
    const { state, ctx } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 100, y: 100, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b], { id: state.document().root.id }),
    });

    const deltas = new Map<NodeId, { x: number; y: number }>([
      [a.id, { x: 5, y: 0 }],
      [b.id, { x: -10, y: -20 }],
    ]);
    const cmd = new TranslateManyCommand(deltas);
    expect(cmd.execute(ctx).ok).toBe(true);

    // Apply the moved transform to (0,0) of each — should land at the delta.
    const movedA = findNodeById(state.document().root, a.id);
    const movedB = findNodeById(state.document().root, b.id);
    const pA = applyTransform(movedA!.transform, 0, 0);
    const pB = applyTransform(movedB!.transform, 0, 0);
    expect(pA).toEqual({ x: 5, y: 0 });
    expect(pB).toEqual({ x: -10, y: -20 });
  });

  it('undo restores every previous transform', () => {
    const { state, ctx } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 50, y: 50, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b], { id: state.document().root.id }),
    });
    const beforeA = a.transform;
    const beforeB = b.transform;

    const cmd = new TranslateManyCommand(
      new Map([
        [a.id, { x: 7, y: 11 }],
        [b.id, { x: -3, y: 4 }],
      ]),
    );
    cmd.execute(ctx);
    cmd.undo(ctx);

    expect(findNodeById(state.document().root, a.id)?.transform).toEqual(beforeA);
    expect(findNodeById(state.document().root, b.id)?.transform).toEqual(beforeB);
  });

  it('execute fails atomically when ANY id is missing (no partial apply)', () => {
    const { state, ctx } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a], { id: state.document().root.id }),
    });
    const beforeA = a.transform;

    const cmd = new TranslateManyCommand(
      new Map([
        [a.id, { x: 99, y: 99 }],
        [generateNodeId(), { x: 0, y: 0 }], // bogus
      ]),
    );
    const r = cmd.execute(ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/);
    // a was NOT moved
    expect(findNodeById(state.document().root, a.id)?.transform).toEqual(beforeA);
  });

  it('empty deltas map = no-op success', () => {
    const { state, ctx } = setup();
    const before = state.document();
    const cmd = new TranslateManyCommand(new Map());
    expect(cmd.execute(ctx).ok).toBe(true);
    expect(state.document()).toBe(before);
    expect(cmd.undo(ctx).ok).toBe(true);
  });

  it('rejects non-finite deltas at construction', () => {
    const id = generateNodeId();
    expect(() => new TranslateManyCommand(new Map([[id, { x: Number.NaN, y: 0 }]]))).toThrow();
    expect(
      () => new TranslateManyCommand(new Map([[id, { x: 0, y: Number.POSITIVE_INFINITY }]])),
    ).toThrow();
  });

  it('undo without execute returns fail', () => {
    const { ctx } = setup();
    const cmd = new TranslateManyCommand(new Map());
    // Even though execute would succeed (empty), undo without it errors:
    const r = cmd.undo(ctx);
    expect(r.ok).toBe(false);
  });

  it('uses a custom label when provided', () => {
    const cmd = new TranslateManyCommand(new Map(), 'Align left');
    expect(cmd.label).toBe('Align left');
  });

  it('default label is "Translate many"', () => {
    const cmd = new TranslateManyCommand(new Map());
    expect(cmd.label).toBe('Translate many');
  });
});
