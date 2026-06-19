import { Component, inject, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEllipse,
  createGroup,
  createImage,
  createRect,
  EditorStateService,
  HistoryService,
  InsertNodeCommand,
  isPage,
  type SvgNode,
  withLayerFlag,
  withPageFlag,
} from 'svg-engine/core';
import { ClipboardService } from '../../clipboard/clipboard.service';
import { RecentFilesService } from '../../recent-files/recent-files.service';
import { ActivePageService } from '../../pages/active-page.service';
import { describe, expect, it } from 'vitest';

import { PANEL_ID, PanelHostService } from '../../panel/panel-host.service';
import { provideSvgEnginePlugin } from '../../plugin/provide-plugin';
import { provideSvgEngineEditorScope } from '../../scope';
import { SelectionService } from '../../selection/selection.service';
import { WorkspaceService } from '../../workspace/workspace.service';
import { MenuContributionRegistry } from '../menu-contribution-registry.service';
import { resolveDisabledSignal } from '../menu-context';
import { CONTEXT_MENU_SLOT, MENU_SLOT, TOOLBAR_SLOT } from '../menu-slots';
import { builtinMenuContributionsPlugin } from './builtin-menu-contributions.plugin';

/**
 * End-to-end contract:
 *
 * 1. **Plugin registers** the canonical items in the right slots.
 * 2. **disabled signals** are scope-aware (resolved against the
 *    consumer's injector via factory form — D-043 fix).
 * 3. **run() handlers** receive the per-fire context and resolve
 *    services from the active scope (mutations land in the right
 *    editor instance — D-042 / D-043).
 *
 * Distinct from the removed `demoMenuBarPlugin`, whose handlers were
 * `console.info` placeholders.
 */

function setupRoot() {
  TestBed.configureTestingModule({
    providers: [provideSvgEnginePlugin(builtinMenuContributionsPlugin)],
  });
  const reg = TestBed.inject(MenuContributionRegistry);
  const bus = TestBed.inject(CommandBus);
  const state = TestBed.inject(EditorStateService);
  const selection = TestBed.inject(SelectionService);
  const history = TestBed.inject(HistoryService);
  const injector = TestBed.inject(Injector);
  return { reg, bus, state, selection, history, injector };
}

