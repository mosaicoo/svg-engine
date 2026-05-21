import { computed, type Injector, type ProviderToken, type Signal } from '@angular/core';
import {
  CommandBus,
  EditorStateService,
  findNodeById,
  GroupSelectionCommand,
  HistoryService,
  RemoveNodeCommand,
  ReorderNodeCommand,
  type ReorderDirection,
  UngroupCommand,
} from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';

import { type EditorPlugin } from '../../plugin/plugin';
import { PLUGIN_API_VERSION } from '../../plugin/plugin';
import { SelectionService } from '../../selection/selection.service';
import { WorkspaceService } from '../../workspace/workspace.service';
import { MenuContributionRegistry } from '../menu-contribution-registry.service';
import type { MenuContributionContext } from '../menu-contribution';
import { CONTEXT_MENU_SLOT, MENU_SLOT, TOOLBAR_SLOT } from '../menu-slots';

/**
 * **`builtinMenuContributionsPlugin`** — **D-043** (UI controls full-functionality sprint).
 *
 * Populates `MenuContributionRegistry` with **canonical, fully-wired**
 * Edit / View / Object / Help / toolbar / context items so the default
 * shell composition (`<svge-editor>` and `<svge-shell-pro>`) has
 * **real, working** actions out of the box.
 *
 * **Opt-in**: like {@link builtinEditorShortcutsPlugin}, this plugin
 * is **not** auto-installed by the shell. Consumers explicitly add it
 * via `provideSvgEnginePlugin(...)`. Mosaicoo / playground install it
 * by default; consumers wanting different layouts omit it and
 * register their own.
 *
 * **D-042 / D-043 multi-editor safety**:
 *
 * - **`run()` handlers** read the per-fire `MenuContributionContext`
 *   passed by the UI component (`<svge-menu-bar>`, `<svge-toolbar>`,
 *   `<svge-context-menu>`) and resolve services from `ctx.injector`
 *   (= the **active editor scope** in route-scoped apps).
 * - **`disabled` signals** use the **factory form**
 *   `(injector) => Signal<boolean>` so the consumer component
 *   instantiates one signal per-instance, reading services from its
 *   own injector. Avoids the stale-root-services trap that the
 *   first attempt at D-043 fell into (handlers worked-ish but
 *   disabled signals always showed root state).
 *
 * **What's NOT included** (intentional scope, registered in D-043):
 * - Clipboard items (Cut/Copy/Paste) — no `ClipboardService` yet.
 * - Duplicate — no `DuplicateCommand` (deferred).
 * - Save / Open / New — depend on consumer's persistence strategy.
 * - Export with dialog / Workspace Settings dialog — require Material
 *   dialog (`MatDialog` lives in `ui`; plugin in `edit` cannot import).
 * - Align / Distribute — require rendered-node bboxes (SVG DOM ref).
 *
 * **What IS included** (31 contributions):
 *
 * | Slot                         | Items                                                       |
 * | ---------------------------- | ----------------------------------------------------------- |
 * | `menu.edit`                  | Undo, Redo, Delete, Select All, Group, Ungroup + dividers   |
 * | `menu.view`                  | Zoom In/Out/Reset, Show Grid/Rulers, Outline Mode           |
 * | `menu.object`                | Bring to Front, Bring Forward, Send Backward, Send to Back  |
 * | `menu.help`                  | About SVGEngine                                             |
 * | `toolbar.main`               | Undo, Redo, Delete, Group, Ungroup                          |
 * | `context.canvas`             | Select All, Zoom In/Out/Reset                               |
 * | `context.node`               | Delete, Group, Ungroup, Bring Forward, Send Backward        |
 */
