import { Component, inject, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEllipse,
  createGroup,
  createRect,
  EditorStateService,
  HistoryService,
  InsertNodeCommand,
} from 'svg-engine/core';
import { describe, expect, it } from 'vitest';

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
  it('populates Edit slot with Undo/Redo/Delete/Select All/Group/Ungroup + dividers', () => {
    const { reg } = setupRoot();
    const ids = reg
      .bySlot(MENU_SLOT.EDIT)()
      .map((c) => c.id);
    expect(ids).toContain('svge.builtin.edit.undo');
    expect(ids).toContain('svge.builtin.edit.redo');
    expect(ids).toContain('svge.builtin.edit.delete');
    expect(ids).toContain('svge.builtin.edit.select-all');
    expect(ids).toContain('svge.builtin.edit.group');
    expect(ids).toContain('svge.builtin.edit.ungroup');
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

  it('populates Object slot with reorder items', () => {
    const { reg } = setupRoot();
    const ids = reg
      .bySlot(MENU_SLOT.OBJECT)()
      .map((c) => c.id);
    expect(ids).toContain('svge.builtin.object.bring-to-front');
    expect(ids).toContain('svge.builtin.object.bring-forward');
    expect(ids).toContain('svge.builtin.object.send-backward');
    expect(ids).toContain('svge.builtin.object.send-to-back');
  });

  it('populates File slot with Export SVG / Export Animated SVG (SMIL) / Export PNG (D-082 F9d)', () => {
    const { reg } = setupRoot();
    const ids = reg
      .bySlot(MENU_SLOT.FILE)()
      .map((c) => c.id);
    expect(ids).toContain('svge.builtin.file.export-svg');
    expect(ids).toContain('svge.builtin.file.export-svg-animated');
    expect(ids).toContain('svge.builtin.file.export-png');
  });

  it('populates Toolbar, Context Canvas, Context Node slots', () => {
    const { reg } = setupRoot();
    // **Help slot intentionally empty on the edit-side plugin.**
    // The only item that used to live here was "About SVGEngine"
    // which fired an alert(). The Material-styled About dialog
    // requires @angular/material (D-017 blocks that here), so the
    // item migrated to `builtinUiMenuContributionsPlugin` in
    // svg-engine/ui. Consumers wanting About should install BOTH
    // plugins (the playground / svg-studio defaults do).
    expect(reg.bySlot(MENU_SLOT.HELP)().length).toBe(0);
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