describe('builtinMenuContributionsPlugin — registers canonical items', () => {
  it('populates Edit slot with Undo/Redo/Delete/Select All/Cut/Copy/Paste/Duplicate', () => {
    const { reg } = setupRoot();
    const ids = reg
      .bySlot(MENU_SLOT.EDIT)()
      .map((c) => c.id);
    expect(ids).toContain('svge.builtin.edit.undo');
    expect(ids).toContain('svge.builtin.edit.redo');
    expect(ids).toContain('svge.builtin.edit.delete');
    // Select All is now nested under the "Select" submenu but still lives
    // in the EDIT slot (parentId only affects rendering, not the slot).
    expect(ids).toContain('svge.builtin.edit.select-all');
    expect(ids).toContain('svge.builtin.edit.cut');
    expect(ids).toContain('svge.builtin.edit.copy');
    expect(ids).toContain('svge.builtin.edit.paste');
    expect(ids).toContain('svge.builtin.edit.paste-in-place');
    expect(ids).toContain('svge.builtin.edit.duplicate');
    // **D-085** — Group / Ungroup MOVED to the Object slot (Option B);
    // they keep their ids but no longer appear in the Edit slot.
    expect(ids).not.toContain('svge.builtin.edit.group');
    expect(ids).not.toContain('svge.builtin.edit.ungroup');
  });

  it('Paste In Place keeps original coords; plain Paste offsets +10px (D-102)', () => {
    const { reg, state, injector } = setupRoot();
    const clipboard = injector.get(ClipboardService);
    // A rect with identity transform; clipboard stores a clone.
    clipboard.copy([createRect({ x: 10, y: 10, width: 20, height: 20 })]);

    const lastChild = (): SvgNode => {
      const kids = (state.document().root as { readonly children: readonly SvgNode[] }).children;
      return kids[kids.length - 1]!;
    };

    // Paste In Place → transform stays identity (no offset).
    reg.get('svge.builtin.edit.paste-in-place')!.run({ injector });
    expect(lastChild().transform).toEqual([1, 0, 0, 1, 0, 0]);

    // Plain Paste → transform nudged by +10,+10 so the copy is visible.
    reg.get('svge.builtin.edit.paste')!.run({ injector });
    expect(lastChild().transform).toEqual([1, 0, 0, 1, 10, 10]);
  });

  it('Paste In Place is disabled while the clipboard is empty (D-102)', () => {
    const { reg, injector } = setupRoot();
    const item = reg.get('svge.builtin.edit.paste-in-place');
    expect(item).toBeDefined();
    expect(resolveDisabledSignal(item!, injector)()).toBe(true); // empty clipboard
    injector.get(ClipboardService).copy([createRect({ x: 0, y: 0, width: 5, height: 5 })]);
    expect(resolveDisabledSignal(item!, injector)()).toBe(false);
  });

  it('Select All selects objects on the ACTIVE PAGE, not the page node (D-103)', () => {
    const { reg, state, selection, injector } = setupRoot();
    const rectA = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const rectB = createRect({ x: 20, y: 0, width: 10, height: 10 });
    const page = withPageFlag(createGroup([rectA, rectB]), { x: 0, y: 0, width: 100, height: 100 });
    const doc = state.document();
    state.setDocument({ ...doc, root: { ...doc.root, children: [page] } });
    injector.get(ActivePageService).setActive(page.id);

    reg.get('svge.builtin.edit.select-all')!.run({ injector });

    const selected = selection.selectedIds();
    // The shapes inside the active page are selected (so the overlay shows)...
    expect(selected.has(rectA.id)).toBe(true);
    expect(selected.has(rectB.id)).toBe(true);
    // ...and NOT the page node itself (the pre-D-103 bug — no overlay shows
    // for a page, so it "looked like nothing was selected").
    expect(selected.has(page.id)).toBe(false);
    expect(selected.size).toBe(2);
  });

  it('Select All falls back to root children when no page is active (D-103)', () => {
    const { reg, state, selection, injector } = setupRoot();
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const doc = state.document();
    state.setDocument({ ...doc, root: { ...doc.root, children: [rect] } });
    // No page → ActivePageService.treeForRendering() returns the root.
    reg.get('svge.builtin.edit.select-all')!.run({ injector });
    expect(selection.selectedIds().has(rect.id)).toBe(true);
    expect(selection.selectedIds().size).toBe(1);
  });

  it('Invert Selection selects the unselected page objects and drops the selected ones (D-120)', () => {
    const { reg, state, selection, injector } = setupRoot();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 20, y: 0, width: 10, height: 10 });
    const c = createRect({ x: 40, y: 0, width: 10, height: 10 });
    const page = withPageFlag(createGroup([a, b, c]), { x: 0, y: 0, width: 100, height: 100 });
    const doc = state.document();
    state.setDocument({ ...doc, root: { ...doc.root, children: [page] } });
    injector.get(ActivePageService).setActive(page.id);

    selection.select(a.id); // a selected; b, c not

    reg.get('svge.builtin.edit.invert-selection')!.run({ injector });

    const sel = selection.selectedIds();
    expect(sel.has(a.id)).toBe(false); // was selected → dropped
    expect(sel.has(b.id)).toBe(true); // was unselected → now selected
    expect(sel.has(c.id)).toBe(true);
    expect(sel.size).toBe(2);
  });

  it('Invert Selection is disabled only when the active page has no objects (D-120)', () => {
    const { reg, state, injector } = setupRoot();
    const item = reg.get('svge.builtin.edit.invert-selection')!;
    const disabled = resolveDisabledSignal(item, injector);

    const pageId = 'page-d120' as never;
    const vb = { x: 0, y: 0, width: 100, height: 100 };
    const doc = state.document();
    state.setDocument({
      ...doc,
      root: { ...doc.root, children: [withPageFlag(createGroup([], { id: pageId }), vb)] },
    });
    injector.get(ActivePageService).setActive(pageId);
    expect(disabled()).toBe(true); // empty page → nothing to invert

    // Same page id, now holding one object → enabled.
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: {
        ...state.document().root,
        children: [withPageFlag(createGroup([rect], { id: pageId }), vb)],
      },
    });
    expect(disabled()).toBe(false);
  });

  it('File ▸ New bootstraps Page 1 on the fresh document (D-111)', () => {
    const { reg, state, injector } = setupRoot();
    // Fresh editor starts with an empty, pageless document.
    expect(state.document().root.children.length).toBe(0);

    // Empty document → newDocument() skips the window.confirm prompt and
    // proceeds straight to reset + bootstrap.
    reg.get('svge.builtin.file.new')!.run({ injector });

    // The new document opens with exactly one page (Page 1) — so the canvas
    // has an active artboard instead of a pageless root. Without the D-111
    // EnsureDefaultPageCommand dispatch this was 0 (empty/pageless).
    const children = state.document().root.children;
    expect(children.length).toBe(1);
    expect(isPage(children[0]!)).toBe(true);
  });

  it('populates View slot with Zoom + Toggle Grid/Rulers/Outline/Timeline', () => {
    const { reg } = setupRoot();
    const ids = reg
      .bySlot(MENU_SLOT.VIEW)()
      .map((c) => c.id);
    expect(ids).toContain('svge.builtin.view.zoom-in');
    expect(ids).toContain('svge.builtin.view.zoom-out');
    expect(ids).toContain('svge.builtin.view.zoom-reset');
    expect(ids).toContain('svge.builtin.view.toggle-grid');
    expect(ids).toContain('svge.builtin.view.toggle-rulers');
    expect(ids).toContain('svge.builtin.view.toggle-outline');
    expect(ids).toContain('svge.builtin.view.toggle-timeline');
  });

  it('populates Window ▸ Panels with reveal entries that drive PanelHostService (D-098)', () => {
    const { reg, injector } = setupRoot();
    const items = reg.bySlot(MENU_SLOT.WINDOW)();
    const panelChildren = items.filter((c) => c.parentId === 'svge.window.panels');
    const ids = panelChildren.map((c) => c.id);
    // The 6 real right-rail panels (Transform/Assets/Plugins/Inspector/Pages/
    // Effects roadmap placeholders were dropped, not shipped — see plugin).
    expect(ids).toContain('svge.window.panels.layers');
    expect(ids).toContain('svge.window.panels.history');
    expect(ids).toContain('svge.window.panels.properties');
    expect(ids).toContain('svge.window.panels.appearance');
    expect(ids).toContain('svge.window.panels.export');
    expect(ids).toContain('svge.window.panels.gradient');
    // None are comingSoon placeholders anymore.
    expect(panelChildren.every((c) => c.comingSoon !== true)).toBe(true);

    // Firing one publishes a reveal request for the matching logical id.
    const panelHost = injector.get(PanelHostService);
    expect(panelHost.revealRequest()).toBeNull();
    reg.get('svge.window.panels.gradient')!.run({ injector });
    expect(panelHost.revealRequest()?.panelId).toBe(PANEL_ID.GRADIENT);
  });

  it('Show Timeline menu item toggles WorkspaceService.timeline()', () => {
    const { reg, injector } = setupRoot();
    const item = reg
      .bySlot(MENU_SLOT.VIEW)()
      .find((c) => c.id === 'svge.builtin.view.toggle-timeline');
    expect(item).toBeDefined();
    const ws = injector.get(WorkspaceService);
    expect(ws.timeline()).toBe(false);
    item!.run({ injector });
    expect(ws.timeline()).toBe(true);
  });

  it('populates Object slot with reorder items + relocated Group/Ungroup (D-085)', () => {
    const { reg } = setupRoot();
    const ids = reg
      .bySlot(MENU_SLOT.OBJECT)()
      .map((c) => c.id);
    expect(ids).toContain('svge.builtin.object.bring-to-front');
    expect(ids).toContain('svge.builtin.object.bring-forward');
    expect(ids).toContain('svge.builtin.object.send-backward');
    expect(ids).toContain('svge.builtin.object.send-to-back');
    // **D-085** — Group / Ungroup relocated from Edit to the top of Object.
    expect(ids).toContain('svge.builtin.edit.group');
    expect(ids).toContain('svge.builtin.edit.ungroup');
  });

  it('populates File slot with Export SVG / Compressed SVG / Animated SVG (SMIL) / PNG (D-082 F9d, D-137)', () => {
    const { reg } = setupRoot();
    const items = reg.bySlot(MENU_SLOT.FILE)();
    const ids = items.map((c) => c.id);
    expect(ids).toContain('svge.builtin.file.export-svg');
    expect(ids).toContain('svge.builtin.file.export-svgz'); // D-137
    expect(ids).toContain('svge.builtin.file.export-svg-animated');
    expect(ids).toContain('svge.builtin.file.export-png');
    // D-137: the compressed-SVG entry is a child of the Export submenu and sits
    // right after plain SVG (order 10 < 15 < 20).
    const svgz = items.find((c) => c.id === 'svge.builtin.file.export-svgz');
    expect(svgz?.parentId).toBe('svge.builtin.file.export-menu');
    expect(svgz?.order).toBe(15);
  });

  it('populates File slot with real Save / Save As… workspace items (D-138)', () => {
    const { reg } = setupRoot();
    const items = reg.bySlot(MENU_SLOT.FILE)();
    const save = items.find((c) => c.id === 'svge.builtin.file.save');
    const saveAs = items.find((c) => c.id === 'svge.builtin.file.save-as');
    expect(save).toBeTruthy();
    expect(saveAs).toBeTruthy();
    // Real (not roadmap) items: top-level File children, not coming-soon.
    expect(save?.parentId).toBeUndefined();
    expect(save?.comingSoon ?? false).toBe(false);
    expect(save?.order).toBe(30);
    expect(saveAs?.order).toBe(32);
  });

  it('populates Toolbar, Context Canvas, Context Node slots', () => {
    const { reg } = setupRoot();
    // **D-096** — the edit-side plugin registers the 4 Help external links
    // (Documentation / Tutorials / Plugin Development / Report Issue), which
    // only open a URL (no Material needed). About SVG Studio — a Material
    // dialog — stays in `builtinUiMenuContributionsPlugin` (D-017), so it is
    // NOT among these. Consumers wanting About install both plugins.
    const helpIds = reg
      .bySlot(MENU_SLOT.HELP)()
      .map((c) => c.id);
    expect(helpIds).toContain('svge.builtin.help.documentation');
    expect(helpIds).toContain('svge.builtin.help.tutorials');
    expect(helpIds).toContain('svge.builtin.help.plugin-development');
    expect(helpIds).toContain('svge.builtin.help.report-issue');
    expect(helpIds).not.toContain('svge.builtin.help.about'); // UI plugin only
    expect(reg.bySlot(TOOLBAR_SLOT.MAIN)().length).toBeGreaterThan(0);
    expect(reg.bySlot(CONTEXT_MENU_SLOT.CANVAS)().length).toBeGreaterThan(0);
    expect(reg.bySlot(CONTEXT_MENU_SLOT.NODE)().length).toBeGreaterThan(0);
  });
});

