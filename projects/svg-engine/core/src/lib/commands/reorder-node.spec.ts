import { TestBed } from '@angular/core/testing';
import { CommandBus } from '../command-bus/command-bus.service';
import { createGroup, createRect } from '../model/node-factory';
import { EditorStateService } from '../state/editor-state.service';
import { ReorderNodeCommand } from './reorder-node.command';

function setup() {
  const state = TestBed.inject(EditorStateService);
  const bus = TestBed.inject(CommandBus);
  return { state, bus };
}

function seedThree() {
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

describe('ReorderNodeCommand — forward', () => {
  it('swaps with next sibling (move up 1 in array = forward in z-order)', () => {
    const { a, b, c } = seedThree();
    const { state, bus } = setup();
    bus.dispatch(new ReorderNodeCommand(b.id, 'forward'));
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([a.id, c.id, b.id]);
  });

  it('forward on last child is a no-op (ok, no mutation)', () => {
    const { a, b, c } = seedThree();
    const { state, bus } = setup();
    const before = state.document();
    const result = bus.dispatch(new ReorderNodeCommand(c.id, 'forward'));
    expect(result.ok).toBe(true);
    expect(state.document()).toBe(before); // same reference
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([a.id, b.id, c.id]);
  });
});

describe('ReorderNodeCommand — backward', () => {
  it('swaps with previous sibling', () => {
    const { a, b, c } = seedThree();
    const { state, bus } = setup();
    bus.dispatch(new ReorderNodeCommand(b.id, 'backward'));
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([b.id, a.id, c.id]);
  });

  it('backward on first child is a no-op', () => {
    const { a, b, c } = seedThree();
    const { state, bus } = setup();
    const before = state.document();
    const result = bus.dispatch(new ReorderNodeCommand(a.id, 'backward'));
    expect(result.ok).toBe(true);
    expect(state.document()).toBe(before);
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([a.id, b.id, c.id]);
  });
});

describe('ReorderNodeCommand — toFront / toBack', () => {
  it('toFront moves to the end', () => {
    const { a, b, c } = seedThree();
    const { state, bus } = setup();
    bus.dispatch(new ReorderNodeCommand(a.id, 'toFront'));
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([b.id, c.id, a.id]);
  });

  it('toBack moves to the start', () => {
    const { a, b, c } = seedThree();
    const { state, bus } = setup();
    bus.dispatch(new ReorderNodeCommand(c.id, 'toBack'));
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([c.id, a.id, b.id]);
  });

  it('toFront on already-last is no-op', () => {
    const { a, b, c } = seedThree();
    const { state, bus } = setup();
    const before = state.document();
    bus.dispatch(new ReorderNodeCommand(c.id, 'toFront'));
    expect(state.document()).toBe(before);
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([a.id, b.id, c.id]);
  });
});

describe('ReorderNodeCommand — failure modes', () => {
  it('fails when node id is not in the tree', () => {
    seedThree();
    const { bus } = setup();
    const result = bus.dispatch(
      new ReorderNodeCommand('missing' as unknown as import('../types/node-id').NodeId, 'forward'),
    );
    expect(result.ok).toBe(false);
  });

  it('fails when target is the document root (no parent)', () => {
    const { state, bus } = setup();
    const rootId = state.document().root.id;
    const result = bus.dispatch(new ReorderNodeCommand(rootId, 'forward'));
    expect(result.ok).toBe(false);
  });
});

describe('ReorderNodeCommand — undo restores original index', () => {
  it('forward → undo restores original middle position', () => {
    const { a, b, c } = seedThree();
    const { state, bus } = setup();
    bus.dispatch(new ReorderNodeCommand(b.id, 'forward'));
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([a.id, c.id, b.id]);
    bus.undo();
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([a.id, b.id, c.id]);
  });

  it('toFront → undo restores first position', () => {
    const { a, b, c } = seedThree();
    const { state, bus } = setup();
    bus.dispatch(new ReorderNodeCommand(a.id, 'toFront'));
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([b.id, c.id, a.id]);
    bus.undo();
    expect(state.document().root.children.map((ch) => ch.id)).toEqual([a.id, b.id, c.id]);
  });
});
