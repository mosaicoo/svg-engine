import { TestBed } from '@angular/core/testing';
import { CommandBus } from '../command-bus/command-bus.service';
import { createEllipse, createGroup, createRect } from '../model/node-factory';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import { type NodeId } from '../types/node-id';
import { IDENTITY_TRANSFORM, translate } from '../types/transform';
import { GroupSelectionCommand } from './group-selection.command';
import { UngroupCommand } from './ungroup.command';

function setup() {
  const state = TestBed.inject(EditorStateService);
  const bus = TestBed.inject(CommandBus);
  return { state, bus };
}

function seedRoot(nodes: ReturnType<typeof createRect>[]): NodeId {
  const { state } = setup();
  const newRoot = createGroup(nodes, { id: state.document().root.id });
  state.setDocument({ ...state.document(), root: newRoot });
  return newRoot.id;
}

describe('GroupSelectionCommand', () => {
  it('wraps the selected children into a new group at the topmost child position', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const c = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const rootId = seedRoot([a, b, c]);
    const { state, bus } = setup();

    // Group b + c (indexes 1 + 2); topmost selected = b at idx 1
    bus.dispatch(new GroupSelectionCommand([b.id, c.id]));

    const root = state.document().root;
    expect(root.children.length).toBe(2); // a + new group
    expect(root.children[0]?.id).toBe(a.id);
    const grp = root.children[1];
    expect(grp?.type).toBe('group');
    expect((grp as { children: readonly { id: string }[] }).children.map((ch) => ch.id)).toEqual([
      b.id,
      c.id,
    ]);
    expect(grp?.transform).toEqual(IDENTITY_TRANSFORM);
    // Parent containing the group is the document root
    expect(state.document().root.id).toBe(rootId);
  });

  it('children appear inside the group in PARENT-order, not selection-order', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const c = createRect({ x: 0, y: 0, width: 10, height: 10 });
    seedRoot([a, b, c]);
    const { state, bus } = setup();
    // Selection order is reversed (c, a) — group should still produce [a, c]
    bus.dispatch(new GroupSelectionCommand([c.id, a.id]));
    const root = state.document().root;
    const grp = root.children.find((ch) => ch.type === 'group');
    expect((grp as { children: readonly { id: string }[] }).children.map((ch) => ch.id)).toEqual([
      a.id,
      c.id,
    ]);
  });

  it('inserts the new group at the topmost child position (preserves stacking)', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const c = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const d = createRect({ x: 0, y: 0, width: 10, height: 10 });
    seedRoot([a, b, c, d]);
    const { state, bus } = setup();
    // Group b + d (idx 1 + 3); topmost = b at idx 1, so new group goes at idx 1
    bus.dispatch(new GroupSelectionCommand([b.id, d.id]));
    const root = state.document().root;
    // a, GROUP, c (b and d are inside the group)
    expect(root.children.map((ch) => ch.type)).toEqual(['rect', 'group', 'rect']);
    expect(root.children[0]?.id).toBe(a.id);
    expect(root.children[2]?.id).toBe(c.id);
  });

  it('fails when selectedIds is empty', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    seedRoot([a]);
    const { bus } = setup();
    const res = bus.dispatch(new GroupSelectionCommand([]));
    expect(res.ok).toBe(false);
  });

  it('fails when nodes have different parents', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const inner = createGroup([b]);
    seedRoot([a, inner] as ReturnType<typeof createRect>[]);
    const { bus } = setup();
    const res = bus.dispatch(new GroupSelectionCommand([a.id, b.id]));
    expect(res.ok).toBe(false);
  });

  it('undo restores the original parent layout exactly', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const c = createRect({ x: 0, y: 0, width: 10, height: 10 });
    seedRoot([a, b, c]);
    const { state, bus } = setup();
    const before = state.document().root;
    bus.dispatch(new GroupSelectionCommand([a.id, c.id]));
    expect(state.document().root.children.length).toBe(2);
    bus.undo();
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([a.id, b.id, c.id]);
    // structural equality
    expect(state.document().root.children.map((ch) => ch.type)).toEqual(
      before.children.map((ch) => ch.type),
    );
  });

  it('single-node selection wraps that node alone in a new group', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    seedRoot([a]);
    const { state, bus } = setup();
    bus.dispatch(new GroupSelectionCommand([a.id]));
    const root = state.document().root;
    expect(root.children.length).toBe(1);
    expect(root.children[0]?.type).toBe('group');
    expect((root.children[0] as { children: readonly { id: string }[] }).children).toHaveLength(1);
  });
});

describe('UngroupCommand', () => {
  it('promotes children to the grand-parent at the original group index', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const inner = createGroup(
      [
        createRect({ x: 0, y: 0, width: 10, height: 10 }),
        createEllipse({ cx: 5, cy: 5, rx: 5, ry: 5 }),
      ],
      {},
    );
    const c = createRect({ x: 0, y: 0, width: 10, height: 10 });
    seedRoot([a, inner as unknown as ReturnType<typeof createRect>, c]);
    const { state, bus } = setup();
    const innerChildren = (
      state.document().root.children[1] as { children: readonly { id: string }[] }
    ).children;
    bus.dispatch(new UngroupCommand(inner.id));
    const root = state.document().root;
    expect(root.children.map((ch) => ch.id)).toEqual([
      a.id,
      innerChildren[0]!.id,
      innerChildren[1]!.id,
      c.id,
    ]);
  });

  it('fails when target is not a group', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    seedRoot([a]);
    const { bus } = setup();
    const res = bus.dispatch(new UngroupCommand(a.id));
    expect(res.ok).toBe(false);
  });

  it('fails when target is the document root (no parent)', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const { state, bus } = setup();
    const newRoot = createGroup([a], { id: state.document().root.id });
    state.setDocument({ ...state.document(), root: newRoot });
    const res = bus.dispatch(new UngroupCommand(newRoot.id));
    expect(res.ok).toBe(false);
  });

  it('undo restores the original group at its original index', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const grp = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })], {
      transform: translate(5, 5),
    });
    const c = createRect({ x: 0, y: 0, width: 10, height: 10 });
    seedRoot([a, grp as unknown as ReturnType<typeof createRect>, c]);
    const { state, bus } = setup();
    bus.dispatch(new UngroupCommand(grp.id));
    expect(state.document().root.children.length).toBe(3); // a + (1 ex-child) + c
    bus.undo();
    expect(state.document().root.children.length).toBe(3); // a + grp + c
    const restored = findNodeById(state.document().root, grp.id);
    expect(restored).not.toBeNull();
    expect(restored?.transform).toEqual(translate(5, 5));
  });
});
