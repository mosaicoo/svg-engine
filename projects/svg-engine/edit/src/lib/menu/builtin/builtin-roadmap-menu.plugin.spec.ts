import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEmptyDocument,
  createRect,
  EditorStateService,
  findNodeById,
  InsertNodeCommand,
} from 'svg-engine/core';
import { describe, expect, it } from 'vitest';

import { provideSvgEnginePlugin } from '../../plugin/provide-plugin';
import { provideSvgEngineEditorScope } from '../../scope';
import { SelectionService } from '../../selection/selection.service';
import { MenuContributionRegistry } from '../menu-contribution-registry.service';
import { resolveDisabledSignal, runContribution } from '../menu-context';
import { MENU_SLOT } from '../menu-slots';
import { builtinAdvancedEditMenuPlugin } from './builtin-advanced-edit-menu.plugin';
import { builtinInsertMenuPlugin } from './builtin-insert-menu.plugin';
import { builtinMenuContributionsPlugin } from './builtin-menu-contributions.plugin';
import { builtinRoadmapMenuPlugin } from './builtin-roadmap-menu.plugin';

/**
 * **D-085** — guards for the Option B menubar reorganization.
 *
 * The headline invariant ("**no existing feature is lost**") is enforced
 * by the orphan guard below: every contribution that declares a
 * `parentId` MUST resolve to a parent **in the same slot**, otherwise the
 * `<svge-menu-bar>` would render it nowhere (it's neither a top-level item
 * nor reachable as a submenu child). Installing the full edit-side
 * composition and asserting zero orphans proves the whole reorg keeps
 * every item reachable.
 */

function setupAllEditMenus() {
  TestBed.configureTestingModule({
    // Scoped services (EditorState/Selection/ActivePage/CommandBus) keep the
    // Convert-to-Path test's node insertion off the ROOT singletons, so it
    // can't pollute state other spec files (e.g. pages.spec) rely on.
    providers: [
      provideSvgEngineEditorScope(),
      provideSvgEnginePlugin(builtinMenuContributionsPlugin),
      provideSvgEnginePlugin(builtinInsertMenuPlugin),
      provideSvgEnginePlugin(builtinAdvancedEditMenuPlugin),
      provideSvgEnginePlugin(builtinRoadmapMenuPlugin),
    ],
  });
  return {
    reg: TestBed.inject(MenuContributionRegistry),
    bus: TestBed.inject(CommandBus),
    state: TestBed.inject(EditorStateService),
    selection: TestBed.inject(SelectionService),
    injector: TestBed.inject(Injector),
  };
}

describe('D-085 menubar reorg — no orphaned contributions', () => {
  it('every contribution with a parentId resolves to a parent in the same slot', () => {
    const { reg } = setupAllEditMenus();
    const all = reg.contributions();
    const byId = new Map(all.map((c) => [c.id, c]));

    const orphans = all
      .filter((c) => c.parentId !== undefined)
      .filter((c) => {
        const parent = byId.get(c.parentId as string);
        return parent === undefined || parent.slot !== c.slot;
      })
      .map((c) => c.id);

    expect(orphans).toEqual([]);
  });

  it('relocated real features stay reachable in their new slots', () => {
    const { reg } = setupAllEditMenus();
    const inSlot = (slot: string): string[] =>
      reg
        .bySlot(slot)()
        .map((c) => c.id);

    // Group / Ungroup → Object (ids preserved).
    expect(inSlot(MENU_SLOT.OBJECT)).toContain('svge.builtin.edit.group');
    expect(inSlot(MENU_SLOT.OBJECT)).toContain('svge.builtin.edit.ungroup');
    // New Layer → Insert.
    expect(inSlot(MENU_SLOT.INSERT)).toContain('svge.builtin.object.new-layer');
    // Live boolean + compound nested under the right Object parents.
    const obj = reg.bySlot(MENU_SLOT.OBJECT)();
    const liveUnion = obj.find((c) => c.id === 'svge.advanced.live-boolean.make.union');
    expect(liveUnion?.parentId).toBe('svge.builtin.object.pathfinder');
    const compoundMake = obj.find((c) => c.id === 'svge.advanced.compound.make');
    expect(compoundMake?.parentId).toBe('svge.advanced.compound');
  });

  it('populates the new Path / Tools / Window menus + Object ▸ Mask submenu', () => {
    const { reg } = setupAllEditMenus();
    expect(reg.bySlot(MENU_SLOT.PATH)().length).toBeGreaterThan(0);
    expect(reg.bySlot(MENU_SLOT.TOOLS)().length).toBeGreaterThan(0);
    expect(reg.bySlot(MENU_SLOT.WINDOW)().length).toBeGreaterThan(0);
    // **D-086** — the Mask submenu is now REAL (Make/Release Clipping Path +
    // Make/Release Opacity Mask), registered by builtinMenuContributionsPlugin
    // under `svge.builtin.object.mask` (no longer the roadmap placeholder).
    const maskActions = reg
      .bySlot(MENU_SLOT.OBJECT)()
      .filter((c) => c.parentId === 'svge.builtin.object.mask' && c.divider !== true);
    expect(maskActions.length).toBe(4);
  });
});

describe('D-085 roadmap items — visible but disabled', () => {
  // D-090 relocated every Path entry to a REAL command, D-132 removed the Tools
  // roadmap placeholders, D-133 removed the Insert placeholders (Smart Object
  // became real), and D-138 made File ▸ Save / Save As… real (workspace
  // round-trip). The surviving File roadmap leaf is Document Settings…, so use
  // `svge.roadmap.file.document-settings` to exercise the comingSoon /
  // always-disabled contract.
  it('a roadmap leaf is marked comingSoon and is always disabled', () => {
    const { reg, injector } = setupAllEditMenus();
    const item = reg.get('svge.roadmap.file.document-settings')!;
    expect(item.comingSoon).toBe(true);
    expect(resolveDisabledSignal(item, injector)()).toBe(true);
  });

  it('roadmap leaves never throw when activated (no-op run)', () => {
    const { reg, injector } = setupAllEditMenus();
    const item = reg.get('svge.roadmap.file.document-settings')!;
    expect(() => runContribution(item, injector)).not.toThrow();
  });
});

describe('D-085 Path ▸ Convert to Path — REAL (not roadmap)', () => {
  it('is enabled only when a convertible shape is selected, and converts it', () => {
    const { reg, bus, state, selection, injector } = setupAllEditMenus();
    const item = reg.get('svge.builtin.path.convert-to-path')!;
    expect(item.comingSoon).toBeFalsy();

    state.resetDocument(createEmptyDocument());
    const disabled = resolveDisabledSignal(item, injector);
    expect(disabled()).toBe(true); // nothing selected → disabled

    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    bus.dispatch(new InsertNodeCommand(state.document().root.id, rect));
    selection.select(rect.id);
    expect(disabled()).toBe(false); // a rect is convertible → enabled

    runContribution(item, injector);

    // Robust to page nesting: locate the node anywhere in the tree.
    const converted = findNodeById(state.document().root, rect.id);
    expect(converted?.type).toBe('path');
  });
});
