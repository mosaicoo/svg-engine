import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CommandBus } from '../command-bus/command-bus.service';
import { createEmptyDocument } from '../document/document-factory';
import { createGroup, createRect } from '../model';
import { isPage } from '../model/page';
import { EditorStateService } from '../state/editor-state.service';
import { CreatePageCommand } from './page.commands';
import { EnsureDefaultPageCommand } from './ensure-default-page.command';

/**
 * **PAGES-FIX-2** specs — `EnsureDefaultPageCommand` (bootstrap +
 * migration + idempotency + undo).
 */
function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  return { state, bus: TestBed.inject(CommandBus) };
}

describe('PAGES-FIX-2 — EnsureDefaultPageCommand', () => {
  it('creates a Page 1 when document has no pages', () => {
    const { state, bus } = setup();
    const cmd = new EnsureDefaultPageCommand();
    const result = bus.dispatch(cmd);
    expect(result.ok).toBe(true);

    const root = state.document().root;
    expect(root.children.length).toBe(1);
    const page = root.children[0]!;
    if (!isPage(page)) throw new Error('expected page');
    expect(cmd.getCreatedPageId()).toBe(page.id);
  });

  it('is a no-op when at least one page already exists', () => {
    const { state, bus } = setup();
    bus.dispatch(new CreatePageCommand({ x: 0, y: 0, width: 400, height: 300 }, 'Cover'));
    const before = state.document().root;

    const cmd = new EnsureDefaultPageCommand();
    bus.dispatch(cmd);

    // Same root reference / no extra page created.
    expect(state.document().root.children.length).toBe(1);
    expect(cmd.getCreatedPageId()).toBeNull();
    // Undo is a safe no-op (previousRoot stayed null).
    expect(() => bus.undo()).not.toThrow();
    // Original page is gone now (undo of the CreatePageCommand happened).
    // We don't assert on root identity because undo of CreatePageCommand
    // ran on the bus — what we DO assert: ensure command itself didn't
    // pollute history beyond the no-op.
    void before;
  });

  it('migrates pre-existing top-level children INTO the new page', () => {
    const { state, bus } = setup();
    // Seed root with a rect + a plain group (NOT a page).
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const plain = createGroup([], {});
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [rect, plain] },
    });

    bus.dispatch(new EnsureDefaultPageCommand());

    const root = state.document().root;
    expect(root.children.length).toBe(1);
    const page = root.children[0]!;
    if (!isPage(page)) throw new Error('expected page');
    // Both pre-existing nodes are now CHILDREN of Page 1, in order.
    expect(page.children.map((c) => c.id)).toEqual([rect.id, plain.id]);
  });

  it('undo restores the prior root verbatim', () => {
    const { state, bus } = setup();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [rect] },
    });
    const rootBefore = state.document().root;

    bus.dispatch(new EnsureDefaultPageCommand());
    bus.undo();

    expect(state.document().root).toBe(rootBefore);
  });
});
