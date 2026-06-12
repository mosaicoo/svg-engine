import { computed, type Injector, type ProviderToken, type Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  CommandBus,
  EditorStateService,
  findNodeById,
  type ImageNode,
  isSmartObject,
  type NodeId,
  SetPropertyCommand,
} from 'svg-engine/core';
import {
  type EditorPlugin,
  MENU_SLOT,
  MenuContributionRegistry,
  PLUGIN_API_VERSION,
  type MenuContributionContext,
  SelectionService,
  ShortcutRegistry,
  type ShortcutContext,
  TraceImageCommand,
  TraceProgressService,
} from 'svg-engine/edit';

import { SvgeAboutDialogService } from '../about-dialog';
import { SvgeFindReplaceDialogService } from '../find-replace-dialog';
import { SvgePluginManagerDialogService } from '../plugin-manager-dialog';
import { SvgeSmartObjectEditorDialogService } from '../smart-object-dialog';
import { SvgeSvgSourceDialogService } from '../svg-source-dialog';
import { SvgeTraceImageDialogService, type TraceImageDialogResult } from '../trace-image-dialog';
import { SvgeWorkspaceSettingsDialogService } from '../workspace-settings';

/**
 * **`builtinUiMenuContributionsPlugin`** — D-044 (UI controls full-functionality follow-up).
 *
 * Sibling plugin to `builtinMenuContributionsPlugin` (in `svg-engine/edit`)
 * for menu items that **require Material dialog infrastructure** —
 * specifically `MatDialog` from `@angular/material/dialog`. The edit-side
 * plugin cannot import these (D-017 headless boundary). This plugin
 * lives in `svg-engine/ui` where Material is allowed.
 *
 * **What's included**:
 *
 * | Slot         | Item                  | Action                                                  |
 * | ------------ | --------------------- | ------------------------------------------------------- |
 * | `menu.file`  | View Source…          | Opens `<svge-svg-source-dialog>` via MatDialog          |
 * | `menu.file`  | Workspace Settings…   | Opens `<svge-workspace-settings>` via MatDialog         |
 *
 * **Why a separate plugin** instead of merging into the edit-side one:
 *
 * - **D-017**: `edit` is forbidden from importing `@angular/material`.
 *   `MatDialog` lives there, so any item that opens a dialog cannot
 *   live in the edit-side plugin.
 * - **Opt-in independence**: consumers in headless mode (Modo 1 D-037)
 *   never install this — they don't have Material loaded at all.
 *   Consumers using the shells install both edit + ui plugins together.
 *
 * **Multi-editor (D-042/D-043/D-044)**: `run()` handlers receive
 * `MenuContributionContext` and resolve `MatDialog` from the consumer
 * injector. **Critically**, the opened dialog is wired with
 * `MatDialogConfig.injector = runCtx.injector` so the dialog
 * component's `inject(EditorStateService)` (and any other service
 * lookup) resolves from the **active editor scope** — not from the
 * overlay's root injector. Without that wiring the dialog would show
 * the root `EditorStateService` (empty document) instead of the
 * route-scoped one (with the actual shapes), which was the symptom
 * observed when the dialog first shipped — the SVG body came back
 * empty even though the canvas had content. Same defect class as
 * `SvgeContextMenuService` before its parent-injector fix.
 *
 * **Future items** for this plugin (registered as deferred):
 * - Export With Options… (dialog with format chooser + dimensions —
 *   *probably superseded by the D-077 AssetExportPanel*, which covers
 *   format + scale + batch persistence as a UI panel)
 *
 * **Items moved here from the edit-side plugin**:
 * - **Help ▸ About SVGEngine** — was an `alert()` in the edit-side
 *   plugin (D-017 blocks Material there). Now opens the
 *   `<svge-about-dialog>` Material dialog through
 *   `SvgeAboutDialogService` (D-044 follow-up, autonomous round).
 *
 * **Opt-in**: like other built-in plugins, consumers explicitly
 * provision via `provideSvgEnginePlugin(builtinUiMenuContributionsPlugin)`.
 */
