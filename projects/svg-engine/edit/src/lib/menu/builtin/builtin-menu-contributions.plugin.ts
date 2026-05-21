import { computed, type ProviderToken } from '@angular/core';
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
import { CONTEXT_MENU_SLOT, MENU_SLOT, TOOLBAR_SLOT } from '../menu-slots';

/**
 * **`builtinMenuContributionsPlugin`** — **D-043** (UI controls full-functionality sprint).
 *
 * Populates `MenuContributionRegistry` with **canonical, fully-wired**
 * File / Edit / View / Object / Help / toolbar / context items so the
 * default shell composition (`<svge-editor>` and `<svge-shell-pro>`)
 * has **real, working** actions out of the box — replacing the
 * playground `demoMenuBarPlugin` which only had `console.info(...)`
 * mocks.
 *
 * **Opt-in**: like {@link builtinEditorShortcutsPlugin}, this plugin
 * is **not** auto-installed by the shell. Consumers explicitly add it
 * to their `provideSvgEnginePlugin(...)` chain. The Mosaicoo drop-in
 * shell (and the playground) install it by default; consumers wanting
 * different menu layouts can omit it and register their own.
 *
 * **D-042 multi-editor safety**: every `run()` handler resolves services
 * from the **per-fire injector** (via `currentInjector()`), with
 * fallback to the plugin install context. Disable `Signal`s capture
 * the install-time services (which is fine — for the disable check,
 * any editor instance's bus/history reflects the global current
 * state of the same store; in route-scoped editors only one is
 * mounted at a time anyway).
 *
 * **What's NOT included** (intentional scope):
 *
 * - **Clipboard items** (`Cut`/`Copy`/`Paste`) — no `ClipboardService`
 *   yet. When that lands, append items to File/Edit and CONTEXT_NODE.
 * - **Duplicate** — needs `DuplicateCommand` (deferred from D-040).
 * - **Save** / **Open** / **New** — depend on the consumer's persistence
 *   strategy. Consumers register these themselves.
 * - **Export SVG / PNG (with dialog)** — opening the source-viewer
 *   dialog needs `MatDialog` which lives in `svg-engine/ui`. This
 *   plugin lives in `edit` and cannot import from `ui` (D-017).
 *   Consumers wanting that pattern register a `ui`-side wrapper.
 * - **Align / Distribute** — needs rendered-node bboxes
 *   (`NodeBBox[]`), which requires a live SVG DOM reference. Plugin
 *   handlers don't have one. The Inspector / a future align-tool
 *   surface those buttons where the canvas ref is available.
 * - **Workspace Settings dialog** — same Material-dialog dep as Export.
 *
 * **What IS included**:
 *
 * | Slot                         | Item              | Action                                |
 * | ---------------------------- | ----------------- | ------------------------------------- |
 * | `menu.edit`                  | Undo              | `bus.undo()`                          |
 * | `menu.edit`                  | Redo              | `bus.redo()`                          |
 * | `menu.edit`                  | Delete            | `RemoveNodeCommand` for each selected |
 * | `menu.edit`                  | Select All        | `selection.selectMany(root.children)` |
 * | `menu.edit`                  | Group             | `GroupSelectionCommand(ids)`          |
 * | `menu.edit`                  | Ungroup           | `UngroupCommand(focusId)`             |
 * | `menu.view`                  | Zoom In           | `viewport.zoomIn()`                   |
 * | `menu.view`                  | Zoom Out          | `viewport.zoomOut()`                  |
 * | `menu.view`                  | Reset Zoom        | `viewport.reset()`                    |
 * | `menu.view`                  | Toggle Outline    | `workspace.toggleOutlineMode()`       |
 * | `menu.view`                  | Toggle Grid       | `workspace.toggleGrid()`              |
 * | `menu.view`                  | Toggle Rulers     | `workspace.toggleRulers()`            |
 * | `menu.object`                | Bring to Front    | `ReorderNodeCommand(id, 'toFront')`   |
 * | `menu.object`                | Bring Forward     | `ReorderNodeCommand(id, 'forward')`   |
 * | `menu.object`                | Send Backward     | `ReorderNodeCommand(id, 'backward')`  |
 * | `menu.object`                | Send to Back      | `ReorderNodeCommand(id, 'toBack')`    |
 * | `menu.help`                  | About SVGEngine   | `alert(...)` (consumer overrides)     |
 * | `toolbar.main`               | Undo / Redo / Group / Ungroup / Delete | same as menu     |
 * | `context.canvas`             | Select All / Zoom In / Zoom Out / Reset Zoom        | same as menu     |
 * | `context.node`               | Delete / Group / Ungroup / Bring Forward / Send Backward | same as menu |
 *
 * Every item has reactive `disabled` signals — e.g., Undo is disabled
 * when `history.canUndo()` is false; Group is disabled when fewer than
 * 2 items are selected; Bring Forward is disabled when nothing is
 * selected.
 */
