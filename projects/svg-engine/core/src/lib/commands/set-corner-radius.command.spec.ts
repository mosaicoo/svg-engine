import { TestBed } from '@angular/core/testing';
import { createEmptyDocument } from '../document/document-factory';
import { createGroup, createPath, createRect } from '../model/node-factory';
import type { PathNode } from '../model/path-node';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import type { NodeId } from '../types/node-id';
import { SetCornerRadiusCommand } from './set-corner-radius.command';

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  return { state, ctx: { state } };
}

/** Replace the root's children (helper for building selections). */
function setChildren(state: EditorStateService, children: readonly { id: NodeId }[]): void {
  const doc = state.document();
  state.setDocument({ ...doc, root: createGroup(children as never, { id: doc.root.id }) });
}

function cornerOf(state: EditorStateService, id: NodeId): number | undefined {
  const n = findNodeById(state.document().root, id) as PathNode | null;
  return n?.cornerRadius;
}

function hasCornerKey(state: EditorStateService, id: NodeId): boolean {
  const n = findNodeById(state.document().root, id);
  return n !== null && Object.prototype.hasOwnProperty.call(n, 'cornerRadius');
}

const SQUARE = 'M0 0 L100 0 L100 100 L0 100 Z';

describe('SetCornerRadiusCommand', () => {
  it('sets cornerRadius on a path', () => {
    const { state, ctx } = setup();
    const p = createPath(SQUARE);
    setChildren(state, [p]);
    const r = new SetCornerRadiusCommand([p.id], 12).execute(ctx);
    expect(r.ok).toBe(true);
    expect(cornerOf(state, p.id)).toBe(12);
  });

  it('clamps negative / non-finite radius to 0', () => {
    const { state, ctx } = setup();
    const p = createPath(SQUARE);
    setChildren(state, [p]);
    new SetCornerRadiusCommand([p.id], -5).execute(ctx);
    expect(cornerOf(state, p.id)).toBe(0);
    new SetCornerRadiusCommand([p.id], Number.NaN).execute(ctx);
    expect(cornerOf(state, p.id)).toBe(0);
  });

  it('skips non-path nodes (no-op on a rect-only selection)', () => {
    const { state, ctx } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    setChildren(state, [rect]);
    const before = state.document();
    const r = new SetCornerRadiusCommand([rect.id], 8).execute(ctx);
    expect(r.ok).toBe(true);
    // Document reference untouched — the rect gained no cornerRadius field.
    expect(state.document()).toBe(before);
    expect(hasCornerKey(state, rect.id)).toBe(false);
  });

  it('applies only to the path in a mixed selection', () => {
    const { state, ctx } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const p = createPath(SQUARE);
    setChildren(state, [rect, p]);
    new SetCornerRadiusCommand([rect.id, p.id], 7).execute(ctx);
    expect(cornerOf(state, p.id)).toBe(7);
    expect(hasCornerKey(state, rect.id)).toBe(false);
  });

  it('undo strips the field when it was absent before', () => {
    const { state, ctx } = setup();
    const p = createPath(SQUARE);
    setChildren(state, [p]);
    const cmd = new SetCornerRadiusCommand([p.id], 20);
    cmd.execute(ctx);
    expect(cornerOf(state, p.id)).toBe(20);
    cmd.undo(ctx);
    expect(hasCornerKey(state, p.id)).toBe(false);
  });

  it('undo restores a previous non-zero radius', () => {
    const { state, ctx } = setup();
    const p = { ...createPath(SQUARE), cornerRadius: 5 } as PathNode;
    setChildren(state, [p]);
    const cmd = new SetCornerRadiusCommand([p.id], 30);
    cmd.execute(ctx);
    expect(cornerOf(state, p.id)).toBe(30);
    cmd.undo(ctx);
    expect(cornerOf(state, p.id)).toBe(5);
  });

  it('empty ids is a no-op ok()', () => {
    const { ctx } = setup();
    const r = new SetCornerRadiusCommand([], 10).execute(ctx);
    expect(r.ok).toBe(true);
  });
});
