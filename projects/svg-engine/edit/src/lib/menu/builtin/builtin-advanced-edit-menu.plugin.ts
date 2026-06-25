import { computed, type Injector, type Signal } from '@angular/core';
import {
  CommandBus,
  isLiveBooleanGroup,
  type LiveBooleanOp,
  MakeCompoundPathCommand,
  MakeLiveBooleanCommand,
  RefreshLiveBooleanCommand,
  ReleaseCompoundPathCommand,
  ReleaseLiveBooleanCommand,
  EditorStateService,
  findNodeById,
} from '@mosaicoo/svg-engine/core';

import { type EditorPlugin, PLUGIN_API_VERSION } from '../../plugin/plugin';
import { SelectionService } from '../../selection/selection.service';
import { MenuContributionRegistry } from '../menu-contribution-registry.service';
import type { MenuContributionContext } from '../menu-contribution';
import { MENU_SLOT } from '../menu-slots';

/**
 * **D-053..D-056** — Menu items for the "Edição avançada" (Item 6)
 * commands:
 *
 * - **D-054 Compound Path**: Make / Release (`Object` menu).
 * - **D-056 Boolean Live**: Make Union/Intersect/Subtract/Exclude,
 *   Refresh, Release (`Object > Live Boolean` submenu).
 *
 * Registered in the **Object** menu (matches Illustrator convention:
 * "Compound Path" lives under Object, "Live Booleans" under
 * Object/Pathfinder). Refresh + Release become disabled when the
 * selection isn't a live-boolean group.
 *
 * **D-053 text features** (variable fonts, OpenType, text on path,
 * letter-spacing) are property-only — no menu items needed. The
 * Inspector's **Type section (D-068)** surfaces them directly when
 * a text node is selected: 4 controls plus 4 OpenType quick-toggle
 * chips, all dispatching `SetPropertyCommand`. (Before D-068 the
 * model/render/export were ready but no UI exposed them — D-053
 * was effectively headless-only.)
 *
 * **Opt-in**: like all builtin plugins, consumers explicitly
 * provision via `provideSvgEnginePlugin(builtinAdvancedEditMenuPlugin)`.
 */