export const builtinUiMenuContributionsPlugin: EditorPlugin = {
  id: 'svge.builtin.ui-menu-contributions',
  name: 'Built-in UI menu contributions (dialogs) (D-044)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const reg = ctx.injector.get(MenuContributionRegistry);

    // D-042/D-043 lazy resolution — mirrors the edit-side plugin's
    // `fromCtx` pattern so handlers reach the active editor scope.
    const fromCtx = <T>(token: ProviderToken<T>, runCtx?: MenuContributionContext): T =>
      (runCtx?.injector ?? ctx.injector).get(token);

    // ── File ▸ View Source… ──────────────────────────────────────
    // **D-085** — order 50: after the Export submenu (40), before
    // Optimize… (60).
    ctx.track(
      reg.register({
        id: 'svge.builtin.ui.file.view-source',
        slot: MENU_SLOT.FILE,
        label: 'View Source…',
        icon: 'code',
        order: 50,
        run(runCtx) {
          // Delegate to SvgeSvgSourceDialogService — single source of
          // truth for "how to open the source dialog" (config +
          // injector wiring). Custom routes use the same service so
          // both paths stay aligned automatically.
          const service = fromCtx(SvgeSvgSourceDialogService, runCtx);
          service.open(runCtx?.injector ?? ctx.injector);
        },
      }),
    );

    // ── Window ▸ Workspace ▸ Workspace Settings… (D-085) ─────────
    // **Relocated** from the File menu to Window ▸ Workspace (Option B —
    // workspace/panel concerns live under Window). The "Workspace ▶"
    // parent + its roadmap siblings (Keyboard Shortcuts…, Reset
    // Workspace) are registered by `builtinRoadmapMenuPlugin`. Id kept
    // for backward compat.
    ctx.track(
      reg.register({
        id: 'svge.builtin.ui.file.workspace-settings',
        parentId: 'svge.window.workspace',
        slot: MENU_SLOT.WINDOW,
        label: 'Workspace Settings…',
        icon: 'tune',
        order: 10,
        run(runCtx) {
          // Delegate to SvgeWorkspaceSettingsDialogService — same
          // centralization rationale as View Source: dialog config +
          // scope-aware injector wiring live in one place so every
          // call site stays aligned automatically.
          const service = fromCtx(SvgeWorkspaceSettingsDialogService, runCtx);
          service.open(runCtx?.injector ?? ctx.injector);
        },
      }),
    );

    // ── Tools ▸ Plugins ▸ Manage Plugins… (D-083 / D-085) ─────────
    //
    // Opens <svge-plugin-manager-dialog> — the Material dialog wrapper
    // around <svge-plugin-manager>. Lives here (not edit-side) because it
    // needs MatDialog (D-017). **Relocated** from File to Tools ▸ Plugins
    // (Option B). The "Plugins ▶" parent + roadmap siblings (Install
    // Plugin…, Enable / Disable, Developer Mode) are registered by
    // `builtinRoadmapMenuPlugin`. Id kept for backward compat. Always
    // enabled — managing plugins never depends on selection/document.
    //
    // **Mechanism, not policy** (D-083): this just surfaces the manager.
    // A consumer that wants to restrict who sees it omits this plugin (or
    // overrides the entry) and mounts the manager behind its own auth.
    ctx.track(
      reg.register({
        id: 'svge.builtin.ui.file.manage-plugins',
        parentId: 'svge.tools.plugins',
        slot: MENU_SLOT.TOOLS,
        label: 'Manage Plugins…',
        icon: 'extension',
        order: 10,
        run(runCtx) {
          const service = fromCtx(SvgePluginManagerDialogService, runCtx);
          service.open(runCtx?.injector ?? ctx.injector);
        },
      }),
    );

    // ── Help ▸ About SVG Studio ──────────────────────────────────
    //
    // **Moved here from the edit-side plugin** — that one could only
    // call `alert()` because D-017 blocks Material in edit. Now opens
    // <svge-about-dialog> via SvgeAboutDialogService — same Material
    // chrome (dialog-shell + drag/resize + focus trap + Close X) as
    // every other dialog in the editor. Uses the 'sm' bucket because
    // the content is tiny (version + tagline + GitHub link).
    //
    // **D-085** — label "About SVGEngine" → "About SVG Studio" (engine is
    // the library; Studio is the product). **Same id**
    // (`svge.builtin.help.about`) so consumers that wired their own About
    // via id override still match — they just need to install this plugin
    // AFTER the edit-side one (default order in playground/svg-studio).
    ctx.track(
      reg.register({
        id: 'svge.builtin.help.about',
        slot: MENU_SLOT.HELP,
        label: 'About SVG Studio',
        icon: 'info',
        order: 10,
        run(runCtx) {
          const service = fromCtx(SvgeAboutDialogService, runCtx);
          service.open(runCtx?.injector ?? ctx.injector);
        },
      }),
    );

    // ── D-066 — Object ▸ Trace Image… (with Material dialog) ─────
    //
    // Wires the D-062d TraceImageCommand into the menu chrome with
    // a proper options dialog (threshold/tolerance/minPoints sliders
    // + hide-source checkbox) instead of the hardcoded-defaults
    // version that briefly lived in the edit-side plugin (D-065
    // follow-up, removed in D-066). Status-bar feedback comes
    // from TraceProgressService.start()/stop() wrapped around the
    // async prepare.
    //
    // **Disabled factory**: requires EXACTLY one selected node AND
    // that node must be type 'image'. Multi-select would be ambiguous
    // ("which image?"); zero-select obviously can't trace.
    //
    // **Shortcut Ctrl+Alt+T**: registered side-by-side so the same
    // resolver is reused. Avoids the temptation to push the shortcut
    // into edit-side (which can't open Material dialogs).
    const noImageSelectionFactory = (injector: Injector): Signal<boolean> => {
      const selection = injector.get(SelectionService);
      const state = injector.get(EditorStateService);
      return computed(() => {
        const ids = Array.from(selection.selectedIds());
        if (ids.length !== 1) return true;
        const node = findNodeById(state.document().root, ids[0]!);
        return node === null || node.type !== 'image';
      });
    };
    const openTraceImageDialog = async (injector: Injector): Promise<void> => {
      const selection = injector.get(SelectionService);
      const ids = Array.from(selection.selectedIds());
      if (ids.length !== 1) return;
      const imageNodeId = ids[0]! as NodeId;
      const state = injector.get(EditorStateService);
      const node = findNodeById(state.document().root, imageNodeId);
      if (node === null || node.type !== 'image') return;

      const dialogSvc = injector.get(SvgeTraceImageDialogService);
      const ref = dialogSvc.open(imageNodeId, injector);
      const result: TraceImageDialogResult | null | undefined = await firstValueFrom(
        ref.afterClosed(),
      );
      if (result == null) return; // user cancelled

      // Status-bar "Tracing…" pill: start before the async prepare
      // and stop in finally (success OR failure). Without try/finally
      // a thrown error from prepare would leave the counter stuck.
      const progress = injector.get(TraceProgressService);
      const cmd = new TraceImageCommand(imageNodeId, {
        threshold: result.threshold,
        tolerance: result.tolerance,
        minPoints: result.minPoints,
      });
      progress.start();
      try {
        await cmd.prepare({ state });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[Trace Image] prepare failed:', msg);
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(`Trace Image failed: ${msg}`);
        }
        progress.stop();
        return;
      }

      const bus = injector.get(CommandBus);
      const dispatchResult = bus.dispatch(cmd);
      progress.stop();
      if (!dispatchResult.ok) {
        console.warn('[Trace Image] dispatch failed:', dispatchResult.error);
        return;
      }

      // Optional hide of the source image — single SetPropertyCommand
      // toggling metadata.visible. Easy to revert via undo or via the
      // Layers panel eye icon.
      if (result.hideSource) {
        const imageNode = node as ImageNode;
        bus.dispatch(
          new SetPropertyCommand<ImageNode, 'metadata'>(imageNodeId, 'metadata', {
            ...imageNode.metadata,
            visible: false,
          }),
        );
      }

      // Select the new group for instant visual confirmation.
      const groupId = cmd.getInsertedGroupId();
      if (groupId !== null) {
        selection.select(groupId);
      }
    };
    // **D-085** — Trace Image nested under the Object ▸ Convert submenu
    // (parent registered by the edit-side menu plugin as
    // `svge.builtin.object.convert`). First child (order 10), above the
    // Convert to Layer / Convert Layer to Group items (20 / 30).
    ctx.track(
      reg.register({
        id: 'svge.builtin.ui.object.trace-image',
        parentId: 'svge.builtin.object.convert',
        slot: MENU_SLOT.OBJECT,
        label: 'Trace Image…',
        icon: 'auto_fix_normal',
        tooltip: 'Convert the selected image to vector paths',
        shortcut: 'Ctrl+Alt+T',
        order: 10,
        disabled: noImageSelectionFactory,
        run(runCtx) {
          void openTraceImageDialog(runCtx?.injector ?? ctx.injector);
        },
      }),
    );

    // ── D-066 — Ctrl+Alt+T shortcut (same handler as menu entry) ─
    //
    // Lives in the UI plugin because the handler opens a Material
    // dialog — same constraint as the menu entry. ShortcutRegistry
    // itself is in svg-engine/edit (we just import it here); the
    // shortcut runs whenever its combo fires regardless of focus
    // (ShortcutService handles editable-target suppression).
    const shortcuts = ctx.injector.get(ShortcutRegistry);
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.trace-image',
        combo: 'Ctrl+Alt+T',
        description: 'Open Trace Image dialog for the selected image',
        run(event, runCtx?: ShortcutContext) {
          event.preventDefault();
          void openTraceImageDialog(runCtx?.injector ?? ctx.injector);
        },
      }),
    );

    // ── D-070 — Edit ▸ Find & Replace… + Ctrl+H shortcut ─────────
    //
    // Always-enabled (no selection requirement — the dialog searches
    // the whole document). Ctrl+H is the canonical bind in
    // browsers/IDEs/Word/etc. Stays consistent with the rest of the
    // built-ins by living in svg-engine/ui (the dialog is Material,
    // which the edit-side plugin can't import per D-017).
    const openFindReplaceDialog = (runCtx?: MenuContributionContext): void => {
      const service = fromCtx(SvgeFindReplaceDialogService, runCtx);
      service.open(runCtx?.injector ?? ctx.injector);
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.ui.edit.find-replace',
        slot: MENU_SLOT.EDIT,
        label: 'Find & Replace…',
        icon: 'find_replace',
        shortcut: 'Ctrl+H',
        // After the document-mutation actions (Undo/Redo/Cut/Copy/
        // Paste/Duplicate/Delete) but before grouping/SelectAll —
        // matches Illustrator/Inkscape convention.
        order: 75,
        run(runCtx) {
          openFindReplaceDialog(runCtx);
        },
      }),
    );
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.find-replace',
        combo: 'Ctrl+H',
        description: 'Open Find & Replace dialog',
        run(event, runCtx?: ShortcutContext) {
          event.preventDefault();
          openFindReplaceDialog(runCtx);
        },
      }),
    );

    // ── D-074 — Object ▸ Smart Object ▸ Edit Contents… ──────────
    //
    // Sibling to the edit-side `Replace Contents` and `Rasterize`
    // entries (which live in `builtinMenuContributionsPlugin`). Edit
    // Contents needs a Material dialog (`<svge-smart-object-editor-dialog>`)
    // for the source-text editor, so it lives here per the D-017
    // boundary. The other smart-object actions don't need dialogs and
    // stayed on the edit side.
    //
    // Placed inside the existing `svge.builtin.object.smart-object`
    // submenu via `parentId` so the user sees Convert / Edit / Replace
    // / Rasterize grouped consistently — both plugins must be
    // installed for the full set to render (consumers using the shell
    // routes install both).
    const notOnSmartObjectFactory = (injector: Injector): Signal<boolean> => {
      const sel = injector.get(SelectionService);
      const state = injector.get(EditorStateService);
      return computed(() => {
        const id = sel.focusId();
        if (id === null) return true;
        const node = findNodeById(state.document().root, id);
        return node === null || !isSmartObject(node);
      });
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.ui.object.smart-object.edit',
        parentId: 'svge.builtin.object.smart-object',
        slot: MENU_SLOT.OBJECT,
        // Order 25 sits between Convert (10) and Replace (30) so the
        // Edit action reads as "the natural follow-up to creating".
        order: 25,
        label: 'Edit Contents…',
        icon: 'edit_note',
        disabled: notOnSmartObjectFactory,
        run(runCtx) {
          const selection = fromCtx(SelectionService, runCtx);
          const id = selection.focusId();
          if (id === null) return;
          const service = fromCtx(SvgeSmartObjectEditorDialogService, runCtx);
          service.open(id, runCtx?.injector ?? ctx.injector);
        },
      }),
    );
  },
};
