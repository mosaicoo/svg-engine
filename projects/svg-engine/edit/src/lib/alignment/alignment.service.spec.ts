import { TestBed } from '@angular/core/testing';
import {
  bbox,
  CommandBus,
  createEmptyDocument,
  createGroup,
  createRect,
  EditorStateService,
  findNodeById,
  HistoryService,
  applyTransform,
} from 'svg-engine/core';
import { AlignmentService } from './alignment.service';

function setup() {
  TestBed.configureTestingModule({});
  const align = TestBed.inject(AlignmentService);
  const state = TestBed.inject(EditorStateService);
  const history = TestBed.inject(HistoryService);
  const bus = TestBed.inject(CommandBus);
  state.resetDocument(createEmptyDocument());
  history.clear();
  return { align, state, history, bus };
}

describe('AlignmentService.align', () => {
  it('returns false (no dispatch) when fewer than 2 items', () => {
    const { align, history } = setup();
    expect(align.align([], 'left')).toBe(false);
    expect(align.align([{ id: 'x' as never, bbox: bbox(0, 0, 10, 10) }], 'left')).toBe(false);
    expect(history.canUndo()).toBe(false);
  });

  it('aligns left and dispatches one undoable command', () => {
    const { align, state, history } = setup();
    const a = createRect({ x: 10, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 50, y: 0, width: 20, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b], { id: state.document().root.id }),
    });

    const ok = align.align(
      [
        { id: a.id, bbox: bbox(10, 0, 10, 10) },
        { id: b.id, bbox: bbox(50, 0, 20, 10) },
      ],
      'left',
    );
    expect(ok).toBe(true);
    expect(history.canUndo()).toBe(true);

    // After align-left, b's transform should translate by -40 on x.
    const movedB = findNodeById(state.document().root, b.id);
    const p = applyTransform(movedB!.transform, 0, 0);
    expect(p.x).toBe(-40);
    expect(p.y).toBe(0);
  });

  it('returns false (no dispatch) when items are already aligned', () => {
    const { align, state, history } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 50, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b], { id: state.document().root.id }),
    });
    const ok = align.align(
      [
        { id: a.id, bbox: bbox(0, 0, 10, 10) },
        { id: b.id, bbox: bbox(0, 50, 10, 10) },
      ],
      'left',
    );
    expect(ok).toBe(false);
    expect(history.canUndo()).toBe(false);
  });

  it('undo restores the original positions', () => {
    const { align, state, bus } = setup();
    const a = createRect({ x: 10, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 50, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b], { id: state.document().root.id }),
    });
    const beforeB = findNodeById(state.document().root, b.id)!.transform;

    align.align(
      [
        { id: a.id, bbox: bbox(10, 0, 10, 10) },
        { id: b.id, bbox: bbox(50, 0, 10, 10) },
      ],
      'left',
    );
    bus.undo();
    expect(findNodeById(state.document().root, b.id)!.transform).toEqual(beforeB);
  });
});

describe('AlignmentService.alignToReference (align to page)', () => {
  it('aligns a single node to the page and dispatches one undoable command', () => {
    const { align, state, history } = setup();
    const a = createRect({ x: 100, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a], { id: state.document().root.id }),
    });

    // Page reference 800×600 at origin; align the lone node's left edge.
    const ok = align.alignToReference(
      [{ id: a.id, bbox: bbox(100, 0, 10, 10) }],
      'left',
      bbox(0, 0, 800, 600),
    );
    expect(ok).toBe(true);
    expect(history.canUndo()).toBe(true);

    // a.x = 100 → page left = 0 → translate -100 on x.
    const moved = findNodeById(state.document().root, a.id);
    const p = applyTransform(moved!.transform, 0, 0);
    expect(p.x).toBe(-100);
    expect(p.y).toBe(0);
  });

  it('returns false (no dispatch) when the node is already on the reference edge', () => {
    const { align, state, history } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a], { id: state.document().root.id }),
    });
    const ok = align.alignToReference(
      [{ id: a.id, bbox: bbox(0, 0, 10, 10) }],
      'left',
      bbox(0, 0, 800, 600),
    );
    expect(ok).toBe(false);
    expect(history.canUndo()).toBe(false);
  });
});

describe('AlignmentService.distribute', () => {
  it('returns false when fewer than 3 items', () => {
    const { align } = setup();
    expect(align.distribute([], 'horizontal')).toBe(false);
    expect(
      align.distribute(
        [
          { id: 'a' as never, bbox: bbox(0, 0, 10, 10) },
          { id: 'b' as never, bbox: bbox(20, 0, 10, 10) },
        ],
        'horizontal',
      ),
    ).toBe(false);
  });

  it('distributes 3 items horizontally and is undoable', () => {
    const { align, state, history } = setup();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 20, y: 0, width: 10, height: 10 });
    const c = createRect({ x: 100, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b, c], { id: state.document().root.id }),
    });

    const ok = align.distribute(
      [
        { id: a.id, bbox: bbox(0, 0, 10, 10) },
        { id: b.id, bbox: bbox(20, 0, 10, 10) },
        { id: c.id, bbox: bbox(100, 0, 10, 10) },
      ],
      'horizontal',
    );
    expect(ok).toBe(true);

    // b's center moves from 25 to 55 (midpoint between 5 and 105) → dx = 30
    const movedB = findNodeById(state.document().root, b.id);
    const p = applyTransform(movedB!.transform, 0, 0);
    expect(p.x).toBe(30);
    expect(p.y).toBe(0);
    expect(history.canUndo()).toBe(true);
  });
});
