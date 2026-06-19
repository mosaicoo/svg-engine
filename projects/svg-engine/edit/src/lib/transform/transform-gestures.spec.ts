import { TestBed } from '@angular/core/testing';
import {
  applyTransform,
  bbox,
  CommandBus,
  createEmptyDocument,
  createGroup,
  createRect,
  EditorStateService,
  findNodeById,
  HistoryService,
  IDENTITY_TRANSFORM,
  rotate,
} from 'svg-engine/core';
import { LayersService } from '../layers/layers.service';
import { TransformService } from './transform.service';

function setup() {
  TestBed.configureTestingModule({});
  const transform = TestBed.inject(TransformService);
  const state = TestBed.inject(EditorStateService);
  const history = TestBed.inject(HistoryService);
  const bus = TestBed.inject(CommandBus);
  const layers = TestBed.inject(LayersService);
  state.resetDocument(createEmptyDocument());
  history.clear();
  transform.clearAllPivots();
  transform.cancelGesture(); // ensure clean
  layers.unlockAll();
  return { transform, state, history, bus, layers };
}

describe('TransformService — move gesture', () => {
  it('startMove + endMove (no drag) is a no-op (no command dispatched)', () => {
    const { transform, state, history } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    transform.startMove(rect.id, { x: 0, y: 0 });
    transform.endMove();

    expect(history.canUndo()).toBe(false);
    const r = findNodeById(state.document().root, rect.id);
    expect(r?.transform).toEqual(rect.transform);
  });

  it('updateMove previews translation; endMove commits via MoveNodeCommand (one undo entry)', () => {
    const { transform, state, history } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    transform.startMove(rect.id, { x: 0, y: 0 });
    // Multiple intermediate updates — should NOT each push a command
    transform.updateMove({ x: 5, y: 0 });
    transform.updateMove({ x: 10, y: 5 });
    transform.updateMove({ x: 15, y: 10 });
    expect(history.canUndo()).toBe(false);
    expect(transform.isDragging()).toBe(true);

    transform.endMove();

    expect(transform.isDragging()).toBe(false);
    expect(history.canUndo()).toBe(true);
    expect(history.undoStack()).toHaveLength(1);

    const moved = findNodeById(state.document().root, rect.id);
    // Final transform should be translate(15, 10) * identity = [1,0,0,1,15,10]
    expect(moved?.transform).toEqual([1, 0, 0, 1, 15, 10]);
  });

  it('cancelGesture during move reverts to start without dispatching', () => {
    const { transform, state, history } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });
    const startTransform = rect.transform;

    transform.startMove(rect.id, { x: 0, y: 0 });
    transform.updateMove({ x: 100, y: 100 });
    transform.cancelGesture();

    expect(transform.isDragging()).toBe(false);
    expect(history.canUndo()).toBe(false);
    const r = findNodeById(state.document().root, rect.id);
    expect(r?.transform).toEqual(startTransform);
  });

  it('starting a second gesture while one is active is rejected', () => {
    const { transform, state } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const c = createRect({ x: 50, y: 50, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a, c], { id: state.document().root.id }),
    });

    transform.startMove(a.id, { x: 0, y: 0 });
    transform.startMove(c.id, { x: 0, y: 0 }); // ignored
    expect(transform.dragState()?.kind).toBe('move');
    expect((transform.dragState() as { nodeId: typeof a.id }).nodeId).toBe(a.id);
  });
});

