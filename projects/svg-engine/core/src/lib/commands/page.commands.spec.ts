import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CommandBus } from '../command-bus/command-bus.service';
import { createEmptyDocument } from '../document/document-factory';
import { createGroup } from '../model';
import { getPageName, getPageViewBox, isPage, withPageFlag } from '../model/page';
import { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import type { NodeId } from '../types/node-id';
import {
  CreatePageCommand,
  DeletePageCommand,
  RenamePageCommand,
  ResizePageCommand,
} from './page.commands';

/**
 * **D-079** specs — page commands. Mirrors layer.commands.spec.ts in
 * pattern. Verifies the 4 commands + their undo paths.
 */

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  return { state, bus: TestBed.inject(CommandBus) };
}

const VB = { x: 0, y: 0, width: 800, height: 600 };

describe('D-079 — CreatePageCommand', () => {
  it('inserts a flagged group at the END of root.children', () => {
    const { state, bus } = setup();
    const cmd = new CreatePageCommand(VB, 'Cover');
    const result = bus.dispatch(cmd);
    expect(result.ok).toBe(true);

    const root = state.document().root;
    expect(root.children.length).toBe(1);
    const page = root.children[0]!;
    expect(isPage(page)).toBe(true);
    expect(getPageViewBox(page)).toEqual(VB);
    expect(getPageName(page)).toBe('Cover');
    expect(cmd.getCreatedPageId()).toBe(page.id);
  });

  it('default name "Page N" matches existing page count + 1', () => {
    const { state, bus } = setup();
    bus.dispatch(new CreatePageCommand(VB)); // Page 1
    bus.dispatch(new CreatePageCommand(VB)); // Page 2
    bus.dispatch(new CreatePageCommand(VB)); // Page 3
    const names = state.document().root.children.map((c) => getPageName(c));
    expect(names).toEqual(['Page 1', 'Page 2', 'Page 3']);
  });

  it('undo removes the created page', () => {
    const { state, bus } = setup();
    const cmd = new CreatePageCommand(VB);
    bus.dispatch(cmd);
    expect(state.document().root.children.length).toBe(1);
    bus.undo();
    expect(state.document().root.children.length).toBe(0);
  });
});

describe('D-079 — DeletePageCommand', () => {
  it('removes the page from the root', () => {
    const { state, bus } = setup();
    const create = new CreatePageCommand(VB, 'Tmp');
    bus.dispatch(create);
    const id = create.getCreatedPageId()!;
    bus.dispatch(new DeletePageCommand(id));
    expect(findNodeById(state.document().root, id)).toBeNull();
  });

  it('fails when target is not a page', () => {
    const { state, bus } = setup();
    const plainGroup = createGroup([], {});
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [plainGroup] },
    });
    const result = bus.dispatch(new DeletePageCommand(plainGroup.id));
    expect(result.ok).toBe(false);
  });

  it('undo restores the deleted page', () => {
    const { state, bus } = setup();
    const create = new CreatePageCommand(VB, 'Recoverable');
    bus.dispatch(create);
    const id = create.getCreatedPageId()!;
    bus.dispatch(new DeletePageCommand(id));
    expect(state.document().root.children.length).toBe(0);
    bus.undo(); // undo Delete
    expect(state.document().root.children.length).toBe(1);
    const restored = findNodeById(state.document().root, id);
    expect(restored).not.toBeNull();
    expect(getPageName(restored!)).toBe('Recoverable');
  });
});

describe('D-079 — RenamePageCommand', () => {
  it('updates the display name', () => {
    const { state, bus } = setup();
    const create = new CreatePageCommand(VB, 'Old');
    bus.dispatch(create);
    const id = create.getCreatedPageId()!;
    bus.dispatch(new RenamePageCommand(id, 'New'));
    expect(getPageName(findNodeById(state.document().root, id)!)).toBe('New');
  });

  it('is a no-op (and no history entry) when name unchanged', () => {
    const { state, bus } = setup();
    const create = new CreatePageCommand(VB, 'Same');
    bus.dispatch(create);
    const docAfterCreate = state.document();
    bus.dispatch(new RenamePageCommand(create.getCreatedPageId()!, 'Same'));
    // Doc reference UNCHANGED — no command was effectively applied.
    expect(state.document()).toBe(docAfterCreate);
  });

  it('fails on non-page', () => {
    const { state, bus } = setup();
    const result = bus.dispatch(new RenamePageCommand(state.document().root.id, 'nope'));
    expect(result.ok).toBe(false);
  });
});

describe('D-079 — ResizePageCommand', () => {
  it('updates the viewBox', () => {
    const { state, bus } = setup();
    const create = new CreatePageCommand(VB);
    bus.dispatch(create);
    const id = create.getCreatedPageId()!;
    const newVB = { x: 5, y: 5, width: 1000, height: 800 };
    bus.dispatch(new ResizePageCommand(id, newVB));
    expect(getPageViewBox(findNodeById(state.document().root, id)!)).toEqual(newVB);
  });

  it('is a no-op when viewBox is structurally identical', () => {
    const { state, bus } = setup();
    const create = new CreatePageCommand(VB);
    bus.dispatch(create);
    const docAfterCreate = state.document();
    bus.dispatch(new ResizePageCommand(create.getCreatedPageId()!, { ...VB }));
    expect(state.document()).toBe(docAfterCreate);
  });

  it('undo restores the previous viewBox', () => {
    const { state, bus } = setup();
    const create = new CreatePageCommand(VB);
    bus.dispatch(create);
    const id = create.getCreatedPageId()!;
    bus.dispatch(new ResizePageCommand(id, { x: 0, y: 0, width: 100, height: 100 }));
    bus.undo();
    expect(getPageViewBox(findNodeById(state.document().root, id)!)).toEqual(VB);
  });
});

describe('D-079 — back-compat: documents without pages still work', () => {
  it('empty document has zero pages, root children unchanged', () => {
    const { state } = setup();
    const pageCount = state.document().root.children.filter((c) => isPage(c)).length;
    expect(pageCount).toBe(0);
  });

  it('mixed document with plain groups + pages — isPage filter works', () => {
    const { state } = setup();
    const plain = createGroup([], { metadata: { name: 'Plain' } });
    const page = withPageFlag(createGroup([], {}), VB, 'Cover');
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [plain, page] },
    });
    const ids: NodeId[] = state.document().root.children.map((c) => c.id);
    expect(ids.length).toBe(2);
    expect(isPage(state.document().root.children[0]!)).toBe(false);
    expect(isPage(state.document().root.children[1]!)).toBe(true);
  });
});