describe('builtinMenuContributionsPlugin — disabled factories are scope-aware (D-043 fix)', () => {
  it('Undo disabled signal reflects history state of the resolving injector', () => {
    const { reg, bus, state, injector } = setupRoot();
    const undo = reg.get('svge.builtin.edit.undo')!;
    const sig = resolveDisabledSignal(undo, injector);
    expect(sig()).toBe(true); // history empty → disabled

    bus.dispatch(
      new InsertNodeCommand(
        state.document().root.id,
        createRect({ x: 0, y: 0, width: 10, height: 10 }),
      ),
    );

    expect(sig()).toBe(false); // command pushed → not disabled
  });

  it('Group disabled signal reflects selection size of the resolving injector', () => {
    const { reg, bus, state, selection, injector } = setupRoot();
    const group = reg.get('svge.builtin.edit.group')!;
    const sig = resolveDisabledSignal(group, injector);
    expect(sig()).toBe(true); // 0 selected → disabled

    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const e = createEllipse({ cx: 50, cy: 50, rx: 10, ry: 10 });
    bus.dispatch(new InsertNodeCommand(state.document().root.id, r));
    bus.dispatch(new InsertNodeCommand(state.document().root.id, e));
    selection.selectMany([r.id, e.id]);

    expect(sig()).toBe(false); // 2 selected → enabled
  });

  it('Group disabled when the selection includes a LAYER (cannot group a layer)', () => {
    const { reg, state, selection, injector } = setupRoot();
    const group = reg.get('svge.builtin.edit.group')!;
    const sig = resolveDisabledSignal(group, injector);

    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const layer = withLayerFlag(createGroup([]));
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [rect, layer] },
    });
    selection.selectMany([rect.id, layer.id]);

    // 2 selected, but one is a layer → disabled up-front (the menu mirrors
    // the GroupSelectionCommand guard so Ctrl+G isn't a silent no-op).
    expect(sig()).toBe(true);
  });

  it('Ungroup disabled signal reflects focus type of the resolving injector', () => {
    const { reg, bus, state, selection, injector } = setupRoot();
    const ungroup = reg.get('svge.builtin.edit.ungroup')!;
    const sig = resolveDisabledSignal(ungroup, injector);
    expect(sig()).toBe(true);

    const grp = createGroup([createRect({ x: 0, y: 0, width: 5, height: 5 })]);
    bus.dispatch(new InsertNodeCommand(state.document().root.id, grp));
    selection.select(grp.id);

    expect(sig()).toBe(false);
  });
});

