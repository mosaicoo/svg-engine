import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createGroup,
  createRect,
  EditorStateService,
  EnsureDefaultPageCommand,
  generateNodeId,
  getPageViewBox,
  isPage,
  type BoundingBox,
  type SvgDocument,
  type SvgNode,
  withPageFlag,
} from 'svg-engine/core';
import { describe, expect, it } from 'vitest';

/**
 * **D-115 — `File ▸ Open…` (SVG) page-wrap contract.**
 *
 * Open replaces the workspace with the file's content inside a `Page 1` sized
 * to the file's `viewBox`. The orchestration (`openSvgDocument` in
 * builtin-menu-contributions.plugin) is exactly `resetDocument(parsed)` +
 * `EnsureDefaultPageCommand`; these specs exercise that pair on a parsed
 * document fixture (the file-picker + confirm glue is DOM-bound and verified
 * manually). The key contract: the page is sized from the FILE (not the editor
 * default), and content positioned OUTSIDE the viewBox is retained so the
 * canvas keeps rendering it.
 */

const FILE_VB: BoundingBox = { x: 0, y: 0, width: 2147, height: 2147 };

function setup(): { state: EditorStateService; bus: CommandBus } {
  TestBed.configureTestingModule({});
  return { state: TestBed.inject(EditorStateService), bus: TestBed.inject(CommandBus) };
}

/** A parsed foreign SVG: a viewBox + loose content (no page flags). */
function parsedDoc(children: SvgNode[]): SvgDocument {
  return { id: generateNodeId(), viewBox: FILE_VB, root: createGroup(children) };
}

describe('D-115 — Open SVG page-wrap contract', () => {
  it('wraps the file content into a single Page 1 sized to the file viewBox', () => {
    const { state, bus } = setup();
    state.resetDocument(parsedDoc([createRect({ x: 100, y: 100, width: 50, height: 50 })]));
    bus.dispatch(new EnsureDefaultPageCommand());

    const root = state.document().root;
    expect(root.children.length).toBe(1);
    const page = root.children[0]!;
    expect(isPage(page)).toBe(true);
    // Page is sized from the FILE's viewBox — not the editor's default.
    expect(getPageViewBox(page)).toEqual(FILE_VB);
  });

  it('keeps content OUTSIDE the viewBox inside the page (canvas still renders it)', () => {
    const { state, bus } = setup();
    const inside = createRect({ x: 100, y: 100, width: 50, height: 50 });
    // x=3000 is well outside the 2147-wide viewBox — must still be retained.
    const outside = createRect({ x: 3000, y: 3000, width: 50, height: 50 });
    state.resetDocument(parsedDoc([inside, outside]));
    bus.dispatch(new EnsureDefaultPageCommand());

    const page = state.document().root.children[0]!;
    expect(page.type).toBe('group');
    if (page.type !== 'group') return;
    expect(page.children.length).toBe(2);
    expect(page.children.map((c) => c.id)).toEqual([inside.id, outside.id]);
  });

  it('does not double-wrap a document that already has pages (our own exports)', () => {
    const { state, bus } = setup();
    const page = withPageFlag(
      createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]),
      FILE_VB,
      'Page 1',
    );
    state.resetDocument({ id: generateNodeId(), viewBox: FILE_VB, root: createGroup([page]) });
    const before = state.document().root;
    bus.dispatch(new EnsureDefaultPageCommand());

    // No-op: a page already exists, so the root reference is untouched.
    expect(state.document().root).toBe(before);
  });
});
