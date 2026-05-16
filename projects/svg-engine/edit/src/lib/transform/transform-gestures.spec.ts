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
  it('dragging the BR handle of a 100×100 box to (200,200) doubles the size with TL fixed', () => {
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

    const moved = findNodeById(state.document().root, rect.id);
    // TL (0,0) should remain fixed
    const tl = applyTransform(moved!.transform, 0, 0);
    expect(tl.x).toBeCloseTo(0);
    expect(tl.y).toBeCloseTo(0);
    // BR should now be at (200, 200)
    const br = applyTransform(moved!.transform, 100, 100);
    expect(br.x).toBeCloseTo(200);
    expect(br.y).toBeCloseTo(200);
  });

  it('edge handle TC scales only Y; X stays at 1', () => {
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
    const moved = findNodeById(state.document().root, rect.id);
    // X should be unchanged
    const tr = applyTransform(moved!.transform, 100, 100);
    expect(tr.x).toBeCloseTo(100);
    // Top-Y should now be at -50 (height 150, BC fixed at 100)
    const top = applyTransform(moved!.transform, 0, 0);
    expect(top.y).toBeCloseTo(-50);
  });

  it('cancelGesture during resize reverts', () => {
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
    expect(findNodeById(state.document().root, rect.id)?.transform).toEqual(IDENTITY_TRANSFORM);
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