export const builtinAdvancedEditMenuPlugin: EditorPlugin = {
  id: 'svge.builtin.advanced-edit-menu',
  name: 'Built-in advanced edit menu items (compound paths + live boolean) — D-054/D-056',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const reg = ctx.injector.get(MenuContributionRegistry);

    // ── Factory helpers (D-043 multi-editor safe) ──────────────────

    // "Need at least 2 nodes selected" — used by compound + boolean make.
    const needTwoOrMoreFactory = (injector: Injector): Signal<boolean> => {
      const sel = injector.get(SelectionService);
      return computed(() => sel.selectedIds().size < 2);
    };

    // "Need at least 1 path selected" — used by Release Compound.
    const needPathFactory = (injector: Injector): Signal<boolean> => {
      const sel = injector.get(SelectionService);
      const state = injector.get(EditorStateService);
      return computed(() => {
        const ids = Array.from(sel.selectedIds());
        if (ids.length !== 1) return true;
        const node = findNodeById(state.document().root, ids[0]!);
        return node === null || node.type !== 'path';
      });
    };

    // "Need a live-boolean group selected" — used by Refresh + Release.
    const needLiveBooleanFactory = (injector: Injector): Signal<boolean> => {
      const sel = injector.get(SelectionService);
      const state = injector.get(EditorStateService);
      return computed(() => {
        const ids = Array.from(sel.selectedIds());
        if (ids.length !== 1) return true;
        const node = findNodeById(state.document().root, ids[0]!);
        return node === null || !isLiveBooleanGroup(node);
      });
    };

    // ── Object ▸ Compound Path ▶ submenu (D-085) ───────────────────
    // Was two flat Object items; now a submenu (Option B). Ids kept for
    // shortcut/NLU backward compat (Ctrl+8 / Ctrl+Alt+8). Order 90 sits
    // after Smart Object (85), before the Boolean ops.
    ctx.track(
      reg.register({
        id: 'svge.advanced.compound',
        slot: MENU_SLOT.OBJECT,
        label: 'Compound Path',
        icon: 'merge',
        order: 90,
        run() {
          /* submenu parent */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.advanced.compound.make',
        parentId: 'svge.advanced.compound',
        slot: MENU_SLOT.OBJECT,
        label: 'Make Compound Path',
        icon: 'merge',
        shortcut: 'Ctrl+8',
        order: 10,
        disabled: needTwoOrMoreFactory,
        run(runCtx) {
          runMakeCompound(runCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.advanced.compound.release',
        parentId: 'svge.advanced.compound',
        slot: MENU_SLOT.OBJECT,
        label: 'Release Compound Path',
        icon: 'call_split',
        shortcut: 'Ctrl+Alt+8',
        order: 20,
        disabled: needPathFactory,
        run(runCtx) {
          runReleaseCompound(runCtx);
        },
      }),
    );

    // ── Live Boolean folded into Object ▸ Boolean (D-085) ──────────
    // Previously its own "Live Boolean ▶" submenu. The menu bar renders
    // only 2 levels, so a "Boolean ▶ Live ▶ …" sub-submenu can't render;
    // instead the live ops are FLAT leaves under the shared Boolean
    // parent (`svge.builtin.object.pathfinder`), grouped by a divider
    // after the 5 destructive ops (orders 10–50). Leaf ids preserved.
    const BOOLEAN_PARENT = 'svge.builtin.object.pathfinder';
    ctx.track(
      reg.register({
        id: 'svge.advanced.live-boolean.head-divider',
        parentId: BOOLEAN_PARENT,
        slot: MENU_SLOT.OBJECT,
        label: '',
        order: 60,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    const opEntries: { id: string; label: string; icon: string; op: LiveBooleanOp }[] = [
      { id: 'union', label: 'Make Live Union', icon: 'join_full', op: 'union' },
      { id: 'intersect', label: 'Make Live Intersect', icon: 'join_inner', op: 'intersect' },
      { id: 'subtract', label: 'Make Live Subtract', icon: 'remove_circle', op: 'subtract' },
      { id: 'exclude', label: 'Make Live Exclude', icon: 'join_left', op: 'exclude' },
    ];
    for (let i = 0; i < opEntries.length; i++) {
      const e = opEntries[i]!;
      ctx.track(
        reg.register({
          id: `svge.advanced.live-boolean.make.${e.id}`,
          parentId: BOOLEAN_PARENT,
          slot: MENU_SLOT.OBJECT,
          label: e.label,
          icon: e.icon,
          order: 70 + i * 10,
          disabled: needTwoOrMoreFactory,
          run(runCtx) {
            runMakeLiveBoolean(runCtx, e.op);
          },
        }),
      );
    }
    ctx.track(
      reg.register({
        id: 'svge.advanced.live-boolean.refresh-divider',
        parentId: BOOLEAN_PARENT,
        slot: MENU_SLOT.OBJECT,
        label: '',
        order: 115,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.advanced.live-boolean.refresh',
        parentId: BOOLEAN_PARENT,
        slot: MENU_SLOT.OBJECT,
        label: 'Refresh Live Boolean',
        icon: 'refresh',
        order: 120,
        disabled: needLiveBooleanFactory,
        run(runCtx) {
          runRefreshLiveBoolean(runCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.advanced.live-boolean.release',
        parentId: BOOLEAN_PARENT,
        slot: MENU_SLOT.OBJECT,
        label: 'Release Live Boolean',
        icon: 'lock_open',
        order: 130,
        disabled: needLiveBooleanFactory,
        run(runCtx) {
          runReleaseLiveBoolean(runCtx);
        },
      }),
    );
  },
};

// ── Handlers ──────────────────────────────────────────────────────────

function runMakeCompound(runCtx: MenuContributionContext | undefined): void {
  const injector = runCtx?.injector;
  if (injector === undefined) return;
  const sel = injector.get(SelectionService);
  const ids = Array.from(sel.selectedIds());
  if (ids.length < 2) return;
  injector.get(CommandBus).dispatch(new MakeCompoundPathCommand(ids));
}

function runReleaseCompound(runCtx: MenuContributionContext | undefined): void {
  const injector = runCtx?.injector;
  if (injector === undefined) return;
  const sel = injector.get(SelectionService);
  const ids = Array.from(sel.selectedIds());
  if (ids.length !== 1) return;
  injector.get(CommandBus).dispatch(new ReleaseCompoundPathCommand(ids[0]!));
}

function runMakeLiveBoolean(runCtx: MenuContributionContext | undefined, op: LiveBooleanOp): void {
  const injector = runCtx?.injector;
  if (injector === undefined) return;
  const sel = injector.get(SelectionService);
  const ids = Array.from(sel.selectedIds());
  if (ids.length < 2) return;
  injector.get(CommandBus).dispatch(new MakeLiveBooleanCommand(ids, op));
}

function runRefreshLiveBoolean(runCtx: MenuContributionContext | undefined): void {
  const injector = runCtx?.injector;
  if (injector === undefined) return;
  const sel = injector.get(SelectionService);
  const ids = Array.from(sel.selectedIds());
  if (ids.length !== 1) return;
  injector.get(CommandBus).dispatch(new RefreshLiveBooleanCommand(ids[0]!));
}

function runReleaseLiveBoolean(runCtx: MenuContributionContext | undefined): void {
  const injector = runCtx?.injector;
  if (injector === undefined) return;
  const sel = injector.get(SelectionService);
  const ids = Array.from(sel.selectedIds());
  if (ids.length !== 1) return;
  injector.get(CommandBus).dispatch(new ReleaseLiveBooleanCommand(ids[0]!));
}