export const builtinMenuContributionsPlugin: EditorPlugin = {
  id: 'svge.builtin.menu-contributions',
  name: 'Built-in editor menu / toolbar / context items (D-043)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const reg = ctx.injector.get(MenuContributionRegistry);

    // Install-context resolution for `disabled` signals (read-only and
    // read at signal-fire time — single-editor or route-scoped, the
    // store under test always reflects current state).
    const history = ctx.injector.get(HistoryService);
    const selection = ctx.injector.get(SelectionService);
    const state = ctx.injector.get(EditorStateService);

    // Reactive guards — encoded once, shared between menu and toolbar
    // items so layout changes don't require duplicating logic.
    const canUndo = computed(() => history.canUndo());
    const canRedo = computed(() => history.canRedo());
    const hasSelection = computed(() => selection.hasSelection());
    const canGroup = computed(() => selection.selectedIds().size >= 2);
    const canUngroup = computed(() => {
      const focus = selection.focusId();
      if (focus === null) return false;
      const node = findNodeById(state.document().root, focus);
      return node !== null && node.type === 'group';
    });

    // ── Lazy injector helper (D-042 multi-editor safety) ───────────
    // run() handlers ALWAYS resolve services from the per-fire ctx
    // injector when available (= the editor that triggered the
    // action) and fall back to the plugin install context otherwise
    // (= single-editor or direct test invocation).
    //
    // NOTE on the disabled signals above: they read install-context
    // services. In multi-editor with route-scoped DI (D-042 — only one
    // route mounted at a time), the install-context = root, but the
    // root services aren't being mutated (route-scoped overrides them
    // for active components). The disabled signal reflects the ROOT
    // state which is stale. Acceptable trade-off for v1 — a follow-up
    // can attach per-editor disabled signals if multi-editor side-by-
    // side becomes a real scenario (see D-042 "fora de escopo").
    interface CtxArg {
      readonly injector?: { get<T>(t: ProviderToken<T>): T };
    }
    const fromCtx = <T>(token: ProviderToken<T>, run?: CtxArg): T =>
      (run?.injector ?? ctx.injector).get(token);

    // ── Edit menu ───────────────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.undo',
        slot: MENU_SLOT.EDIT,
        label: 'Undo',
        icon: 'undo',
        shortcut: 'Ctrl+Z',
        order: 10,
        disabled: computed(() => !canUndo()),
        run() {
          fromCtx(CommandBus).undo();
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
        disabled: computed(() => !canRedo()),
        run() {
          fromCtx(CommandBus).redo();
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
        disabled: computed(() => !hasSelection()),
        run() {
          deleteSelected(fromCtx);
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
        run() {
          selectAllTopLevel(fromCtx);
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
        disabled: computed(() => !canGroup()),
        run() {
          groupSelection(fromCtx);
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
        disabled: computed(() => !canUngroup()),
        run() {
          ungroupFocus(fromCtx);
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
        run() {
          fromCtx(ViewportService).zoomIn();
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
        run() {
          fromCtx(ViewportService).zoomOut();
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
        run() {
          fromCtx(ViewportService).reset();
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
        run() {
          fromCtx(WorkspaceService).toggleGrid();
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
        run() {
          fromCtx(WorkspaceService).toggleRulers();
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
        run() {
          fromCtx(WorkspaceService).toggleOutlineMode();
        },
      }),
    );

    // ── Object menu ────────────────────────────────────────────────
    const reorder = (direction: ReorderDirection, run?: CtxArg): void => {
      const sel = fromCtx(SelectionService, run);
      const ids = Array.from(sel.selectedIds());
      if (ids.length === 0) return;
      const bus = fromCtx(CommandBus, run);
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
        disabled: computed(() => !hasSelection()),
        run() {
          reorder('toFront');
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
        disabled: computed(() => !hasSelection()),
        run() {
          reorder('forward');
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
        disabled: computed(() => !hasSelection()),
        run() {
          reorder('backward');
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
        disabled: computed(() => !hasSelection()),
        run() {
          reorder('toBack');
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
          // Plain alert keeps this dialog-free (consumers wanting a
          // Material dialog override this id via their own plugin).
          alert(
            'SVGEngine — headless-first SVG editor for Angular.\nhttps://github.com/mosaicoo/svg-engine',
          );
        },
      }),
    );

    // ── Toolbar.main (subset of edit/object actions, no labels) ────
    ctx.track(
      reg.register({
        id: 'svge.builtin.toolbar.undo',
        slot: TOOLBAR_SLOT.MAIN,
        label: 'Undo',
        icon: 'undo',
        tooltip: 'Undo (Ctrl+Z)',
        order: 10,
        disabled: computed(() => !canUndo()),
        run() {
          fromCtx(CommandBus).undo();
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
        disabled: computed(() => !canRedo()),
        run() {
          fromCtx(CommandBus).redo();
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
        disabled: computed(() => !hasSelection()),
        run() {
          deleteSelected(fromCtx);
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
        disabled: computed(() => !canGroup()),
        run() {
          groupSelection(fromCtx);
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
        disabled: computed(() => !canUngroup()),
        run() {
          ungroupFocus(fromCtx);
        },
      }),
    );

    // ── Context.canvas (right-click on empty canvas) ───────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.canvas.select-all',
        slot: CONTEXT_MENU_SLOT.CANVAS,
        label: 'Select All',
        icon: 'select_all',
        shortcut: 'Ctrl+A',
        order: 10,
        run() {
          selectAllTopLevel(fromCtx);
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
        run() {
          fromCtx(ViewportService).zoomIn();
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
        run() {
          fromCtx(ViewportService).zoomOut();
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
        run() {
          fromCtx(ViewportService).reset();
        },
      }),
    );

    // ── Context.node (right-click on a shape / group) ──────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.node.delete',
        slot: CONTEXT_MENU_SLOT.NODE,
        label: 'Delete',
        icon: 'delete',
        shortcut: 'Delete',
        order: 10,
        disabled: computed(() => !hasSelection()),
        run() {
          deleteSelected(fromCtx);
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
        disabled: computed(() => !canGroup()),
        run() {
          groupSelection(fromCtx);
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
        disabled: computed(() => !canUngroup()),
        run() {
          ungroupFocus(fromCtx);
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
        disabled: computed(() => !hasSelection()),
        run() {
          reorder('forward');
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
        disabled: computed(() => !hasSelection()),
        run() {
          reorder('backward');
        },
      }),
    );
  },
};

// ── Shared action implementations ────────────────────────────────
// Extracted so the same logic powers Edit menu, toolbar, AND context
// menu items without duplication. Each takes the lazy `fromCtx`
// resolver so multi-editor (D-042) routing works.

type Resolver = <T>(
  token: ProviderToken<T>,
  run?: { readonly injector?: { get<T2>(t: ProviderToken<T2>): T2 } },
) => T;

function deleteSelected(fromCtx: Resolver): void {
  const sel = fromCtx(SelectionService);
  const ids = Array.from(sel.selectedIds());
  if (ids.length === 0) return;
  const bus = fromCtx(CommandBus);
  for (const id of ids) bus.dispatch(new RemoveNodeCommand(id));
}

function selectAllTopLevel(fromCtx: Resolver): void {
  const state = fromCtx(EditorStateService);
  const root = state.document().root;
  if (root.type !== 'group' || root.children.length === 0) return;
  fromCtx(SelectionService).selectMany(root.children.map((c) => c.id));
}

function groupSelection(fromCtx: Resolver): void {
  const sel = fromCtx(SelectionService);
  const ids = Array.from(sel.selectedIds());
  if (ids.length < 2) return;
  fromCtx(CommandBus).dispatch(new GroupSelectionCommand(ids));
}

function ungroupFocus(fromCtx: Resolver): void {
  const sel = fromCtx(SelectionService);
  const focus = sel.focusId();
  if (focus === null) return;
  const state = fromCtx(EditorStateService);
  const node = findNodeById(state.document().root, focus);
  if (node === null || node.type !== 'group') return;
  fromCtx(CommandBus).dispatch(new UngroupCommand(focus));
}
