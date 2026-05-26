import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CommandBus } from '../command-bus/command-bus.service';
import { createEllipse, createGroup, createPath, createRect } from '../model/node-factory';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import type { SvgDocument } from '../document/svg-document';
import type { NodeId } from '../types/node-id';
import { KnifeCutPathCommand } from './knife-cut.command';

/**
 * **KNIFE-FIX** specs — verify the command:
 * 1. Cuts an open path into 2 separate PathNodes.
 * 2. Cuts a closed path into 1 open path.
 * 3. Auto-handles rect (non-path) by synthesising d.
 * 4. Fails when click is outside tolerance.
 * 5. Undo restores the original node at the original z-order.
 */

function setup() {
  TestBed.configureTestingModule({});
  return {
    state: TestBed.inject(EditorStateService),
    bus: TestBed.inject(CommandBus),
  };
}

function seedDoc(children: ReturnType<typeof createPath>[]): NodeId {
  const { state } = setup();
  const root = createGroup(children, { id: 'root' as NodeId });
  const doc: SvgDocument = {
    id: 'd' as NodeId,
    viewBox: { x: 0, y: 0, width: 200, height: 200 },
    root,
  };
  state.resetDocument(doc);
  return root.id;
}

describe('KNIFE-FIX — KnifeCutPathCommand', () => {
  it('cuts an open path into 2 separate PathNodes', () => {
    const path = createPath('M0 0 L100 0');
    seedDoc([path]);
    const state = TestBed.inject(EditorStateService);
    const bus = TestBed.inject(CommandBus);

    const cmd = new KnifeCutPathCommand(path.id, { x: 50, y: 0 }, 12, false);
    const result = bus.dispatch(cmd);

    expect(result.ok).toBe(true);
    // Original is gone; 2 new pieces took its place.
    expect(findNodeById(state.document().root, path.id)).toBeNull();
    expect(cmd.createdIds.length).toBe(2);
    const root = state.document().root as { children: readonly { id: NodeId }[] };
    expect(root.children.length).toBe(2);
    // Both pieces resolve.
    for (const id of cmd.createdIds) {
      expect(findNodeById(state.document().root, id)).not.toBeNull();
    }
  });

  it('cuts a closed path into 1 open path', () => {
    const closed = createPath('M0 0 L100 0 L100 100 L0 100 Z');
    seedDoc([closed]);
    const state = TestBed.inject(EditorStateService);
    const bus = TestBed.inject(CommandBus);

    const cmd = new KnifeCutPathCommand(closed.id, { x: 50, y: 0 }, 12, false);
    const result = bus.dispatch(cmd);

    expect(result.ok).toBe(true);
    expect(cmd.createdIds.length).toBe(1); // closed → 1 open
    const piece = findNodeById(state.document().root, cmd.createdIds[0]!);
    expect(piece).not.toBeNull();
    expect((piece as { type: string }).type).toBe('path');
    // The new path must NOT end with Z (it's open now).
    expect((piece as { d: string }).d.trim().endsWith('Z')).toBe(false);
  });

  it('auto-cuts a rect (synthesises path d via nodeToPathD)', () => {
    const rect = createRect({ x: 0, y: 0, width: 100, height: 50 });
    seedDoc([rect as unknown as ReturnType<typeof createPath>]);
    const state = TestBed.inject(EditorStateService);
    const bus = TestBed.inject(CommandBus);

    // Click on the top edge mid-point (x=50, y=0).
    const cmd = new KnifeCutPathCommand(rect.id, { x: 50, y: 0 }, 12, false);
    const result = bus.dispatch(cmd);

    expect(result.ok).toBe(true);
    // Original rect is gone — replaced by the resulting open path
    // (rect was closed, so 1 piece).
    expect(findNodeById(state.document().root, rect.id)).toBeNull();
    expect(cmd.createdIds.length).toBe(1);
    const piece = findNodeById(state.document().root, cmd.createdIds[0]!);
    expect((piece as { type: string }).type).toBe('path');
  });

  it('auto-cuts an ellipse', () => {
    const e = createEllipse({ cx: 50, cy: 50, rx: 40, ry: 30 });
    seedDoc([e as unknown as ReturnType<typeof createPath>]);
    const bus = TestBed.inject(CommandBus);
    // Click on the topmost point of the ellipse (cx, cy - ry) = (50, 20).
    const cmd = new KnifeCutPathCommand(e.id, { x: 50, y: 20 }, 12, false);
    const result = bus.dispatch(cmd);
    expect(result.ok).toBe(true);
  });

  it('fails when click is outside tolerance', () => {
    const path = createPath('M0 0 L100 0');
    seedDoc([path]);
    const bus = TestBed.inject(CommandBus);

    // Click 50px above the line — well outside the default 12px tolerance.
    const cmd = new KnifeCutPathCommand(path.id, { x: 50, y: 50 }, 12, false);
    const result = bus.dispatch(cmd);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no segment within');
    }
  });

  it('undo restores the original node at the original z-order', () => {
    const a = createPath('M0 0 L10 0');
    const target = createPath('M0 0 L100 0');
    const b = createPath('M0 0 L20 0');
    seedDoc([a, target, b]); // target is at index 1
    const state = TestBed.inject(EditorStateService);
    const bus = TestBed.inject(CommandBus);

    bus.dispatch(new KnifeCutPathCommand(target.id, { x: 50, y: 0 }, 12, false));
    const root = state.document().root as { children: readonly { id: NodeId }[] };
    // After cut: 4 nodes (a + 2 pieces + b).
    expect(root.children.length).toBe(4);

    bus.undo();
    const restoredRoot = state.document().root as { children: readonly { id: NodeId }[] };
    expect(restoredRoot.children.length).toBe(3);
    expect(restoredRoot.children[0]!.id).toBe(a.id);
    expect(restoredRoot.children[1]!.id).toBe(target.id); // back at index 1
    expect(restoredRoot.children[2]!.id).toBe(b.id);
  });
});
