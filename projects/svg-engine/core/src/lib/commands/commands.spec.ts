import { TestBed } from '@angular/core/testing';
import { createEmptyDocument } from '../document/document-factory';
import { createGroup, createRect } from '../model/node-factory';
import type { RectNode } from '../model/rect-node';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import { generateNodeId } from '../types/node-id';
import { InsertNodeCommand } from './insert-node.command';
import { MoveNodeCommand } from './move-node.command';
import { RemoveNodeCommand } from './remove-node.command';
import { SetPropertyCommand } from './set-property.command';

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  return { state, ctx: { state } };
}

describe('InsertNodeCommand', () => {
  it('execute inserts the node into the chosen parent', () => {
    const { state, ctx } = setup();
    const rect = createRect({ x: 0, y: 0, width: 5, height: 5 });
    const cmd = new InsertNodeCommand(state.document().root.id, rect);

    const r = cmd.execute(ctx);

    expect(r.ok).toBe(true);
    expect(state.document().root.children).toContain(rect);
  });

  it('execute fails when parent is missing', () => {
    const { ctx } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    const cmd = new InsertNodeCommand(generateNodeId(), rect);

    const r = cmd.execute(ctx);

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/);
  });

  it('undo removes the inserted node', () => {
    const { state, ctx } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    const cmd = new InsertNodeCommand(state.document().root.id, rect);

    cmd.execute(ctx);
    const r = cmd.undo(ctx);

    expect(r.ok).toBe(true);
    expect(state.document().root.children).toHaveLength(0);
  });

  it('round-trip preserves document equality', () => {
    const { state, ctx } = setup();
    const before = state.document();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    const cmd = new InsertNodeCommand(before.root.id, rect);

    cmd.execute(ctx);
    cmd.undo(ctx);

    // Same root identity is not guaranteed, but children should match
    expect(state.document().root.children).toEqual(before.root.children);
  });
});

describe('RemoveNodeCommand', () => {
  it('execute removes the node and undo restores it at the original position', () => {
    const { state, ctx } = setup();
    const r1 = createRect({ x: 0, y: 0, width: 1, height: 1 });
    const r2 = createRect({ x: 5, y: 5, width: 1, height: 1 });
    const r3 = createRect({ x: 10, y: 10, width: 1, height: 1 });
    state.setDocument({
      ...state.document(),
      root: createGroup([r1, r2, r3], { id: state.document().root.id }),
    });

    const cmd = new RemoveNodeCommand(r2.id);
    expect(cmd.execute(ctx).ok).toBe(true);
    expect(state.document().root.children.map((c) => c.id)).toEqual([r1.id, r3.id]);

    expect(cmd.undo(ctx).ok).toBe(true);
    expect(state.document().root.children.map((c) => c.id)).toEqual([r1.id, r2.id, r3.id]);
  });

  it('refuses to remove the root group', () => {
    const { state, ctx } = setup();
    const cmd = new RemoveNodeCommand(state.document().root.id);
    const r = cmd.execute(ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/root/);
  });

  it('undo without execute returns a failure', () => {
    const { ctx } = setup();
    const cmd = new RemoveNodeCommand(generateNodeId());
    const r = cmd.undo(ctx);
    expect(r.ok).toBe(false);
  });
});

describe('MoveNodeCommand', () => {
  it('execute composes a translation onto the existing transform', () => {
    const { state, ctx } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    const cmd = new MoveNodeCommand(rect.id, 10, 20);
    cmd.execute(ctx);

    const moved = findNodeById(state.document().root, rect.id);
    expect(moved?.transform).toEqual([1, 0, 0, 1, 10, 20]);
  });

  it('undo restores the original transform', () => {
    const { state, ctx } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    const cmd = new MoveNodeCommand(rect.id, 10, 20);
    cmd.execute(ctx);
    cmd.undo(ctx);

    const restored = findNodeById(state.document().root, rect.id);
    expect(restored?.transform).toEqual(rect.transform);
  });

  it('execute fails when node is missing', () => {
    const { ctx } = setup();
    const cmd = new MoveNodeCommand(generateNodeId(), 1, 1);
    expect(cmd.execute(ctx).ok).toBe(false);
  });
});

describe('SetPropertyCommand', () => {
  it('execute updates the property; undo restores it', () => {
    const { state, ctx } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    state.setDocument({
      ...state.document(),
      root: createGroup([rect], { id: state.document().root.id }),
    });

    const cmd = new SetPropertyCommand<RectNode, 'width'>(rect.id, 'width', 99);
    expect(cmd.execute(ctx).ok).toBe(true);

    const after = findNodeById(state.document().root, rect.id) as RectNode | null;
    expect(after?.width).toBe(99);

    expect(cmd.undo(ctx).ok).toBe(true);
    const restored = findNodeById(state.document().root, rect.id) as RectNode | null;
    expect(restored?.width).toBe(rect.width);
  });

  it('rejects mutations to id', () => {
    expect(
      () => new SetPropertyCommand<RectNode, 'id'>(generateNodeId(), 'id', generateNodeId()),
    ).toThrow(/reserved property/);
  });

  it('rejects mutations to type', () => {
    expect(
      () => new SetPropertyCommand<RectNode, 'type'>(generateNodeId(), 'type', 'rect'),
    ).toThrow(/reserved property/);
  });
});
