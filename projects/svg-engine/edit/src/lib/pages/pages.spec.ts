import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  CreatePageCommand,
  createEmptyDocument,
  createGroup,
  EditorStateService,
  isPage,
  type NodeId,
  withPageFlag,
} from 'svg-engine/core';
import { ActivePageService } from './active-page.service';
import { PagesService } from './pages.service';

/**
 * **D-079 / PAGES-B** specs — Pages services. Verifies:
 * - PagesService derives the list reactively from the document
 * - ActivePageService auto-selects first page when none chosen
 * - ActivePageService auto-recovers when active page gets deleted
 * - Both gracefully handle docs without any pages (back-compat)
 */

const VB = { x: 0, y: 0, width: 800, height: 600 };

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  return {
    state,
    bus: TestBed.inject(CommandBus),
    pages: TestBed.inject(PagesService),
    active: TestBed.inject(ActivePageService),
  };
}

describe('PAGES-B — PagesService derived list', () => {
  it('reports zero pages on a fresh empty document', () => {
    const { pages } = setup();
    expect(pages.count()).toBe(0);
    expect(pages.hasPages()).toBe(false);
    expect(pages.pages()).toEqual([]);
  });

  it('lists pages in z-order as they are created', () => {
    const { bus, pages } = setup();
    bus.dispatch(new CreatePageCommand(VB, 'A'));
    bus.dispatch(new CreatePageCommand(VB, 'B'));
    bus.dispatch(new CreatePageCommand(VB, 'C'));
    const names = pages.pages().map((p) => p.metadata.customData?.['svgePageName']);
    expect(names).toEqual(['A', 'B', 'C']);
  });

  it('filters out non-page children', () => {
    const { state, pages } = setup();
    const plain = createGroup([], { metadata: { name: 'Plain' } });
    const page = withPageFlag(createGroup([], {}), VB, 'Page');
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [plain, page] },
    });
    expect(pages.count()).toBe(1);
    expect(isPage(pages.pages()[0]!)).toBe(true);
  });

  it('byId returns the page node or null', () => {
    const { bus, pages } = setup();
    const cmd = new CreatePageCommand(VB);
    bus.dispatch(cmd);
    const id = cmd.getCreatedPageId()!;
    expect(pages.byId(id)?.id).toBe(id);
    expect(pages.byId('unknown' as NodeId)).toBeNull();
  });
});

describe('PAGES-B — ActivePageService auto-select + recovery', () => {
  it('starts with activePageId=null on empty document', () => {
    const { active } = setup();
    expect(active.activePageId()).toBeNull();
  });

  it('auto-selects the first page once one is created', () => {
    const { bus, active } = setup();
    const cmd = new CreatePageCommand(VB, 'First');
    bus.dispatch(cmd);
    TestBed.flushEffects();
    expect(active.activePageId()).toBe(cmd.getCreatedPageId());
  });

  it('keeps the user-chosen active page across creations', () => {
    const { bus, active } = setup();
    const a = new CreatePageCommand(VB, 'A');
    bus.dispatch(a);
    TestBed.flushEffects();
    const b = new CreatePageCommand(VB, 'B');
    bus.dispatch(b);
    TestBed.flushEffects();
    // First page should still be active (didn't get overridden)
    expect(active.activePageId()).toBe(a.getCreatedPageId());
    // User picks page B explicitly
    active.setActive(b.getCreatedPageId());
    expect(active.activePageId()).toBe(b.getCreatedPageId());
  });

  it('auto-recovers when the active page gets removed', () => {
    const { state, bus, active } = setup();
    const a = new CreatePageCommand(VB, 'A');
    bus.dispatch(a);
    const b = new CreatePageCommand(VB, 'B');
    bus.dispatch(b);
    TestBed.flushEffects();
    active.setActive(b.getCreatedPageId());
    expect(active.activePageId()).toBe(b.getCreatedPageId());
    // Remove page B from the document directly (simulating Delete cmd)
    state.setDocument({
      ...state.document(),
      root: {
        ...state.document().root,
        children: state.document().root.children.filter((c) => c.id !== b.getCreatedPageId()),
      },
    });
    TestBed.flushEffects();
    // Effect kicked in and re-picked the first remaining page (A).
    expect(active.activePageId()).toBe(a.getCreatedPageId());
  });

  it('activePageViewBox returns the page viewBox', () => {
    const { bus, active } = setup();
    const custom = { x: 10, y: 20, width: 300, height: 400 };
    bus.dispatch(new CreatePageCommand(custom));
    TestBed.flushEffects();
    expect(active.activePageViewBox()).toEqual(custom);
  });

  it('activePageViewBox is null when no active page', () => {
    const { active } = setup();
    expect(active.activePageViewBox()).toBeNull();
  });
});
