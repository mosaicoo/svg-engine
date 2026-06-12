import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CommandBus,
  CreatePageCommand,
  createEmptyDocument,
  createGroup,
  EditorStateService,
  isPage,
  type NodeId,
  toNodeId,
  withPageFlag,
} from 'svg-engine/core';
import { SelectionService } from '../selection/selection.service';
import { ACTIVE_PAGE_STORAGE_KEY } from './active-page.config';
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
  // **Test isolation (D-086 fix)** — `ActivePageService` recovers the active
  // page id from `localStorage` (default key `'svge:activePage'`) on init.
  // jsdom's `localStorage` is SHARED across spec files in the same vitest
  // worker, so a page-creating test in ANOTHER file can leave a stale id that
  // makes "starts with activePageId=null" read non-null. Clearing here (before
  // ActivePageService is injected) guarantees a clean slate per test.
  if (typeof localStorage !== 'undefined') localStorage.clear();
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

/**
 * **PAGES-REFACTOR Fase 7** specs — persistence (localStorage round-
 * trip of activePageId) + selection clear on page switch.
 *
 * We isolate the localStorage state per spec via `beforeEach` /
 * `afterEach` so individual cases don't leak persisted ids into each
 * other. The default key (`'svge:activePage'`) is shared with prod,
 * which is fine because the spec lives in a jsdom localStorage that
 * doesn't survive the test run.
 */
describe('PAGES-REFACTOR Fase 7 — persistence + selection clear', () => {
  const STORAGE_KEY = 'svge:activePage:test';

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  });
  afterEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  });

  /**
   * Bootstrap a fresh TestBed wired with a custom ACTIVE_PAGE_STORAGE_KEY
   * so the test runs in isolation from production's default key. Returns
   * the services we exercise.
   */
  function setupWithStorageKey() {
    TestBed.configureTestingModule({
      providers: [{ provide: ACTIVE_PAGE_STORAGE_KEY, useValue: STORAGE_KEY }],
    });
    const state = TestBed.inject(EditorStateService);
    state.resetDocument(createEmptyDocument());
    return {
      state,
      bus: TestBed.inject(CommandBus),
      pages: TestBed.inject(PagesService),
      active: TestBed.inject(ActivePageService),
      sel: TestBed.inject(SelectionService),
    };
  }

  it('persists activePageId to localStorage on setActive', () => {
    const { bus, active } = setupWithStorageKey();
    const a = new CreatePageCommand(VB, 'A');
    bus.dispatch(a);
    const b = new CreatePageCommand(VB, 'B');
    bus.dispatch(b);
    TestBed.flushEffects();
    active.setActive(b.getCreatedPageId());
    TestBed.flushEffects();
    // localStorage now holds page B's id (NOT A's, even though A was the
    // first-auto-selected).
    expect(localStorage.getItem(STORAGE_KEY)).toBe(b.getCreatedPageId());
  });

  it('restores activePageId from localStorage on next bootstrap', () => {
    // Step 1: bootstrap, create two pages, pick B, persist.
    const { bus, active } = setupWithStorageKey();
    const a = new CreatePageCommand(VB, 'A');
    bus.dispatch(a);
    const b = new CreatePageCommand(VB, 'B');
    bus.dispatch(b);
    TestBed.flushEffects();
    active.setActive(b.getCreatedPageId());
    TestBed.flushEffects();
    const persistedId = b.getCreatedPageId()!;
    // Step 2: reset TestBed (simulating a page reload), re-create the
    // doc with the SAME page ids (we can't recreate via CreatePageCommand
    // because that mints fresh ids — so we hand-craft the document).
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: ACTIVE_PAGE_STORAGE_KEY, useValue: STORAGE_KEY }],
    });
    const state2 = TestBed.inject(EditorStateService);
    state2.resetDocument(createEmptyDocument());
    // Hand-craft a page carrying the persisted id.
    const persistedPage = withPageFlag(
      createGroup([], { id: persistedId, metadata: { name: 'B' } }),
      VB,
      'B',
    );
    state2.setDocument({
      ...state2.document(),
      root: { ...state2.document().root, children: [persistedPage] },
    });
    const active2 = TestBed.inject(ActivePageService);
    TestBed.flushEffects();
    // Active service should have restored B (not auto-picked the first
    // page, even though only B exists now — restoration is order-
    // independent because it reads from localStorage at constructor time).
    expect(active2.activePageId()).toBe(persistedId);
  });

  it('falls back to auto-pick when persisted id no longer exists in the doc', () => {
    // Pre-poison localStorage with an id that never existed in any doc.
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, 'ghost-id-not-in-doc');
    }
    const { bus, active } = setupWithStorageKey();
    const a = new CreatePageCommand(VB, 'A');
    bus.dispatch(a);
    TestBed.flushEffects();
    // Auto-recovery effect saw the persisted id was missing → picked A.
    expect(active.activePageId()).toBe(a.getCreatedPageId());
  });

  it('clears localStorage when activePageId becomes null (last page deleted)', () => {
    const { state, bus, active } = setupWithStorageKey();
    const a = new CreatePageCommand(VB, 'A');
    bus.dispatch(a);
    TestBed.flushEffects();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(a.getCreatedPageId());
    // Remove the only page → service nulls active id → effect clears slot.
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [] },
    });
    TestBed.flushEffects();
    expect(active.activePageId()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('clears selection when the user switches to a different page', () => {
    const { bus, active, sel } = setupWithStorageKey();
    const a = new CreatePageCommand(VB, 'A');
    bus.dispatch(a);
    const b = new CreatePageCommand(VB, 'B');
    bus.dispatch(b);
    TestBed.flushEffects();
    // Page A is auto-selected; user selects something on it.
    const fakeNodeId = toNodeId('fake-shape-id');
    sel.select(fakeNodeId);
    expect(sel.isSelected(fakeNodeId)).toBe(true);
    // Switch to B → selection must clear (the selected node is no
    // longer in the rendered subtree).
    active.setActive(b.getCreatedPageId());
    TestBed.flushEffects();
    expect(sel.isSelected(fakeNodeId)).toBe(false);
  });

  it('does NOT clear selection on initial auto-select (null → first page)', () => {
    const { bus, sel } = setupWithStorageKey();
    // Stage a selection BEFORE the first page exists (legitimate use
    // case for consumers that seed selection programmatically).
    const fakeNodeId = toNodeId('pre-existing-selection');
    sel.select(fakeNodeId);
    expect(sel.isSelected(fakeNodeId)).toBe(true);
    // Now create a page — the constructor's initial hydration triggers
    // the first activePageId emission (null → A.id). The effect's
    // "skip when prev was null" branch protects the staged selection.
    bus.dispatch(new CreatePageCommand(VB, 'A'));
    TestBed.flushEffects();
    expect(sel.isSelected(fakeNodeId)).toBe(true);
  });
});
