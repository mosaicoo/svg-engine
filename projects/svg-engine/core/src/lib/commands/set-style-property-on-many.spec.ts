import { TestBed } from '@angular/core/testing';
import { CommandBus } from '../command-bus/command-bus.service';
import { createGroup, createRect } from '../model/node-factory';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import type { NodeId } from '../types/node-id';
import { SetStylePropertyOnManyCommand } from './set-style-property-on-many.command';

function setup() {
  const state = TestBed.inject(EditorStateService);
  const bus = TestBed.inject(CommandBus);
  return { state, bus };
}

function seedRects(n: number) {
  const { state } = setup();
  const rects = Array.from({ length: n }, (_, i) =>
    createRect(
      { x: i * 10, y: 0, width: 10, height: 10 },
      { style: { fill: '#000000', strokeWidth: 1 } },
    ),
  );
  state.setDocument({
    ...state.document(),
    root: createGroup(rects, { id: state.document().root.id }),
  });
  return rects;
}

describe('SetStylePropertyOnManyCommand', () => {
  it('applies the same fill to N nodes in one command', () => {
    const rects = seedRects(3);
    const { state, bus } = setup();
    const ids = rects.map((r) => r.id);
    bus.dispatch(new SetStylePropertyOnManyCommand(ids, 'fill', '#ff0000'));
    for (const r of rects) {
      expect(findNodeById(state.document().root, r.id)?.style.fill).toBe('#ff0000');
    }
  });

  it('preserves other style fields when overwriting one key', () => {
    const rects = seedRects(2);
    const { state, bus } = setup();
    bus.dispatch(
      new SetStylePropertyOnManyCommand(
        rects.map((r) => r.id),
        'fill',
        '#00ff00',
      ),
    );
    for (const r of rects) {
      const updated = findNodeById(state.document().root, r.id);
      expect(updated?.style.fill).toBe('#00ff00');
      expect(updated?.style.strokeWidth).toBe(1); // untouched
    }
  });

  it('numeric style value (opacity) works', () => {
    const rects = seedRects(2);
    const { state, bus } = setup();
    bus.dispatch(
      new SetStylePropertyOnManyCommand(
        rects.map((r) => r.id),
        'opacity',
        0.5,
      ),
    );
    for (const r of rects) {
      expect(findNodeById(state.document().root, r.id)?.style.opacity).toBe(0.5);
    }
  });

  it('empty nodeIds is a no-op success', () => {
    const { state, bus } = setup();
    const before = state.document();
    const result = bus.dispatch(new SetStylePropertyOnManyCommand([], 'fill', '#ff0000'));
    expect(result.ok).toBe(true);
    expect(state.document()).toBe(before);
  });

  it('fails atomically when any id is missing (no partial mutation)', () => {
    const rects = seedRects(3);
    const { state, bus } = setup();
    const before = state.document();
    const result = bus.dispatch(
      new SetStylePropertyOnManyCommand(
        [rects[0]!.id, 'missing' as unknown as NodeId, rects[2]!.id],
        'fill',
        '#ff0000',
      ),
    );
    expect(result.ok).toBe(false);
    expect(state.document()).toBe(before); // nothing changed
  });

  it('undo restores every node’s previous style (single undo entry)', () => {
    const rects = seedRects(3);
    const { state, bus } = setup();
    bus.dispatch(
      new SetStylePropertyOnManyCommand(
        rects.map((r) => r.id),
        'fill',
        '#ff0000',
      ),
    );
    // All nodes are red now.
    bus.undo();
    for (const r of rects) {
      expect(findNodeById(state.document().root, r.id)?.style.fill).toBe('#000000');
    }
  });

  it('produces exactly ONE undo entry (not N)', () => {
    const rects = seedRects(4);
    const { bus } = setup();
    const beforeCanUndo = bus.undo;
    // Dispatch a single multi-edit; subsequent single undo should fully revert.
    bus.dispatch(
      new SetStylePropertyOnManyCommand(
        rects.map((r) => r.id),
        'fill',
        '#abc',
      ),
    );
    const undo1 = bus.undo();
    expect(undo1.ok).toBe(true);
    const undo2 = bus.undo();
    // Second undo should hit "Nothing to undo" — proves single entry.
    expect(undo2.ok).toBe(false);
    void beforeCanUndo;
  });

  it('node deleted between execute and undo is silently skipped on undo', () => {
    const rects = seedRects(3);
    const { state, bus } = setup();
    const ids = rects.map((r) => r.id);
    bus.dispatch(new SetStylePropertyOnManyCommand(ids, 'fill', '#ff0000'));
    // Simulate external deletion of the 2nd rect — bypass history just for test setup.
    state.setDocument({
      ...state.document(),
      root: createGroup(
        state.document().root.children.filter((c) => c.id !== rects[1]!.id),
        { id: state.document().root.id },
      ),
    });
    // Undo should restore rect 0 and rect 2 to '#000000' without failing.
    const result = bus.undo();
    expect(result.ok).toBe(true);
    expect(findNodeById(state.document().root, rects[0]!.id)?.style.fill).toBe('#000000');
    expect(findNodeById(state.document().root, rects[2]!.id)?.style.fill).toBe('#000000');
  });
});
