import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CommandBus } from '../command-bus/command-bus.service';
import { EditorStateService } from '../state/editor-state.service';
import { createGroup, createPath } from '../model/node-factory';
import { parsePathToAnchors } from '../geometry';
import type { SvgDocument } from '../document/svg-document';
import type { PathNode } from '../model/path-node';
import type { SvgNode } from '../model/svg-node';
import type { NodeId } from '../types/node-id';
import { findNodeById } from '../tree/tree-ops';
import {
  CleanUpPathCommand,
  JoinPathsCommand,
  OffsetPathCommand,
  OutlineStrokeCommand,
  ReversePathCommand,
  SimplifyPathCommand,
  SplitPathCommand,
} from './path-ops.commands';

function setup(): { state: EditorStateService; bus: CommandBus } {
  TestBed.configureTestingModule({});
  return { state: TestBed.inject(EditorStateService), bus: TestBed.inject(CommandBus) };
}

function seed(state: EditorStateService, children: readonly SvgNode[]): void {
  const doc: SvgDocument = {
    id: 'd' as NodeId,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup(children, { id: 'root' as NodeId }),
  };
  state.resetDocument(doc);
}

function pathOf(state: EditorStateService, id: NodeId): PathNode {
  return findNodeById(state.document().root, id) as PathNode;
}

describe('D-090 — ReversePathCommand', () => {
  it('reverses the path and undo restores it', () => {
    const { state, bus } = setup();
    const p = createPath('M0 0 L10 0 L10 10');
    seed(state, [p]);
    const before = state.document().root;
    bus.dispatch(new ReversePathCommand([p.id]));
    const anchors = parsePathToAnchors(pathOf(state, p.id).d)[0]!.anchors;
    expect(anchors[0]!.point).toEqual({ x: 10, y: 10 });
    bus.undo();
    expect(state.document().root).toBe(before);
  });

  it('fails (tree unchanged) when no path is selected', () => {
    const { state, bus } = setup();
    seed(state, [createPath('M0 0 L10 0')]);
    const before = state.document().root;
    bus.dispatch(new ReversePathCommand(['nope' as NodeId]));
    expect(state.document().root).toBe(before);
  });
});

describe('D-090 — CleanUpPathCommand', () => {
  it('removes a duplicate point', () => {
    const { state, bus } = setup();
    const p = createPath('M0 0 L0 0 L10 0');
    seed(state, [p]);
    bus.dispatch(new CleanUpPathCommand([p.id]));
    expect(parsePathToAnchors(pathOf(state, p.id).d)[0]!.anchors.length).toBe(2);
  });

  it('fails when there is nothing to clean', () => {
    const { state, bus } = setup();
    const p = createPath('M0 0 L10 0 L10 10');
    seed(state, [p]);
    const before = state.document().root;
    bus.dispatch(new CleanUpPathCommand([p.id]));
    expect(state.document().root).toBe(before);
  });
});

describe('D-090 — SimplifyPathCommand', () => {
  it('drops collinear anchors', () => {
    const { state, bus } = setup();
    const p = createPath('M0 0 L5 0 L10 0');
    seed(state, [p]);
    bus.dispatch(new SimplifyPathCommand([p.id], 1));
    expect(parsePathToAnchors(pathOf(state, p.id).d)[0]!.anchors.length).toBe(2);
  });
});

describe('D-090 — OffsetPathCommand', () => {
  it('grows a closed square and undo restores it', () => {
    const { state, bus } = setup();
    const p = createPath('M0 0 L10 0 L10 10 L0 10 Z');
    seed(state, [p]);
    const before = state.document().root;
    bus.dispatch(new OffsetPathCommand([p.id], 3));
    const xs = parsePathToAnchors(pathOf(state, p.id).d)[0]!.anchors.map((a) => a.point.x);
    expect(Math.min(...xs)).toBeLessThan(0);
    bus.undo();
    expect(state.document().root).toBe(before);
  });
});

describe('D-090 — OutlineStrokeCommand', () => {
  it('converts stroke to fill and drops the stroke', () => {
    const { state, bus } = setup();
    const p: PathNode = {
      ...createPath('M0 0 L10 0'),
      style: { stroke: '#ff0000', strokeWidth: 4, fill: 'none' },
    };
    seed(state, [p]);
    bus.dispatch(new OutlineStrokeCommand([p.id]));
    const node = pathOf(state, p.id);
    expect(node.style.fill).toBe('#ff0000');
    expect(node.style.stroke).toBeUndefined();
    expect(node.style.strokeWidth).toBeUndefined();
    expect(node.d).not.toBe('M0 0 L10 0');
  });

  it('fails on a path with no stroke (tree unchanged)', () => {
    const { state, bus } = setup();
    const p: PathNode = { ...createPath('M0 0 L10 0'), style: { fill: '#000', stroke: 'none' } };
    seed(state, [p]);
    const before = state.document().root;
    bus.dispatch(new OutlineStrokeCommand([p.id]));
    expect(state.document().root).toBe(before);
  });
});

describe('D-090 — JoinPathsCommand', () => {
  it('closes a single open path', () => {
    const { state, bus } = setup();
    const p = createPath('M0 0 L10 0 L10 10');
    seed(state, [p]);
    bus.dispatch(new JoinPathsCommand([p.id]));
    expect(parsePathToAnchors(pathOf(state, p.id).d)[0]!.closed).toBe(true);
  });

  it('merges two paths into one node and undo restores both', () => {
    const { state, bus } = setup();
    const a = createPath('M0 0 L10 0');
    const b = createPath('M10 0 L10 10');
    seed(state, [a, b]);
    const before = state.document().root;
    bus.dispatch(new JoinPathsCommand([a.id, b.id]));
    expect(state.document().root.children.length).toBe(1);
    bus.undo();
    expect(state.document().root).toBe(before);
  });
});

describe('D-090 — SplitPathCommand', () => {
  it('splits a path into two nodes at the cut anchor', () => {
    const { state, bus } = setup();
    const p = createPath('M0 0 L10 0 L20 0');
    seed(state, [p]);
    const before = state.document().root;
    bus.dispatch(new SplitPathCommand(p.id, [{ subpathIndex: 0, anchorIndex: 1 }]));
    expect(state.document().root.children.length).toBe(2);
    bus.undo();
    expect(state.document().root).toBe(before);
  });

  it('fails when the cut does not separate anything', () => {
    const { state, bus } = setup();
    const p = createPath('M0 0 L10 0');
    seed(state, [p]);
    const before = state.document().root;
    bus.dispatch(new SplitPathCommand(p.id, [{ subpathIndex: 0, anchorIndex: 0 }]));
    expect(state.document().root).toBe(before);
  });
});