describe('builtinMenuContributionsPlugin — run() handlers use ctx.injector (D-043 fix)', () => {
  it('Undo handler with ctx.injector calls bus.undo() of THAT scope', () => {
    const { reg, bus, state, injector } = setupRoot();
    const root = state.document().root;
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    bus.dispatch(new InsertNodeCommand(root.id, rect));

    const undo = reg.get('svge.builtin.edit.undo')!;
    undo.run({ injector });

    expect(
      (state.document().root as { readonly children: readonly unknown[] }).children.length,
    ).toBe(0);
  });

  it('Delete handler with ctx.injector removes selected node', () => {
    const { reg, bus, state, selection, injector } = setupRoot();
    const root = state.document().root;
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    bus.dispatch(new InsertNodeCommand(root.id, rect));
    selection.select(rect.id);

    reg.get('svge.builtin.edit.delete')!.run({ injector });

    expect(
      (state.document().root as { readonly children: readonly unknown[] }).children.length,
    ).toBe(0);
  });

  it('Group handler with ctx.injector creates a group containing selected nodes', () => {
    const { reg, bus, state, selection, injector } = setupRoot();
    const root = state.document().root;
    const r = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const e = createEllipse({ cx: 50, cy: 50, rx: 10, ry: 10 });
    bus.dispatch(new InsertNodeCommand(root.id, r));
    bus.dispatch(new InsertNodeCommand(root.id, e));
    selection.selectMany([r.id, e.id]);

    reg.get('svge.builtin.edit.group')!.run({ injector });

    const children = (
      state.document().root as { readonly children: readonly { readonly type: string }[] }
    ).children;
    expect(children.length).toBe(1);
    expect(children[0]?.type).toBe('group');
  });
});