export const builtinMenuContributionsPlugin: EditorPlugin = {
  id: 'svge.builtin.menu-contributions',
  name: 'Built-in editor menu / toolbar / context items (D-043)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const reg = ctx.injector.get(MenuContributionRegistry);

    // ── Factory helpers for `disabled` signals (D-043 fix) ─────────
    // Each factory takes the CONSUMER's injector (the editor scope
    // the contribution is being rendered in) and returns a Signal.
    // The UI component memoizes one signal per (contribution × instance).
    const canUndoFactory = (injector: Injector): Signal<boolean> => {
      const history = injector.get(HistoryService);
      return computed(() => !history.canUndo());
    };
    const canRedoFactory = (injector: Injector): Signal<boolean> => {
      const history = injector.get(HistoryService);
      return computed(() => !history.canRedo());
    };
    const noSelectionFactory = (injector: Injector): Signal<boolean> => {
      const selection = injector.get(SelectionService);
      return computed(() => !selection.hasSelection());
    };
    const cantGroupFactory = (injector: Injector): Signal<boolean> => {
      const selection = injector.get(SelectionService);
      return computed(() => selection.selectedIds().size < 2);
    };
    const cantUngroupFactory = (injector: Injector): Signal<boolean> => {
      const selection = injector.get(SelectionService);
      const state = injector.get(EditorStateService);
      return computed(() => {
        const focus = selection.focusId();
        if (focus === null) return true;
        const node = findNodeById(state.document().root, focus);
        return node === null || node.type !== 'group';
      });
    };

    // ── Lazy injector helper for run() handlers (D-043 fix) ────────
    // Always reads from `runCtx.injector` when present (the editor
    // that fired the action), falling back to the plugin install
    // context for direct test invocations (no UI dispatch).
    const fromCtx = <T>(token: ProviderToken<T>, runCtx?: MenuContributionContext): T =>
      (runCtx?.injector ?? ctx.injector).get(token);

    // ── Edit menu ───────────────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.undo',
        slot: MENU_SLOT.EDIT,
        label: 'Undo',
        icon: 'undo',
        shortcut: 'Ctrl+Z',
        order: 10,
        disabled: canUndoFactory,
        run(runCtx) {
          fromCtx(CommandBus, runCtx).undo();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.redo',
        slot: MENU_SLOT.EDIT,
        label: 'Redo',
        icon: 'redo',
        shortcut: 'Ctrl+Shift+Z',
        order: 20,
        disabled: canRedoFactory,
        run(runCtx) {
          fromCtx(CommandBus, runCtx).redo();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.divider1',
        slot: MENU_SLOT.EDIT,
        label: '',
        order: 30,
        divider: true,
        run() {
          /* divider — never invoked */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.delete',
        slot: MENU_SLOT.EDIT,
        label: 'Delete',
        icon: 'delete',
        shortcut: 'Delete',
        order: 40,
        disabled: noSelectionFactory,
        run(runCtx) {
          deleteSelected(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.select-all',
        slot: MENU_SLOT.EDIT,
        label: 'Select All',
        icon: 'select_all',
        shortcut: 'Ctrl+A',
        order: 50,
        run(runCtx) {
          selectAllTopLevel(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.divider2',
        slot: MENU_SLOT.EDIT,
        label: '',
        order: 60,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.group',
        slot: MENU_SLOT.EDIT,
        label: 'Group',
        icon: 'group_work',
        shortcut: 'Ctrl+G',
        order: 70,
        disabled: cantGroupFactory,
        run(runCtx) {
          groupSelection(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.ungroup',
        slot: MENU_SLOT.EDIT,
        label: 'Ungroup',
        icon: 'workspaces',
        shortcut: 'Ctrl+Shift+G',
        order: 80,
        disabled: cantUngroupFactory,
        run(runCtx) {
          ungroupFocus(runCtx, fromCtx);
        },
      }),
    );

    // ── View menu ──────────────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.zoom-in',
        slot: MENU_SLOT.VIEW,
        label: 'Zoom In',
        icon: 'zoom_in',
        order: 10,
        run(runCtx) {
          fromCtx(ViewportService, runCtx).zoomIn();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.zoom-out',
        slot: MENU_SLOT.VIEW,
        label: 'Zoom Out',
        icon: 'zoom_out',
        order: 20,
        run(runCtx) {
          fromCtx(ViewportService, runCtx).zoomOut();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.zoom-reset',
        slot: MENU_SLOT.VIEW,
        label: 'Reset Zoom',
        icon: 'fit_screen',
        order: 30,
        run(runCtx) {
          fromCtx(ViewportService, runCtx).reset();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.divider1',
        slot: MENU_SLOT.VIEW,
        label: '',
        order: 40,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.toggle-grid',
        slot: MENU_SLOT.VIEW,
        label: 'Show Grid',
        icon: 'grid_on',
        order: 50,
        run(runCtx) {
          fromCtx(WorkspaceService, runCtx).toggleGrid();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.toggle-rulers',
        slot: MENU_SLOT.VIEW,
        label: 'Show Rulers',
        icon: 'straighten',
        order: 60,
        run(runCtx) {
          fromCtx(WorkspaceService, runCtx).toggleRulers();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.toggle-outline',
        slot: MENU_SLOT.VIEW,
        label: 'Outline Mode',
        icon: 'gesture',
        order: 70,
        run(runCtx) {
          fromCtx(WorkspaceService, runCtx).toggleOutlineMode();
        },
      }),
    );

    // ── Object menu ────────────────────────────────────────────────
    const reorder = (direction: ReorderDirection, runCtx?: MenuContributionContext): void => {
      const sel = fromCtx(SelectionService, runCtx);
      const ids = Array.from(sel.selectedIds());
      if (ids.length === 0) return;
      const bus = fromCtx(CommandBus, runCtx);
      for (const id of ids) bus.dispatch(new ReorderNodeCommand(id, direction));
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.bring-to-front',
        slot: MENU_SLOT.OBJECT,
        label: 'Bring to Front',
        icon: 'flip_to_front',
        shortcut: 'Ctrl+Shift+]',
        order: 10,
        disabled: noSelectionFactory,
        run(runCtx) {
          reorder('toFront', runCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.bring-forward',
        slot: MENU_SLOT.OBJECT,
        label: 'Bring Forward',
        icon: 'arrow_upward',
        shortcut: 'Ctrl+]',
        order: 20,
        disabled: noSelectionFactory,
        run(runCtx) {
          reorder('forward', runCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.send-backward',
        slot: MENU_SLOT.OBJECT,
        label: 'Send Backward',
        icon: 'arrow_downward',
        shortcut: 'Ctrl+[',
        order: 30,
        disabled: noSelectionFactory,
        run(runCtx) {
          reorder('backward', runCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.send-to-back',
        slot: MENU_SLOT.OBJECT,
        label: 'Send to Back',
        icon: 'flip_to_back',
        shortcut: 'Ctrl+Shift+[',
        order: 40,
        disabled: noSelectionFactory,
        run(runCtx) {
          reorder('toBack', runCtx);
        },
      }),
    );

    // ── Help menu ──────────────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.help.about',
        slot: MENU_SLOT.HELP,
        label: 'About SVGEngine',
        icon: 'info',
        order: 10,
        run() {
          alert(
            'SVGEngine — headless-first SVG editor for Angular.\nhttps://github.com/mosaicoo/svg-engine',
          );
        },
      }),
    );

    // ── Toolbar.main ───────────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.toolbar.undo',
        slot: TOOLBAR_SLOT.MAIN,
        label: 'Undo',
        icon: 'undo',
        tooltip: 'Undo (Ctrl+Z)',
        order: 10,
        disabled: canUndoFactory,
        run(runCtx) {
          fromCtx(CommandBus, runCtx).undo();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.toolbar.redo',
        slot: TOOLBAR_SLOT.MAIN,
        label: 'Redo',
        icon: 'redo',
        tooltip: 'Redo (Ctrl+Shift+Z)',
        order: 20,
        disabled: canRedoFactory,
        run(runCtx) {
          fromCtx(CommandBus, runCtx).redo();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.toolbar.delete',
        slot: TOOLBAR_SLOT.MAIN,
        label: 'Delete',
        icon: 'delete',
        tooltip: 'Delete selection (Delete)',
        order: 30,
        disabled: noSelectionFactory,
        run(runCtx) {
          deleteSelected(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.toolbar.group',
        slot: TOOLBAR_SLOT.MAIN,
        label: 'Group',
        icon: 'group_work',
        tooltip: 'Group selection (Ctrl+G)',
        order: 40,
        disabled: cantGroupFactory,
        run(runCtx) {
          groupSelection(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.toolbar.ungroup',
        slot: TOOLBAR_SLOT.MAIN,
        label: 'Ungroup',
        icon: 'workspaces',
        tooltip: 'Ungroup focus (Ctrl+Shift+G)',
        order: 50,
        disabled: cantUngroupFactory,
        run(runCtx) {
          ungroupFocus(runCtx, fromCtx);
        },
      }),
    );

    // ── Context.canvas ─────────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.canvas.select-all',
        slot: CONTEXT_MENU_SLOT.CANVAS,
        label: 'Select All',
        icon: 'select_all',
        shortcut: 'Ctrl+A',
        order: 10,
        run(runCtx) {
          selectAllTopLevel(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.canvas.divider1',
        slot: CONTEXT_MENU_SLOT.CANVAS,
        label: '',
        order: 20,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.canvas.zoom-in',
        slot: CONTEXT_MENU_SLOT.CANVAS,
        label: 'Zoom In',
        icon: 'zoom_in',
        order: 30,
        run(runCtx) {
          fromCtx(ViewportService, runCtx).zoomIn();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.canvas.zoom-out',
        slot: CONTEXT_MENU_SLOT.CANVAS,
        label: 'Zoom Out',
        icon: 'zoom_out',
        order: 40,
        run(runCtx) {
          fromCtx(ViewportService, runCtx).zoomOut();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.canvas.zoom-reset',
        slot: CONTEXT_MENU_SLOT.CANVAS,
        label: 'Reset Zoom',
        icon: 'fit_screen',
        order: 50,
        run(runCtx) {
          fromCtx(ViewportService, runCtx).reset();
        },
      }),
    );

    // ── Context.node ───────────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.node.delete',
        slot: CONTEXT_MENU_SLOT.NODE,
        label: 'Delete',
        icon: 'delete',
        shortcut: 'Delete',
        order: 10,
        disabled: noSelectionFactory,
        run(runCtx) {
          deleteSelected(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.node.divider1',
        slot: CONTEXT_MENU_SLOT.NODE,
        label: '',
        order: 20,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.node.group',
        slot: CONTEXT_MENU_SLOT.NODE,
        label: 'Group',
        icon: 'group_work',
        shortcut: 'Ctrl+G',
        order: 30,
        disabled: cantGroupFactory,
        run(runCtx) {
          groupSelection(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.node.ungroup',
        slot: CONTEXT_MENU_SLOT.NODE,
        label: 'Ungroup',
        icon: 'workspaces',
        shortcut: 'Ctrl+Shift+G',
        order: 40,
        disabled: cantUngroupFactory,
        run(runCtx) {
          ungroupFocus(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.node.divider2',
        slot: CONTEXT_MENU_SLOT.NODE,
        label: '',
        order: 50,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.node.bring-forward',
        slot: CONTEXT_MENU_SLOT.NODE,
        label: 'Bring Forward',
        icon: 'arrow_upward',
        shortcut: 'Ctrl+]',
        order: 60,
        disabled: noSelectionFactory,
        run(runCtx) {
          reorder('forward', runCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.node.send-backward',
        slot: CONTEXT_MENU_SLOT.NODE,
        label: 'Send Backward',
        icon: 'arrow_downward',
        shortcut: 'Ctrl+[',
        order: 70,
        disabled: noSelectionFactory,
        run(runCtx) {
          reorder('backward', runCtx);
        },
      }),
    );
  },
};

// ── Shared action implementations ────────────────────────────────
// Each takes the runtime ctx so the same logic powers Edit menu,
// toolbar, AND context menu items. Resolution goes through `fromCtx`
// which uses `runCtx.injector` (consumer scope) when available.

type Resolver = <T>(token: ProviderToken<T>, runCtx?: MenuContributionContext) => T;

function deleteSelected(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  const sel = fromCtx(SelectionService, runCtx);
  const ids = Array.from(sel.selectedIds());
  if (ids.length === 0) return;
  const bus = fromCtx(CommandBus, runCtx);
  for (const id of ids) bus.dispatch(new RemoveNodeCommand(id));
}

function selectAllTopLevel(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  const state = fromCtx(EditorStateService, runCtx);
  const root = state.document().root;
  if (root.type !== 'group' || root.children.length === 0) return;
  fromCtx(SelectionService, runCtx).selectMany(root.children.map((c) => c.id));
}

function groupSelection(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  const sel = fromCtx(SelectionService, runCtx);
  const ids = Array.from(sel.selectedIds());
  if (ids.length < 2) return;
  fromCtx(CommandBus, runCtx).dispatch(new GroupSelectionCommand(ids));
}

function ungroupFocus(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  const sel = fromCtx(SelectionService, runCtx);
  const focus = sel.focusId();
  if (focus === null) return;
  const state = fromCtx(EditorStateService, runCtx);
  const node = findNodeById(state.document().root, focus);
  if (node === null || node.type !== 'group') return;
  fromCtx(CommandBus, runCtx).dispatch(new UngroupCommand(focus));
}