describe('TransformService — group move gesture (multi-selection)', () => {
  /** Seed N rects as top-level children; return ctx + the created nodes. */
  function setupRects(count: number) {
    const ctx = setup();
    const rects = Array.from({ length: count }, (_, i) =>
      createRect({ x: i * 100, y: 0, width: 10, height: 10 }),
    );
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup(rects, { id: ctx.state.document().root.id }),
    });
    return { ...ctx, rects };
  }

  it('startMoveMany moves EVERY node by the same delta in one undo entry', () => {
    const { state, transform, history, rects } = setupRects(3);
    const [a, b, c] = rects;
    transform.startMoveMany([a!.id, b!.id, c!.id], { x: 0, y: 0 });
    transform.updateMove({ x: 10, y: 20 });
    transform.endMove();

    const r = (id: string) => findNodeById(state.document().root, id as never);
    expect(r(a!.id)?.transform).toEqual([1, 0, 0, 1, 10, 20]);
    expect(r(b!.id)?.transform).toEqual([1, 0, 0, 1, 10, 20]);
    expect(r(c!.id)?.transform).toEqual([1, 0, 0, 1, 10, 20]);
    // Exactly ONE undo entry covers the whole group.
    expect(history.undoStack()).toHaveLength(1);
  });

  it('undo restores ALL nodes in the group (single TranslateManyCommand)', () => {
    const { state, transform, history, bus, rects } = setupRects(2);
    const [a, b] = rects;
    transform.startMoveMany([a!.id, b!.id], { x: 0, y: 0 });
    transform.updateMove({ x: 30, y: -15 });
    transform.endMove();
    bus.undo(); // undo lives on CommandBus, not HistoryService

    const r = (id: string) => findNodeById(state.document().root, id as never);
    expect(r(a!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(r(b!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(history.canUndo()).toBe(false);
  });

  it('a negligible group drag dispatches no command (click without drag)', () => {
    const { state, transform, history, rects } = setupRects(2);
    const [a, b] = rects;
    transform.startMoveMany([a!.id, b!.id], { x: 0, y: 0 });
    transform.endMove(); // no updateMove → zero delta
    expect(history.canUndo()).toBe(false);
    // No dispatch → transforms unchanged. (Assert VALUES, not document
    // reference: the immutable revert can hand back a fresh doc object
    // even when nothing changed.)
    const r = (id: string) => findNodeById(state.document().root, id as never);
    expect(r(a!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(r(b!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('startMoveMany filters out locked nodes (locked stays put)', () => {
    const { state, transform, layers, rects } = setupRects(2);
    const [a, b] = rects;
    layers.setLocked(b!.id, true);
    transform.startMoveMany([a!.id, b!.id], { x: 0, y: 0 });
    transform.updateMove({ x: 10, y: 10 });
    transform.endMove();

    const r = (id: string) => findNodeById(state.document().root, id as never);
    expect(r(a!.id)?.transform).toEqual([1, 0, 0, 1, 10, 10]); // moved
    expect(r(b!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]); // locked → unchanged
  });

  it('startMoveMany with a single id delegates to the single-node path (no extraNodes)', () => {
    const { transform, rects } = setupRects(2);
    const [a] = rects;
    transform.startMoveMany([a!.id], { x: 0, y: 0 });
    const ds = transform.dragState();
    expect(ds?.kind).toBe('move');
    expect((ds as { nodeId: string }).nodeId).toBe(a!.id);
    // Single-node path → no extraNodes (behaves exactly like startMove).
    expect((ds as { extraNodes?: unknown }).extraNodes).toBeUndefined();
    transform.cancelGesture();
  });

  it('cancelGesture reverts EVERY node in a group move (Esc mid-drag)', () => {
    const { state, transform, history, rects } = setupRects(2);
    const [a, b] = rects;
    transform.startMoveMany([a!.id, b!.id], { x: 0, y: 0 });
    transform.updateMove({ x: 40, y: 40 }); // preview both
    transform.cancelGesture();

    const r = (id: string) => findNodeById(state.document().root, id as never);
    expect(r(a!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(r(b!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(history.canUndo()).toBe(false); // cancel never dispatches
  });
});

describe('TransformService — group resize gesture (multi-selection)', () => {
  /** Seed N rects as top-level children; return ctx + the created nodes. */
  function setupRects(count: number) {
    const ctx = setup();
    const rects = Array.from({ length: count }, (_, i) =>
      createRect({ x: i * 100, y: 0, width: 10, height: 10 }),
    );
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup(rects, { id: ctx.state.document().root.id }),
    });
    return { ...ctx, rects };
  }

  // Combined bbox covering rect[0] (x 0..10) .. rect[last] (x 100k..+10).
  const UNION = { x: 0, y: 0, width: 110, height: 10 };

  it('startResizeMany scales EVERY node by the shared anchored scale (one undo)', () => {
    const { state, transform, history, rects } = setupRects(2);
    const [a, b] = rects;
    transform.startResizeMany(
      [
        { id: a!.id, parentMatrix: null },
        { id: b!.id, parentMatrix: null },
      ],
      'br', // opposite anchor = tl = {0,0}
      UNION,
    );
    transform.updateResizeMany({ x: 220, y: 20 }); // sx=220/110=2, sy=20/10=2
    transform.endResizeMany();

    const r = (id: string) => findNodeById(state.document().root, id as never);
    expect(r(a!.id)?.transform).toEqual([2, 0, 0, 2, 0, 0]);
    expect(r(b!.id)?.transform).toEqual([2, 0, 0, 2, 0, 0]);
    expect(history.undoStack()).toHaveLength(1);
  });

  it('undo restores ALL nodes in the group', () => {
    const { state, transform, bus, rects } = setupRects(2);
    const [a, b] = rects;
    transform.startResizeMany(
      [
        { id: a!.id, parentMatrix: null },
        { id: b!.id, parentMatrix: null },
      ],
      'br',
      UNION,
    );
    transform.updateResizeMany({ x: 220, y: 20 });
    transform.endResizeMany();
    bus.undo();

    const r = (id: string) => findNodeById(state.document().root, id as never);
    expect(r(a!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(r(b!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('negligible scale (handle click, no drag) dispatches no command', () => {
    const { state, transform, history, rects } = setupRects(2);
    const [a, b] = rects;
    transform.startResizeMany(
      [
        { id: a!.id, parentMatrix: null },
        { id: b!.id, parentMatrix: null },
      ],
      'br',
      UNION,
    );
    transform.updateResizeMany({ x: 110, y: 10 }); // == handleStart → sx=sy=1
    transform.endResizeMany();
    expect(history.canUndo()).toBe(false);
    // No dispatch → transforms unchanged (assert VALUES, not doc ref).
    const r = (id: string) => findNodeById(state.document().root, id as never);
    expect(r(a!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(r(b!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('filters out locked nodes (locked stays put; the rest scale)', () => {
    const { state, transform, layers, rects } = setupRects(3);
    const [a, b, c] = rects;
    layers.setLocked(c!.id, true);
    transform.startResizeMany(
      [
        { id: a!.id, parentMatrix: null },
        { id: b!.id, parentMatrix: null },
        { id: c!.id, parentMatrix: null },
      ],
      'br',
      UNION,
    );
    transform.updateResizeMany({ x: 220, y: 20 });
    transform.endResizeMany();

    const r = (id: string) => findNodeById(state.document().root, id as never);
    expect(r(a!.id)?.transform).toEqual([2, 0, 0, 2, 0, 0]);
    expect(r(b!.id)?.transform).toEqual([2, 0, 0, 2, 0, 0]);
    expect(r(c!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]); // locked → unchanged
  });

  it('fewer than 2 movable entries → no gesture starts (single path owns it)', () => {
    const { transform, rects } = setupRects(2);
    const [a] = rects;
    transform.startResizeMany([{ id: a!.id, parentMatrix: null }], 'br', UNION);
    expect(transform.dragState()).toBeNull();
  });

  it('cancelGesture reverts EVERY node in a group resize (Esc mid-drag)', () => {
    const { state, transform, history, rects } = setupRects(2);
    const [a, b] = rects;
    transform.startResizeMany(
      [
        { id: a!.id, parentMatrix: null },
        { id: b!.id, parentMatrix: null },
      ],
      'br',
      UNION,
    );
    transform.updateResizeMany({ x: 300, y: 30 }); // preview both
    transform.cancelGesture();

    const r = (id: string) => findNodeById(state.document().root, id as never);
    expect(r(a!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(r(b!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(history.canUndo()).toBe(false);
  });
});

describe('TransformService — group rotate gesture (multi-selection)', () => {
  /** Seed N rects as top-level children; return ctx + the created nodes. */
  function setupRects(count: number) {
    const ctx = setup();
    const rects = Array.from({ length: count }, (_, i) =>
      createRect({ x: i * 100, y: 0, width: 10, height: 10 }),
    );
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup(rects, { id: ctx.state.document().root.id }),
    });
    return { ...ctx, rects };
  }

  /** Round each matrix slot to kill float noise (sin/cos). */
  function round6(t: readonly number[]): number[] {
    return t.map((n) => Math.round(n * 1e6) / 1e6);
  }

  const PIVOT = { x: 0, y: 0 };

  it('rotates EVERY node about the shared pivot by the same angle (one undo)', () => {
    const { state, transform, history, rects } = setupRects(2);
    const [a, b] = rects;
    transform.startRotateMany(
      [
        { id: a!.id, parentMatrix: null },
        { id: b!.id, parentMatrix: null },
      ],
      PIVOT,
      { x: 10, y: 0 }, // start bearing = 0°
    );
    transform.updateRotateMany({ x: 0, y: 10 }); // bearing = +90°
    transform.endRotateMany();

    const r = (id: string) => findNodeById(state.document().root, id as never);
    // 90° about origin: doc point (10,0) → (0,10). Verify via each node's
    // NEW transform applied to a doc-space probe point.
    const pa = applyTransform(r(a!.id)!.transform, 10, 0);
    expect(round6([pa.x, pa.y])).toEqual([0, 10]);
    const pb = applyTransform(r(b!.id)!.transform, 100, 0);
    expect(round6([pb.x, pb.y])).toEqual([0, 100]);
    expect(history.undoStack()).toHaveLength(1);
  });

  it('undo restores ALL nodes in the group', () => {
    const { state, transform, bus, rects } = setupRects(2);
    const [a, b] = rects;
    transform.startRotateMany(
      [
        { id: a!.id, parentMatrix: null },
        { id: b!.id, parentMatrix: null },
      ],
      { x: 25, y: 25 },
      { x: 50, y: 25 },
    );
    transform.updateRotateMany({ x: 25, y: 50 });
    transform.endRotateMany();
    bus.undo();

    const r = (id: string) => findNodeById(state.document().root, id as never);
    expect(r(a!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(r(b!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('negligible angle (handle click, no drag) dispatches no command', () => {
    const { state, transform, history, rects } = setupRects(2);
    const [a, b] = rects;
    transform.startRotateMany(
      [
        { id: a!.id, parentMatrix: null },
        { id: b!.id, parentMatrix: null },
      ],
      PIVOT,
      { x: 10, y: 0 },
    );
    transform.updateRotateMany({ x: 10, y: 0 }); // same bearing → 0°
    transform.endRotateMany();
    expect(history.canUndo()).toBe(false);
    const r = (id: string) => findNodeById(state.document().root, id as never);
    expect(r(a!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(r(b!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('filters out locked nodes (locked stays put; the rest rotate)', () => {
    const { state, transform, layers, rects } = setupRects(3);
    const [a, b, c] = rects;
    layers.setLocked(c!.id, true);
    transform.startRotateMany(
      [
        { id: a!.id, parentMatrix: null },
        { id: b!.id, parentMatrix: null },
        { id: c!.id, parentMatrix: null },
      ],
      PIVOT,
      { x: 10, y: 0 },
    );
    transform.updateRotateMany({ x: 0, y: 10 }); // +90°
    transform.endRotateMany();

    const r = (id: string) => findNodeById(state.document().root, id as never);
    const pa = applyTransform(r(a!.id)!.transform, 10, 0);
    expect(round6([pa.x, pa.y])).toEqual([0, 10]); // rotated
    expect(r(c!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]); // locked → unchanged
  });

  it('fewer than 2 movable entries → no gesture starts (single path owns it)', () => {
    const { transform, rects } = setupRects(2);
    const [a] = rects;
    transform.startRotateMany([{ id: a!.id, parentMatrix: null }], PIVOT, { x: 10, y: 0 });
    expect(transform.dragState()).toBeNull();
  });

  it('cancelGesture reverts EVERY node in a group rotate (Esc mid-drag)', () => {
    const { state, transform, history, rects } = setupRects(2);
    const [a, b] = rects;
    transform.startRotateMany(
      [
        { id: a!.id, parentMatrix: null },
        { id: b!.id, parentMatrix: null },
      ],
      PIVOT,
      { x: 10, y: 0 },
    );
    transform.updateRotateMany({ x: 0, y: 10 }); // preview both
    transform.cancelGesture();

    const r = (id: string) => findNodeById(state.document().root, id as never);
    expect(r(a!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(r(b!.id)?.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(history.canUndo()).toBe(false);
  });
});

describe('TransformService — rotate gesture', () => {
  it('endRotate commits via RotateNodeCommand and the angle equals atan2 difference', () => {
    const { transform, state, history } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    const pivot = { x: 5, y: 5 };
    // Pointer starts at angle 0 from pivot (to the right)
    transform.startRotate(rect.id, pivot, { x: 15, y: 5 });
    // Move to angle +π/2 (down in SVG screen coords = larger y)
    transform.updateRotate({ x: 5, y: 15 });
    transform.endRotate();

    expect(history.canUndo()).toBe(true);

    // After +π/2 rotation around (5,5), point (15, 5) maps to (5, 15)
    // (rotation by +90° in SVG y-down = visually clockwise)
    const moved = findNodeById(state.document().root, rect.id);
    const p = applyTransform(moved!.transform, 15, 5);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(15);
  });

  it('cancelGesture during rotate reverts (no command)', () => {
    const { transform, state, history } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    transform.startRotate(rect.id, { x: 0, y: 0 }, { x: 1, y: 0 });
    transform.updateRotate({ x: 0, y: 1 });
    transform.cancelGesture();

    expect(history.canUndo()).toBe(false);
    expect(findNodeById(state.document().root, rect.id)?.transform).toEqual(IDENTITY_TRANSFORM);
  });
});

describe('TransformService — resize gesture', () => {
  it('dragging the BR handle of a 100×100 box to (200,200) doubles the geometry with TL fixed (Bloco 4-R3 bake)', () => {
    const { transform, state, history } = setup();
    const rect = createRect({ x: 0, y: 0, width: 100, height: 100 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    const b = bbox(0, 0, 100, 100);
    transform.startResize(rect.id, 'br', b);
    transform.updateResize({ x: 200, y: 200 });
    transform.endResize();

    expect(history.canUndo()).toBe(true);

    const updated = findNodeById(state.document().root, rect.id) as typeof rect;
    // Bake path: geometry mutated, transform stays identity.
    // TL fixed at (0,0); BR now at (200,200) means width=200, height=200.
    expect(updated.x).toBe(0);
    expect(updated.y).toBe(0);
    expect(updated.width).toBe(200);
    expect(updated.height).toBe(200);
    expect(updated.transform).toEqual(IDENTITY_TRANSFORM);
  });

  it('edge handle TC scales only Y; X stays unchanged (Bloco 4-R3 bake)', () => {
    const { transform, state, history } = setup();
    const rect = createRect({ x: 0, y: 0, width: 100, height: 100 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    const b = bbox(0, 0, 100, 100);
    transform.startResize(rect.id, 'tc', b);
    // Move TC handle from (50,0) to (50,-50) — should make height 150 with BC fixed at (50,100)
    transform.updateResize({ x: 50, y: -50 });
    transform.endResize();

    expect(history.canUndo()).toBe(true);
    const updated = findNodeById(state.document().root, rect.id) as typeof rect;
    // X unchanged, width unchanged
    expect(updated.x).toBe(0);
    expect(updated.width).toBe(100);
    // Top-Y now at -50 (height 150, BC fixed at 100)
    expect(updated.y).toBe(-50);
    expect(updated.height).toBe(150);
    expect(updated.transform).toEqual(IDENTITY_TRANSFORM);
  });

  it('cancelGesture during resize reverts geometry AND transform (Bloco 4-IP)', () => {
    const { transform, state, history } = setup();
    const rect = createRect({ x: 0, y: 0, width: 100, height: 100 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    const b = bbox(0, 0, 100, 100);
    transform.startResize(rect.id, 'br', b);
    transform.updateResize({ x: 500, y: 500 });
    transform.cancelGesture();

    expect(history.canUndo()).toBe(false);
    const reverted = findNodeById(state.document().root, rect.id) as typeof rect;
    expect(reverted.transform).toEqual(IDENTITY_TRANSFORM);
    // Bloco 4-Inspector-Polish: geometry must be restored too (preview
    // may have baked width/height during drag)
    expect(reverted.width).toBe(100);
    expect(reverted.height).toBe(100);
    expect(reverted.x).toBe(0);
    expect(reverted.y).toBe(0);
  });

  it('updateResize bakes geometry IN REAL TIME for bakeable nodes (Bloco 4-IP)', () => {
    const { transform, state } = setup();
    const rect = createRect({ x: 0, y: 0, width: 100, height: 100 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    const b = bbox(0, 0, 100, 100);
    transform.startResize(rect.id, 'br', b);

    // Halfway through drag: pointer at (150, 150), should produce
    // width=150, height=150 in the LIVE state (not just at commit)
    transform.updateResize({ x: 150, y: 150 });
    const midDrag = findNodeById(state.document().root, rect.id) as typeof rect;
    expect(midDrag.width).toBe(150);
    expect(midDrag.height).toBe(150);
    expect(midDrag.transform).toEqual(IDENTITY_TRANSFORM); // no scale matrix

    // Move further: pointer at (200, 200), width should now be 200
    transform.updateResize({ x: 200, y: 200 });
    const final = findNodeById(state.document().root, rect.id) as typeof rect;
    expect(final.width).toBe(200);
    expect(final.height).toBe(200);

    // Commit — same end state, but now via dispatch
    transform.endResize();
    const after = findNodeById(state.document().root, rect.id) as typeof rect;
    expect(after.width).toBe(200);
    expect(after.height).toBe(200);
    expect(after.transform).toEqual(IDENTITY_TRANSFORM);
  });

  it('updateResize on rotated node falls back to scale-transform (Bloco 4-IP)', () => {
    const { transform, state } = setup();
    const rect = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const rotated = { ...rect, transform: rotate(Math.PI / 4) };
    state.setDocument({
      ...state.document(),
      root: createGroup([rotated], { id: state.document().root.id }),
    });

    const b = bbox(0, 0, 100, 100);
    transform.startResize(rotated.id, 'br', b);
    transform.updateResize({ x: 200, y: 200 });

    const midDrag = findNodeById(state.document().root, rotated.id) as typeof rect;
    // Rotated node can't be baked → geometry unchanged, transform composed
    expect(midDrag.width).toBe(100);
    expect(midDrag.height).toBe(100);
    expect(midDrag.transform).not.toEqual(rotated.transform);
  });
});

describe('TransformService — OBB resize gesture (single rotated node, D-141)', () => {
  /** Round each matrix slot to kill float noise (sin/cos). */
  function round6(t: readonly number[]): number[] {
    return t.map((n) => Math.round(n * 1e6) / 1e6);
  }

  /** Seed a single 100×100 rect rotated +90° about the origin. */
  function setupRotatedRect() {
    const ctx = setup();
    const rect = createRect({ x: 0, y: 0, width: 100, height: 100 });
    const rotated = { ...rect, transform: rotate(Math.PI / 2) }; // [0,1,-1,0,0,0]
    ctx.state.setDocument({
      ...ctx.state.document(),
      root: createGroup([rotated], { id: ctx.state.document().root.id }),
    });
    return { ...ctx, rect: rotated };
  }

  const LOCAL_BBOX = { x: 0, y: 0, width: 100, height: 100 };
  const MATRIX = rotate(Math.PI / 2); // node's full matrix (no ancestor transforms)

  it('startResizeObb seeds a resize-obb drag state for the rotated node', () => {
    const { transform, rect } = setupRotatedRect();
    transform.startResizeObb(rect.id, 'br', LOCAL_BBOX, MATRIX);
    const ds = transform.dragState();
    expect(ds?.kind).toBe('resize-obb');
    expect((ds as { nodeId: string }).nodeId).toBe(rect.id);
    transform.cancelGesture();
  });

  it('scales along the LOCAL axes while keeping the rotation (scale rides the transform, geometry untouched)', () => {
    const { transform, state, history, rect } = setupRotatedRect();
    transform.startResizeObb(rect.id, 'br', LOCAL_BBOX, MATRIX);
    // Local 'br' is (100,100); doubling means the cursor sits at local
    // (200,200), which in DOC space is rotate90·(200,200) = (-200, 200).
    transform.updateResizeObb({ x: -200, y: 200 });
    transform.endResizeObb();

    expect(history.undoStack()).toHaveLength(1);
    const updated = findNodeById(state.document().root, rect.id) as typeof rect;
    // Geometry stays 100×100 — the 2× scale composes onto the RIGHT of the
    // rotation: rotate90 · scale2 = [0,2,-2,0,0,0].
    expect(updated.width).toBe(100);
    expect(updated.height).toBe(100);
    expect(round6(updated.transform)).toEqual([0, 2, -2, 0, 0, 0]);
    // The local anchor 'tl' (0,0) is the fixed point: it maps to doc (0,0)
    // before and after; the dragged corner doubled its distance from it.
    const corner = applyTransform(updated.transform, 100, 100);
    expect(round6([corner.x, corner.y])).toEqual([-200, 200]);
  });

  it('previews live during the drag (transform updated before commit)', () => {
    const { transform, state, rect } = setupRotatedRect();
    transform.startResizeObb(rect.id, 'br', LOCAL_BBOX, MATRIX);
    transform.updateResizeObb({ x: -200, y: 200 });
    const midDrag = findNodeById(state.document().root, rect.id) as typeof rect;
    expect(round6(midDrag.transform)).toEqual([0, 2, -2, 0, 0, 0]);
    transform.cancelGesture();
  });

  it('negligible scale (handle click, no drag) dispatches no command', () => {
    const { transform, state, history, rect } = setupRotatedRect();
    transform.startResizeObb(rect.id, 'br', LOCAL_BBOX, MATRIX);
    // Cursor at local 'br' (100,100) → doc rotate90·(100,100) = (-100,100):
    // sx = sy = 1, so the commit is a no-op.
    transform.updateResizeObb({ x: -100, y: 100 });
    transform.endResizeObb();
    expect(history.canUndo()).toBe(false);
    expect(findNodeById(state.document().root, rect.id)?.transform).toEqual(rotate(Math.PI / 2));
  });

  it('cancelGesture reverts the preview to the starting rotation (no command)', () => {
    const { transform, state, history, rect } = setupRotatedRect();
    transform.startResizeObb(rect.id, 'br', LOCAL_BBOX, MATRIX);
    transform.updateResizeObb({ x: -500, y: 500 });
    transform.cancelGesture();
    expect(history.canUndo()).toBe(false);
    expect(findNodeById(state.document().root, rect.id)?.transform).toEqual(rotate(Math.PI / 2));
  });

  it('refuses a locked node (no drag state set)', () => {
    const { transform, layers, rect } = setupRotatedRect();
    layers.setLocked(rect.id, true);
    transform.startResizeObb(rect.id, 'br', LOCAL_BBOX, MATRIX);
    expect(transform.dragState()).toBeNull();
  });

  it('undo restores the pre-resize rotation', () => {
    const { transform, state, bus, rect } = setupRotatedRect();
    transform.startResizeObb(rect.id, 'br', LOCAL_BBOX, MATRIX);
    transform.updateResizeObb({ x: -200, y: 200 });
    transform.endResizeObb();
    bus.undo();
    expect(findNodeById(state.document().root, rect.id)?.transform).toEqual(rotate(Math.PI / 2));
  });
});

describe('TransformService — lock enforcement (Bloco 4b-Lock)', () => {
  it('startMove refuses a locked node (no drag state set)', () => {
    const { transform, state, layers } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });
    layers.setLocked(rect.id, true);

    transform.startMove(rect.id, { x: 0, y: 0 });
    expect(transform.dragState()).toBeNull();
    expect(transform.isDragging()).toBe(false);
  });

  it('startRotate refuses a locked node', () => {
    const { transform, state, layers } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });
    layers.setLocked(rect.id, true);

    transform.startRotate(rect.id, { x: 5, y: 5 }, { x: 10, y: 5 });
    expect(transform.dragState()).toBeNull();
  });

  it('startResize refuses a locked node', () => {
    const { transform, state, layers } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });
    layers.setLocked(rect.id, true);

    transform.startResize(rect.id, 'br', bbox(0, 0, 10, 10));
    expect(transform.dragState()).toBeNull();
  });

  it('unlocking restores normal gesture behavior', () => {
    const { transform, state, layers } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });
    layers.setLocked(rect.id, true);
    transform.startMove(rect.id, { x: 0, y: 0 });
    expect(transform.dragState()).toBeNull();

    layers.setLocked(rect.id, false);
    transform.startMove(rect.id, { x: 0, y: 0 });
    expect(transform.dragState()).not.toBeNull();
  });
});