// ── Multi-editor (D-042 + D-043 fix) — proves scope isolation ────
// Mount two host components each with provideSvgEngineEditorScope().
// Trigger the same menu item via each host's injector — only THAT
// host's editor state is mutated.

describe('builtinMenuContributionsPlugin — multi-editor scope isolation (D-042/D-043)', () => {
  function makeScopedHost() {
    @Component({
      selector: 'svge-test-scoped-host',
      standalone: true,
      template: '',
      providers: [provideSvgEngineEditorScope()],
    })
    class Host {
      readonly state = inject(EditorStateService);
      readonly bus = inject(CommandBus);
      readonly selection = inject(SelectionService);
      readonly injector = inject(Injector);
    }
    return Host;
  }

  it('Delete fired from host A only removes from host A document, not from host B', () => {
    TestBed.configureTestingModule({
      providers: [provideSvgEnginePlugin(builtinMenuContributionsPlugin)],
    });
    const reg = TestBed.inject(MenuContributionRegistry);

    const Host = makeScopedHost();
    const a = TestBed.createComponent(Host).componentInstance;
    const b = TestBed.createComponent(Host).componentInstance;

    // Each scope has its own document — seed both with a shape, then
    // delete from A only and prove B is untouched.
    const rA = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const rB = createRect({ x: 100, y: 100, width: 20, height: 20 });
    a.bus.dispatch(new InsertNodeCommand(a.state.document().root.id, rA));
    b.bus.dispatch(new InsertNodeCommand(b.state.document().root.id, rB));
    a.selection.select(rA.id);
    b.selection.select(rB.id);

    expect(
      (a.state.document().root as { readonly children: readonly unknown[] }).children.length,
    ).toBe(1);
    expect(
      (b.state.document().root as { readonly children: readonly unknown[] }).children.length,
    ).toBe(1);

    // Fire Delete with A's injector — only A's document loses the shape.
    reg.get('svge.builtin.edit.delete')!.run({ injector: a.injector });

    expect(
      (a.state.document().root as { readonly children: readonly unknown[] }).children.length,
    ).toBe(0);
    expect(
      (b.state.document().root as { readonly children: readonly unknown[] }).children.length,
    ).toBe(1);
  });

  it('Undo disabled signal in scope A reflects A history, in scope B reflects B history (independent)', () => {
    TestBed.configureTestingModule({
      providers: [provideSvgEnginePlugin(builtinMenuContributionsPlugin)],
    });
    const reg = TestBed.inject(MenuContributionRegistry);

    const Host = makeScopedHost();
    const a = TestBed.createComponent(Host).componentInstance;
    const b = TestBed.createComponent(Host).componentInstance;

    const undo = reg.get('svge.builtin.edit.undo')!;
    const sigA = resolveDisabledSignal(undo, a.injector);
    const sigB = resolveDisabledSignal(undo, b.injector);

    expect(sigA()).toBe(true);
    expect(sigB()).toBe(true);

    a.bus.dispatch(
      new InsertNodeCommand(
        a.state.document().root.id,
        createRect({ x: 0, y: 0, width: 10, height: 10 }),
      ),
    );

    expect(sigA()).toBe(false); // A has history now
    expect(sigB()).toBe(true); // B untouched
  });
});

