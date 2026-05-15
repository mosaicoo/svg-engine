import { TestBed } from '@angular/core/testing';
import { createEmptyDocument } from '../document/document-factory';
import { createGroup, createRect } from '../model/node-factory';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import { generateNodeId } from '../types/node-id';
import { applyTransform, IDENTITY_TRANSFORM } from '../types/transform';
import { composeAnchoredScale, ResizeNodeCommand } from './resize-node.command';
import { composePivotRotation, RotateNodeCommand } from './rotate-node.command';

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  return { state, ctx: { state } };
}

describe('composePivotRotation (pure)', () => {
  it('rotating 90° around (10, 10) maps (20, 10) to (10, 20)', () => {
    const t = composePivotRotation(IDENTITY_TRANSFORM, Math.PI / 2, { x: 10, y: 10 });
    const p = applyTransform(t, 20, 10);
    expect(p.x).toBeCloseTo(10);
    expect(p.y).toBeCloseTo(20);
  });

  it('rotating around the pivot leaves the pivot itself fixed', () => {
    const pivot = { x: 50, y: 25 };
    const t = composePivotRotation(IDENTITY_TRANSFORM, Math.PI / 4, pivot);
    const p = applyTransform(t, pivot.x, pivot.y);
    expect(p.x).toBeCloseTo(pivot.x);
    expect(p.y).toBeCloseTo(pivot.y);
  });
});

describe('RotateNodeCommand', () => {
  it('execute rotates the node transform around the pivot', () => {
    const { state, ctx } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    const cmd = new RotateNodeCommand(rect.id, Math.PI / 2, { x: 0, y: 0 });
    expect(cmd.execute(ctx).ok).toBe(true);

    // After 90° rotation around origin, point (10, 0) → (0, 10)
    const moved = findNodeById(state.document().root, rect.id);
    expect(moved).not.toBeNull();
    const corner = applyTransform(moved!.transform, 10, 0);
    expect(corner.x).toBeCloseTo(0);
    expect(corner.y).toBeCloseTo(10);
  });

  it('undo restores the original transform', () => {
    const { state, ctx } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    const cmd = new RotateNodeCommand(rect.id, Math.PI / 4, { x: 5, y: 5 });
    cmd.execute(ctx);
    cmd.undo(ctx);

    const restored = findNodeById(state.document().root, rect.id);
    expect(restored?.transform).toEqual(rect.transform);
  });

  it('execute fails when node is missing', () => {
    const { ctx } = setup();
    const cmd = new RotateNodeCommand(generateNodeId(), Math.PI, { x: 0, y: 0 });
    const r = cmd.execute(ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/);
  });

  it('round-trip leaves transform unchanged', () => {
    const { state, ctx } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });
    const before = rect.transform;

    const cmd = new RotateNodeCommand(rect.id, 0.7, { x: 3, y: 4 });
    cmd.execute(ctx);
    cmd.undo(ctx);

    const restored = findNodeById(state.document().root, rect.id);
    expect(restored?.transform).toEqual(before);
  });
});

describe('composeAnchoredScale (pure)', () => {
  it('scaling 2× around (10, 10) keeps anchor fixed and doubles distance from it', () => {
    const t = composeAnchoredScale(IDENTITY_TRANSFORM, 2, 2, { x: 10, y: 10 });
    const fixed = applyTransform(t, 10, 10);
    expect(fixed.x).toBeCloseTo(10);
    expect(fixed.y).toBeCloseTo(10);

    // Point originally at distance 5 → now at distance 10
    const p = applyTransform(t, 15, 10);
    expect(p.x).toBeCloseTo(20);
    expect(p.y).toBeCloseTo(10);
  });

  it('scaling 0.5× around the origin halves coordinates', () => {
    const t = composeAnchoredScale(IDENTITY_TRANSFORM, 0.5, 0.5, { x: 0, y: 0 });
    const p = applyTransform(t, 100, 200);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(100);
  });
});

describe('ResizeNodeCommand', () => {
  it('execute scales the node around the anchor', () => {
    const { state, ctx } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    // Anchor at top-left (0,0), scale 2× horizontally
    const cmd = new ResizeNodeCommand(rect.id, { x: 0, y: 0 }, 2, 1);
    expect(cmd.execute(ctx).ok).toBe(true);

    const moved = findNodeById(state.document().root, rect.id);
    expect(moved).not.toBeNull();
    // (10, 5) should move to (20, 5); anchor stays
    const stretched = applyTransform(moved!.transform, 10, 5);
    expect(stretched.x).toBeCloseTo(20);
    expect(stretched.y).toBeCloseTo(5);
  });

  it('undo restores the original transform', () => {
    const { state, ctx } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    const cmd = new ResizeNodeCommand(rect.id, { x: 0, y: 0 }, 3, 0.5);
    cmd.execute(ctx);
    cmd.undo(ctx);

    const restored = findNodeById(state.document().root, rect.id);
    expect(restored?.transform).toEqual(rect.transform);
  });

  it('rejects non-finite scale factors at construction', () => {
    expect(
      () => new ResizeNodeCommand(generateNodeId(), { x: 0, y: 0 }, Number.POSITIVE_INFINITY, 1),
    ).toThrow();
    expect(() => new ResizeNodeCommand(generateNodeId(), { x: 0, y: 0 }, 1, Number.NaN)).toThrow();
  });

  it('execute fails when node is missing', () => {
    const { ctx } = setup();
    const cmd = new ResizeNodeCommand(generateNodeId(), { x: 0, y: 0 }, 2, 2);
    expect(cmd.execute(ctx).ok).toBe(false);
  });
});
