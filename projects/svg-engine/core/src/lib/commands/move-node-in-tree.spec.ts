import { TestBed } from '@angular/core/testing';
import { CommandBus } from '../command-bus/command-bus.service';
import { createEllipse, createGroup, createRect } from '../model/node-factory';
import { EditorStateService } from '../state/editor-state.service';
import { type NodeId } from '../types/node-id';
import { MoveNodeInTreeCommand } from './move-node-in-tree.command';

function setup() {
  const state = TestBed.inject(EditorStateService);
  const bus = TestBed.inject(CommandBus);
  return { state, bus };
}

describe('MoveNodeInTreeCommand — same parent reorder', () => {
  function seed3() {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const c = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const { state } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b, c], { id: state.document().root.id }),
    });
    return { a, b, c };
  }

  it('move first to last (a→2): children become [b, c, a]', () => {
    const { a, b, c } = seed3();
    const { state, bus } = setup();
    bus.dispatch(new MoveNodeInTreeCommand(a.id, state.document().root.id, 2));
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([b.id, c.id, a.id]);
  });

  it('move last to first (c→0): children become [c, a, b]', () => {
    const { a, b, c } = seed3();
    const { state, bus } = setup();
    bus.dispatch(new MoveNodeInTreeCommand(c.id, state.document().root.id, 0));
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([c.id, a.id, b.id]);
  });

  it('move middle to first: [a, b, c] → [b, a, c]', () => {
    const { a, b, c } = seed3();
    const { state, bus } = setup();
    bus.dispatch(new MoveNodeInTreeCommand(b.id, state.document().root.id, 0));
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([b.id, a.id, c.id]);
  });

  it('no-op when same-parent + same-effective-position (returns ok, no mutation)', () => {
    const { a, b, c } = seed3();
    const { state, bus } = setup();
    const before = state.document();
    // Moving "a" to index 0 (where it already is) → no-op
    const r = bus.dispatch(new MoveNodeInTreeCommand(a.id, state.document().root.id, 0));
    expect(r.ok).toBe(true);
    expect(state.document()).toBe(before);
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([a.id, b.id, c.id]);
  });

  it('newIndex out of range is clamped (>=length → last position)', () => {
    const { a, b, c } = seed3();
    const { state, bus } = setup();
    bus.dispatch(new MoveNodeInTreeCommand(a.id, state.document().root.id, 999));
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([b.id, c.id, a.id]);
  });
});

describe('MoveNodeInTreeCommand — reparent', () => {
  function seedNested() {
    const inner1 = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const groupA = createGroup([inner1]);
    const loose = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const { state } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([groupA, loose] as unknown as ReturnType<typeof createRect>[], {
        id: state.document().root.id,
      }),
    });
    return { groupA, inner1, loose };
  }

  it('move loose rect INTO a group at index 0', () => {
    const { groupA, inner1, loose } = seedNested();
    const { state, bus } = setup();
    bus.dispatch(new MoveNodeInTreeCommand(loose.id, groupA.id, 0));
    const root = state.document().root;
    expect(root.children.length).toBe(1); // groupA only
    const updatedGroupA = root.children[0] as ReturnType<typeof createGroup>;
    expect(updatedGroupA.children.map((ch) => ch.id)).toEqual([loose.id, inner1.id]);
  });

  it('move inner rect OUT of group to root level (becomes sibling)', () => {
    const { groupA, inner1, loose } = seedNested();
    const { state, bus } = setup();
    bus.dispatch(new MoveNodeInTreeCommand(inner1.id, state.document().root.id, 1));
    const root = state.document().root;
    // root: [groupA (empty now), inner1, loose]  (index 1 between groupA and loose)
    expect(root.children.map((ch) => ch.id)).toEqual([groupA.id, inner1.id, loose.id]);
    const updatedGroupA = root.children[0] as ReturnType<typeof createGroup>;
    expect(updatedGroupA.children.length).toBe(0);
  });
});

describe('MoveNodeInTreeCommand — validation failures', () => {
  it('fails when nodeId is the document root', () => {
    const { state, bus } = setup();
    const r = bus.dispatch(
      new MoveNodeInTreeCommand(state.document().root.id, state.document().root.id, 0),
    );
    expect(r.ok).toBe(false);
  });

  it('fails when nodeId does not exist', () => {
    const { state, bus } = setup();
    const r = bus.dispatch(
      new MoveNodeInTreeCommand('missing' as unknown as NodeId, state.document().root.id, 0),
    );
    expect(r.ok).toBe(false);
  });

  it('fails when newParentId does not exist', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const { state, bus } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([a], { id: state.document().root.id }),
    });
    const r = bus.dispatch(new MoveNodeInTreeCommand(a.id, 'missing' as unknown as NodeId, 0));
    expect(r.ok).toBe(false);
  });

  it('fails when newParentId is not a group', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createEllipse({ cx: 0, cy: 0, rx: 5, ry: 5 });
    const { state, bus } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b], { id: state.document().root.id }),
    });
    const r = bus.dispatch(new MoveNodeInTreeCommand(a.id, b.id, 0));
    expect(r.ok).toBe(false);
  });

  it('fails when moving a group INTO itself', () => {
    const inner = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const groupA = createGroup([inner]);
    const { state, bus } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([groupA] as unknown as ReturnType<typeof createRect>[], {
        id: state.document().root.id,
      }),
    });
    const r = bus.dispatch(new MoveNodeInTreeCommand(groupA.id, groupA.id, 0));
    expect(r.ok).toBe(false);
  });

  it('fails when moving a group INTO its own descendant (cycle)', () => {
    const grandchild = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const inner = createGroup([grandchild]);
    const outer = createGroup([inner] as unknown as ReturnType<typeof createRect>[]);
    const { state, bus } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([outer] as unknown as ReturnType<typeof createRect>[], {
        id: state.document().root.id,
      }),
    });
    const r = bus.dispatch(new MoveNodeInTreeCommand(outer.id, inner.id, 0));
    expect(r.ok).toBe(false);
  });
});

describe('MoveNodeInTreeCommand — undo', () => {
  it('undo restores same-parent reorder', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const c = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const { state, bus } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([a, b, c], { id: state.document().root.id }),
    });
    bus.dispatch(new MoveNodeInTreeCommand(a.id, state.document().root.id, 2));
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([b.id, c.id, a.id]);
    bus.undo();
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([a.id, b.id, c.id]);
  });

  it('undo restores reparent (moves node back to original parent + index)', () => {
    const inner = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const groupA = createGroup([inner]);
    const loose = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const { state, bus } = setup();
    state.setDocument({
      ...state.document(),
      root: createGroup([groupA, loose] as unknown as ReturnType<typeof createRect>[], {
        id: state.document().root.id,
      }),
    });
    bus.dispatch(new MoveNodeInTreeCommand(loose.id, groupA.id, 0));
    // loose is now inside groupA
    const root1 = state.document().root;
    expect(root1.children.length).toBe(1);
    bus.undo();
    // loose back at root, after groupA
    const root2 = state.document().root;
    expect(root2.children.map((ch) => ch.id)).toEqual([groupA.id, loose.id]);
  });
});