// ── D-079 regression — Convert to Layer must work inside Pages ────
// Under the Pages model a top-level group is a direct child of the active
// PAGE, not of the document root. The disabled gate used to require the
// parent to be the root, so the menu item stayed permanently disabled
// (the user couldn't even test it). It now treats both root and a page as
// valid "layer containers".

describe('builtinMenuContributionsPlugin — Convert to Layer under Pages (D-079 regression)', () => {
  it('enables for a group inside a page; stays disabled for nested groups and pages', () => {
    const { reg, state, selection, injector } = setupRoot();
    const item = reg.get('svge.builtin.object.convert-to-layer')!;
    const disabled = resolveDisabledSignal(item, injector);

    const topGroup = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    const nested = createGroup([createRect({ x: 0, y: 0, width: 5, height: 5 })]);
    const holder = createGroup([nested]); // plain group holding the nested one
    const page = withPageFlag(createGroup([topGroup, holder]), {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [page] },
    });

    // Group directly under the page → ENABLED (this was the bug).
    selection.select(topGroup.id);
    expect(disabled()).toBe(false);

    // Group nested inside another (plain) group → still disabled.
    selection.select(nested.id);
    expect(disabled()).toBe(true);

    // The page itself → disabled (a page is not a convertible group).
    selection.select(page.id);
    expect(disabled()).toBe(true);
  });
});

// ── D-086 follow-up — image clipper guard on Make Clipping Path ───
// SVG ignores `<image>` inside `<clipPath>`, so an image clipper would
// crop the targets to nothing. `cantMakeClipFactory` forbids it; Make
// Opacity Mask keeps the looser threshold (a `<mask>` renders images).

