import { computed, type Injector, type ProviderToken, type Signal } from '@angular/core';
import {
  CommandBus,
  DuplicateNodeCommand,
  EditorStateService,
  findNodeById,
  GroupSelectionCommand,
  HistoryService,
  InsertNodeCommand,
  RemoveNodeCommand,
  ReorderNodeCommand,
  type ReorderDirection,
  UngroupCommand,
} from 'svg-engine/core';
import { pngExporter, svgExporter, svgImporter } from 'svg-engine/io';
import { OptimizeCommand, OptimizerRegistry } from 'svg-engine/optimize';
import { ViewportService } from 'svg-engine/render';

import { ClipboardService } from '../../clipboard/clipboard.service';
import { ActiveDefsService } from '../../library/active-defs.service';
import { type EditorPlugin } from '../../plugin/plugin';
import { PLUGIN_API_VERSION } from '../../plugin/plugin';
import { SelectionService } from '../../selection/selection.service';
import { SnapService } from '../../snap/snap.service';
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
 * **What's NOT included** (intentional scope — Cut/Copy/Paste/Duplicate
 * added in D-044 after `ClipboardService` + `DuplicateNodeCommand`
 * landed; remaining gaps stay deferred for the reasons listed):
 * - Save / Open / New — depend on consumer's persistence strategy.
 * - Export with dialog / Workspace Settings dialog — require Material
 *   dialog (`MatDialog` lives in `ui`; plugin in `edit` cannot import).
 * - Align / Distribute — require rendered-node bboxes (SVG DOM ref).
 *
 * **What IS included** (58 contributions total — counted via
 * `reg.register` calls; expanded in D-044 with clipboard + duplicate):
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
    // D-044: Paste disabled when clipboard is empty.
    const noClipboardFactory = (injector: Injector): Signal<boolean> => {
      const clipboard = injector.get(ClipboardService);
      return computed(() => !clipboard.hasContent());
    };

    // ── Lazy injector helper for run() handlers (D-043 fix) ────────
    // Always reads from `runCtx.injector` when present (the editor
    // that fired the action), falling back to the plugin install
    // context for direct test invocations (no UI dispatch).
    const fromCtx = <T>(token: ProviderToken<T>, runCtx?: MenuContributionContext): T =>
      (runCtx?.injector ?? ctx.injector).get(token);

    // ── File menu ──────────────────────────────────────────────────
    // Browser-native I/O (no dialog component required → stays in
    // edit headless boundary). Consumers wanting a Material file
    // dialog or a custom save flow can register their own items with
    // the same IDs to override (registry throws on duplicate id, so
    // they must dispose the built-in first via reg.get(id) + dispose).
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.new',
        slot: MENU_SLOT.FILE,
        label: 'New',
        icon: 'insert_drive_file',
        shortcut: 'Ctrl+N',
        order: 10,
        run(runCtx) {
          newDocument(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.divider1',
        slot: MENU_SLOT.FILE,
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
        id: 'svge.builtin.file.import',
        slot: MENU_SLOT.FILE,
        label: 'Import SVG…',
        icon: 'folder_open',
        shortcut: 'Ctrl+O',
        order: 30,
        run(runCtx) {
          importSvgFromFile(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.divider2',
        slot: MENU_SLOT.FILE,
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
        id: 'svge.builtin.file.export-svg',
        slot: MENU_SLOT.FILE,
        label: 'Export SVG…',
        icon: 'download',
        order: 50,
        run(runCtx) {
          void exportAndDownload(runCtx, fromCtx, 'svg');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.export-png',
        slot: MENU_SLOT.FILE,
        label: 'Export PNG…',
        icon: 'image',
        order: 60,
        run(runCtx) {
          void exportAndDownload(runCtx, fromCtx, 'png');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.divider3',
        slot: MENU_SLOT.FILE,
        label: '',
        order: 70,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    // D-044: Optimize current document via the OptimizerRegistry pipeline.
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.optimize',
        slot: MENU_SLOT.FILE,
        label: 'Optimize',
        icon: 'auto_fix_high',
        order: 80,
        run(runCtx) {
          const bus = fromCtx(CommandBus, runCtx);
          const registry = fromCtx(OptimizerRegistry, runCtx);
          bus.dispatch(new OptimizeCommand(registry));
        },
      }),
    );

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
    // D-044: Cut/Copy/Paste/Duplicate — clipboard + duplicate handlers
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.cut',
        slot: MENU_SLOT.EDIT,
        label: 'Cut',
        icon: 'content_cut',
        shortcut: 'Ctrl+X',
        order: 51,
        disabled: noSelectionFactory,
        run(runCtx) {
          cutSelected(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.copy',
        slot: MENU_SLOT.EDIT,
        label: 'Copy',
        icon: 'content_copy',
        shortcut: 'Ctrl+C',
        order: 52,
        disabled: noSelectionFactory,
        run(runCtx) {
          copySelected(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.paste',
        slot: MENU_SLOT.EDIT,
        label: 'Paste',
        icon: 'content_paste',
        shortcut: 'Ctrl+V',
        order: 53,
        disabled: noClipboardFactory,
        run(runCtx) {
          pasteFromClipboard(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.duplicate',
        slot: MENU_SLOT.EDIT,
        label: 'Duplicate',
        icon: 'control_point_duplicate',
        shortcut: 'Ctrl+D',
        order: 54,
        disabled: noSelectionFactory,
        run(runCtx) {
          duplicateSelected(runCtx, fromCtx);
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
        icon: 'call_split',
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
    // D-044: Snap toggle (also surfaced clickable in <svge-status-bar>).
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.divider2',
        slot: MENU_SLOT.VIEW,
        label: '',
        order: 75,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.toggle-snap',
        slot: MENU_SLOT.VIEW,
        label: 'Snap',
        icon: 'grid_3x3',
        order: 80,
        run(runCtx) {
          const snap = fromCtx(SnapService, runCtx);
          snap.setEnabled(!snap.enabled());
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
    // D-044: clipboard / duplicate on toolbar
    ctx.track(
      reg.register({
        id: 'svge.builtin.toolbar.copy',
        slot: TOOLBAR_SLOT.MAIN,
        label: 'Copy',
        icon: 'content_copy',
        tooltip: 'Copy selection (Ctrl+C)',
        order: 31,
        disabled: noSelectionFactory,
        run(runCtx) {
          copySelected(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.toolbar.paste',
        slot: TOOLBAR_SLOT.MAIN,
        label: 'Paste',
        icon: 'content_paste',
        tooltip: 'Paste from clipboard (Ctrl+V)',
        order: 32,
        disabled: noClipboardFactory,
        run(runCtx) {
          pasteFromClipboard(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.toolbar.duplicate',
        slot: TOOLBAR_SLOT.MAIN,
        label: 'Duplicate',
        icon: 'control_point_duplicate',
        tooltip: 'Duplicate selection (Ctrl+D)',
        order: 33,
        disabled: noSelectionFactory,
        run(runCtx) {
          duplicateSelected(runCtx, fromCtx);
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
        icon: 'call_split',
        tooltip: 'Ungroup focus (Ctrl+Shift+G)',
        order: 50,
        disabled: cantUngroupFactory,
        run(runCtx) {
          ungroupFocus(runCtx, fromCtx);
        },
      }),
    );
    // D-064 — Zoom controls on toolbar.main. Centralizes
    // history+zoom in a single bar (replacing the buttons that
    // <svge-editor> used to hardcode and the standalone ones in
    // /custom-editor). Same handlers as MENU_SLOT.VIEW so behavior
    // matches the menu version; ordered LAST in toolbar.main so the
    // edit cluster (undo/redo/delete/copy/paste/group) stays at the
    // top and the viewport cluster sits at the right.
    ctx.track(
      reg.register({
        id: 'svge.builtin.toolbar.zoom-out',
        slot: TOOLBAR_SLOT.MAIN,
        label: 'Zoom Out',
        icon: 'zoom_out',
        tooltip: 'Zoom out',
        order: 60,
        run(runCtx) {
          fromCtx(ViewportService, runCtx).zoomOut();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.toolbar.zoom-in',
        slot: TOOLBAR_SLOT.MAIN,
        label: 'Zoom In',
        icon: 'zoom_in',
        tooltip: 'Zoom in',
        order: 70,
        run(runCtx) {
          fromCtx(ViewportService, runCtx).zoomIn();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.toolbar.zoom-reset',
        slot: TOOLBAR_SLOT.MAIN,
        label: 'Reset View',
        icon: 'fit_screen',
        tooltip: 'Reset zoom + pan to fit',
        order: 80,
        run(runCtx) {
          fromCtx(ViewportService, runCtx).reset();
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
        id: 'svge.builtin.context.node.cut',
        slot: CONTEXT_MENU_SLOT.NODE,
        label: 'Cut',
        icon: 'content_cut',
        shortcut: 'Ctrl+X',
        order: 5,
        disabled: noSelectionFactory,
        run(runCtx) {
          cutSelected(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.node.copy',
        slot: CONTEXT_MENU_SLOT.NODE,
        label: 'Copy',
        icon: 'content_copy',
        shortcut: 'Ctrl+C',
        order: 6,
        disabled: noSelectionFactory,
        run(runCtx) {
          copySelected(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.node.duplicate',
        slot: CONTEXT_MENU_SLOT.NODE,
        label: 'Duplicate',
        icon: 'control_point_duplicate',
        shortcut: 'Ctrl+D',
        order: 7,
        disabled: noSelectionFactory,
        run(runCtx) {
          duplicateSelected(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.context.node.divider0',
        slot: CONTEXT_MENU_SLOT.NODE,
        label: '',
        order: 9,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
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
        icon: 'call_split',
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

// ── Clipboard + Duplicate (D-044) ─────────────────────────────────

function getSelectedNodes(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
): readonly import('svg-engine/core').SvgNode[] {
  const sel = fromCtx(SelectionService, runCtx);
  const state = fromCtx(EditorStateService, runCtx);
  const ids = sel.selectedIds();
  if (ids.size === 0) return [];
  const out: import('svg-engine/core').SvgNode[] = [];
  for (const id of ids) {
    const node = findNodeById(state.document().root, id);
    if (node !== null) out.push(node);
  }
  return out;
}

function copySelected(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  const nodes = getSelectedNodes(runCtx, fromCtx);
  if (nodes.length === 0) return;
  fromCtx(ClipboardService, runCtx).copy(nodes);
}

function cutSelected(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  // Copy then delete — gives the user the standard cut behavior
  // (clipboard populated, document loses the cut nodes). Two undo
  // entries (one for delete; copy is non-undoable as it only mutates
  // ClipboardService). Acceptable trade-off — wrapping in a compound
  // command would couple `edit` to a new command type for marginal
  // ergonomic gain.
  copySelected(runCtx, fromCtx);
  deleteSelected(runCtx, fromCtx);
}

function pasteFromClipboard(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  const clipboard = fromCtx(ClipboardService, runCtx);
  const nodes = clipboard.paste();
  if (nodes.length === 0) return;
  const state = fromCtx(EditorStateService, runCtx);
  const bus = fromCtx(CommandBus, runCtx);
  const rootId = state.document().root.id;
  // Insert each clone into the root. Caller (or a future "paste at
  // selection" enhancement) could insert into a focused group instead.
  for (const node of nodes) {
    bus.dispatch(new InsertNodeCommand(rootId, node));
  }
  // Select the newly-pasted nodes so subsequent operations target them
  // (matches the convention of every professional editor).
  const sel = fromCtx(SelectionService, runCtx);
  sel.selectMany(nodes.map((n) => n.id));
}

function duplicateSelected(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  const sel = fromCtx(SelectionService, runCtx);
  const ids = Array.from(sel.selectedIds());
  if (ids.length === 0) return;
  const bus = fromCtx(CommandBus, runCtx);
  const cmd = new DuplicateNodeCommand(ids);
  bus.dispatch(cmd);
  // Select the new duplicates so the user can continue editing them
  // (Figma / Illustrator convention — after Ctrl+D the selection moves
  // to the duplicate).
  const newIds = cmd.getInsertedIds();
  if (newIds.length > 0) sel.selectMany(newIds);
}

// ── File menu action implementations ──────────────────────────────
// Browser-native I/O so the plugin stays in `edit` (no Material dep).
// Each function defends against SSR / non-browser contexts so the
// plugin can still register on the server (handlers just no-op).

function newDocument(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  // Confirm before discarding work — only when document is non-empty.
  // Avoid the prompt on a fresh editor where confirmation feels noisy.
  if (typeof window !== 'undefined') {
    const state = fromCtx(EditorStateService, runCtx);
    const root = state.document().root;
    const hasContent = root.type === 'group' && root.children.length > 0;
    if (hasContent) {
      const ok = window.confirm('Discard the current document and start fresh?');
      if (!ok) return;
    }
  }
  // resetDocument() with no arg creates an empty document; history.clear()
  // wipes undo/redo so the user can't undo back into the discarded state.
  // Viewport + selection reset mirror what applyTemplate() does in the
  // libraries panel — without them the user is left with a stale pan/zoom
  // (likely off-canvas, since the new doc starts at origin) and selection
  // markers pointing at node ids that no longer exist.
  fromCtx(EditorStateService, runCtx).resetDocument();
  fromCtx(HistoryService, runCtx).clear();
  fromCtx(ViewportService, runCtx).reset();
  fromCtx(SelectionService, runCtx).clear();
}

function importSvgFromFile(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  if (typeof document === 'undefined') return;
  // Programmatic <input type="file"> — no UI scaffolding required.
  // Pattern matches what `/svg-viewer` route does (browser-native flow,
  // works without Material).
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.svg,image/svg+xml';
  input.style.display = 'none';
  input.addEventListener(
    'change',
    () => {
      const file = input.files?.[0];
      input.remove();
      if (file === undefined || file === null) return;
      void file.text().then((text) => {
        const result = svgImporter.import(text);
        if (!result.ok) {
          if (typeof window !== 'undefined') window.alert(`Import failed: ${result.error}`);
          return;
        }
        fromCtx(EditorStateService, runCtx).resetDocument(result.document);
        fromCtx(HistoryService, runCtx).clear();
        // Same reasoning as newDocument(): the imported doc has a fresh
        // viewBox, so any prior pan/zoom is meaningless. Selection from
        // the discarded document is also stale.
        fromCtx(ViewportService, runCtx).reset();
        fromCtx(SelectionService, runCtx).clear();
        if (result.warnings.length > 0 && typeof console !== 'undefined') {
          console.warn(`[SVGEngine] Import warnings:\n${result.warnings.join('\n')}`);
        }
      });
    },
    { once: true },
  );
  document.body.appendChild(input);
  input.click();
}

async function exportAndDownload(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
  format: 'svg' | 'png',
): Promise<void> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const state = fromCtx(EditorStateService, runCtx);
  const docRaw = state.document();
  // **Critical fix (bug)**: merge runtime-derived defs (gradients,
  // patterns, effects, chains, clipPaths, masks) with the document's
  // round-trip `defs` field BEFORE handing to the exporter. Without
  // this, shapes with `fill="url(#gradId)"` exported as transparent
  // because the `<linearGradient>` definition only lived in the
  // editor's runtime registries, not in `state.document().defs`.
  // The renderer composes these via `<svge-editor>.resolvedDefs()`,
  // but the exporter path skipped the composition — the only consumer
  // of `state.document()` that needed defs merged. Centralized via
  // `ActiveDefsService` so renderer + exporter stay in sync.
  const activeDefs = fromCtx(ActiveDefsService, runCtx);
  const doc = { ...docRaw, defs: activeDefs.buildExportDefs(docRaw.defs) };
  const exporter = format === 'svg' ? svgExporter : pngExporter;
  // `Exporter.export` may return `string` (SVG) or `Promise<string | Blob>`
  // (PNG). Normalize both branches into a Blob for download.
  let output: string | Blob;
  try {
    const result = exporter.export(doc);
    output = typeof result === 'string' ? result : await result;
  } catch (err) {
    if (typeof window !== 'undefined')
      window.alert(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const blob = output instanceof Blob ? output : new Blob([output], { type: exporter.mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `untitled.${exporter.extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Defer revoke so the browser has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