describe('builtinMenuContributionsPlugin — Make Clipping Path forbids an image clipper', () => {
  it('disables when the topmost selected node is an <image>, enables for a vector clipper', () => {
    const { reg, bus, state, selection, injector } = setupRoot();
    const makeClip = reg.get('svge.builtin.object.mask.make-clip')!;
    const sig = resolveDisabledSignal(makeClip, injector);

    // The item carries the explanatory tooltip that the menu-bar surfaces
    // on hover (the "why is this greyed?" hint).
    expect(makeClip.tooltip).toMatch(/Opacity Mask/);

    expect(sig()).toBe(true); // < 2 selected → disabled (Group threshold)

    const target = createRect({ x: 0, y: 0, width: 40, height: 40 });
    const imageClipper = createImage({ x: 5, y: 5, width: 20, height: 20, href: 'data:,' });
    bus.dispatch(new InsertNodeCommand(state.document().root.id, target));
    bus.dispatch(new InsertNodeCommand(state.document().root.id, imageClipper)); // topmost
    selection.selectMany([target.id, imageClipper.id]);

    // 2 selected, but the clipper (topmost) is an image → still disabled.
    expect(sig()).toBe(true);

    // Make Opacity Mask has NO such restriction — a `<mask>` renders images.
    const makeMask = reg.get('svge.builtin.object.mask.make-opacity')!;
    expect(resolveDisabledSignal(makeMask, injector)()).toBe(false);

    // Swap the clipper for a vector shape (new topmost) → clip enables.
    const vectorClipper = createEllipse({ cx: 10, cy: 10, rx: 8, ry: 8 });
    bus.dispatch(new InsertNodeCommand(state.document().root.id, vectorClipper));
    selection.selectMany([target.id, vectorClipper.id]);
    expect(sig()).toBe(false);
  });
});

// ── D-122 — Lock / Unlock Guides as two state-aware items ─────────
// Two separate entries (project convention, cf. Make/Release Clipping
// Path) instead of one toggle: each is disabled when it would be a
// no-op, and run() drives WorkspaceService.setGuidesLocked.

describe('builtinMenuContributionsPlugin — Lock/Unlock Guides state-aware (D-122)', () => {
  it('Lock Guides: enabled when unlocked, disabled once locked; running it locks', () => {
    const { reg, injector } = setupRoot();
    const ws = injector.get(WorkspaceService);
    const lock = reg.get('svge.builtin.view.guides.lock')!;
    const disabled = resolveDisabledSignal(lock, injector);

    expect(ws.guidesLocked()).toBe(false);
    expect(disabled()).toBe(false); // unlocked → can lock

    lock.run({ injector });
    expect(ws.guidesLocked()).toBe(true);
    expect(disabled()).toBe(true); // already locked → nothing to lock
  });

  it('Unlock Guides: disabled when unlocked, enabled once locked; running it unlocks', () => {
    const { reg, injector } = setupRoot();
    const ws = injector.get(WorkspaceService);
    const unlock = reg.get('svge.builtin.view.guides.unlock')!;
    const disabled = resolveDisabledSignal(unlock, injector);

    expect(disabled()).toBe(true); // unlocked → nothing to unlock

    ws.setGuidesLocked(true);
    expect(disabled()).toBe(false); // locked → can unlock

    unlock.run({ injector });
    expect(ws.guidesLocked()).toBe(false);
  });
});

describe('D-136 — File ▸ Open Recent dynamic submenu', () => {
  const PARENT = 'svge.builtin.file.open-recent';
  const childrenOf = (reg: MenuContributionRegistry) =>
    reg
      .bySlot(MENU_SLOT.FILE)()
      .filter((c) => c.parentId === PARENT);

  it('registers the parent + an empty-state child when there are no recent files', () => {
    localStorage.clear();
    const { reg } = setupRoot();
    expect(reg.get(PARENT)).toBeTruthy();
    expect(childrenOf(reg).map((c) => c.id)).toEqual(['svge.builtin.file.open-recent.empty']);
  });

  it('rebuilds children synchronously when files are recorded (no effect → no CD loop)', () => {
    localStorage.clear();
    const { reg, injector } = setupRoot();
    const recent = injector.get(RecentFilesService);
    recent.record('alpha.svg', '<svg/>');
    recent.record('beta.svg', '<svg/>');
    // newest-first files, then the divider (empty label) + Clear Recent Files.
    expect(childrenOf(reg).map((c) => c.label)).toEqual([
      'beta.svg',
      'alpha.svg',
      '',
      'Clear Recent Files',
    ]);
  });

  it('Clear Recent Files empties the submenu back to the empty state', () => {
    localStorage.clear();
    const { reg, injector } = setupRoot();
    const recent = injector.get(RecentFilesService);
    recent.record('alpha.svg', '<svg/>');
    reg.get('svge.builtin.file.open-recent.clear')!.run({ injector });
    expect(recent.files()).toEqual([]);
    expect(childrenOf(reg).map((c) => c.id)).toEqual(['svge.builtin.file.open-recent.empty']);
  });
});
