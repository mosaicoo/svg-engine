import { computed, type Injector, type ProviderToken, type Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  CommandBus,
  DEFAULT_OFFSET_DISTANCE,
  DEFAULT_SIMPLIFY_TOLERANCE,
  EditorStateService,
  findNodeById,
  type ImageNode,
  isSmartObject,
  type NodeId,
  OffsetPathCommand,
  type Point,
  ResizeNodesCommand,
  RotateNodesCommand,
  SetPropertyCommand,
  SimplifyPathCommand,
  SkewNodesCommand,
  type Transform,
} from 'svg-engine/core';
import {
  type EditorPlugin,
  getRenderedNodeBBox,
  getRenderedParentMatrix,
  LayersService,
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
import { SvgeCommandPaletteService } from '../command-palette';
import { SvgeFindReplaceDialogService } from '../find-replace-dialog';
import { SvgeKeyboardShortcutsDialogService } from '../keyboard-shortcuts-dialog';
import { SvgeNumberPromptDialogService } from '../number-prompt-dialog';
import { SvgePluginManagerDialogService } from '../plugin-manager-dialog';
import { SvgeSmartObjectEditorDialogService } from '../smart-object-dialog';
import { SvgeSvgSourceDialogService } from '../svg-source-dialog';
import { SvgeTraceImageDialogService, type TraceImageDialogResult } from '../trace-image-dialog';
import { SvgeTransformDialogService, type TransformDialogMode } from '../transform-dialog';
import { SvgeWorkspaceSettingsDialogService } from '../workspace-settings';
import { WorkspaceLayoutService } from '../workspace-layout';

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

    // ── Window ▸ Workspace ▸ Keyboard Shortcuts… (D-087) ─────────
    //
    // **Ships** the roadmap placeholder `svge.roadmap.window.workspace.
    // shortcuts` (removed from `builtinRoadmapMenuPlugin`). Opens
    // <svge-keyboard-shortcuts-dialog> — the central command + shortcut
    // manager (view / rebind / unbind / reset, conflict warnings). Lives
    // here (not edit-side) because the manager is a Material dialog
    // (D-017). Always enabled — managing shortcuts never depends on
    // selection/document. Order 20 sits between Workspace Settings (10)
    // and the Reset Workspace roadmap leaf (30), matching the slot the
    // placeholder occupied.
    ctx.track(
      reg.register({
        id: 'svge.builtin.ui.window.keyboard-shortcuts',
        parentId: 'svge.window.workspace',
        slot: MENU_SLOT.WINDOW,
        label: 'Keyboard Shortcuts…',
        icon: 'keyboard',
        order: 20,
        run(runCtx) {
          const service = fromCtx(SvgeKeyboardShortcutsDialogService, runCtx);
          service.open(runCtx?.injector ?? ctx.injector);
        },
      }),
    );

    // ── Window ▸ Workspace ▸ Reset Workspace (D-088) ──────────────
    //
    // **Ships** the roadmap placeholder `svge.roadmap.window.workspace.reset`
    // (removed from `builtinRoadmapMenuPlugin`). Reverts the **panel LAYOUT**
    // (panel-group tab sides + shell-pro rail collapse) to its defaults via
    // `WorkspaceLayoutService`. Deliberately distinct from the Workspace
    // **Settings** dialog's "Reset defaults" (which reverts canvas settings:
    // background / page / grid / rulers) and from the document (untouched).
    // Lives here (not edit-side) because the layout state is a UI concern.
    // Always enabled — resetting the layout never depends on selection /
    // document. Order 30 keeps the placeholder's original slot (after
    // Workspace Settings 10 and Keyboard Shortcuts 20).
    ctx.track(
      reg.register({
        id: 'svge.builtin.ui.window.reset-workspace',
        parentId: 'svge.window.workspace',
        slot: MENU_SLOT.WINDOW,
        label: 'Reset Workspace',
        icon: 'restart_alt',
        order: 30,
        run(runCtx) {
          fromCtx(WorkspaceLayoutService, runCtx).reset();
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
        category: 'Object',
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
        category: 'Edit',
        run(event, runCtx?: ShortcutContext) {
          event.preventDefault();
          openFindReplaceDialog(runCtx);
        },
      }),
    );

    // ── Tools ▸ Command Palette… + Ctrl+Shift+P shortcut ─────────
    //
    // **Ships** the roadmap placeholder `svge.roadmap.tools.command-palette`
    // (removed from `builtinRoadmapMenuPlugin`). Opens
    // `<svge-command-palette-dialog>` — a keyboard-first fuzzy search over
    // EVERY registered menu/toolbar command (the MenuContributionRegistry),
    // run by Enter or click. Lives here (not edit-side) because it's a
    // Material dialog (D-017). **Distinct from the SVG Studio NLU palette**
    // (Ctrl+K, natural language): this searches command NAMES, with no
    // NLU/ML dependency, and Ctrl+Shift+P was free (no shortcut clash).
    // Always enabled — the palette itself never depends on selection /
    // document (each command keeps its own disabled state, shown greyed
    // inside the list).
    const openCommandPalette = (runCtx?: MenuContributionContext): void => {
      const service = fromCtx(SvgeCommandPaletteService, runCtx);
      service.open(runCtx?.injector ?? ctx.injector);
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.ui.tools.command-palette',
        slot: MENU_SLOT.TOOLS,
        label: 'Command Palette…',
        icon: 'terminal',
        tooltip: 'Search and run any command',
        shortcut: 'Ctrl+Shift+P',
        // Order 5 — first in the Tools menu (above Quick Search 20 and
        // the Plugins submenu), matching the roadmap placeholder's slot.
        order: 5,
        run(runCtx) {
          openCommandPalette(runCtx);
        },
      }),
    );
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.command-palette',
        combo: 'Ctrl+Shift+P',
        description: 'Open the Command Palette',
        category: 'View',
        run(event, runCtx?: ShortcutContext) {
          event.preventDefault();
          openCommandPalette(runCtx);
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

    // ── D-093 — Object ▸ Transform ▸ Rotate… / Scale… / Skew… ───────
    //
    // Ship the roadmap placeholders `svge.roadmap.object.transform.{rotate,
    // scale,skew}` (removed from `builtinRoadmapMenuPlugin`). Each opens an
    // Illustrator-style parameter dialog (`<svge-transform-dialog>`) and
    // dispatches the matching BATCH command, so a multi-selection transforms
    // as a rigid group about the COMBINED-bbox centre — same convention as
    // the canvas handles. Here (not edit-side) because they need a Material
    // dialog (D-017). Parented under the Transform submenu
    // (`svge.builtin.object.flip`, registered edit-side, with Flip H/V 10/20
    // and Reset Transform 60). Skew is the brand-new D-093 core command;
    // Rotate/Scale reuse the existing Rotate/Resize batch commands.
    const selectionEmptyFactory = (injector: Injector): Signal<boolean> => {
      const selection = injector.get(SelectionService);
      return computed(() => Array.from(selection.selectedIds()).length === 0);
    };
    const deg2rad = (deg: number): number => (deg * Math.PI) / 180;
    // tan(±90°) diverges — clamp so a skew can never collapse the shape.
    const clampSkewDeg = (deg: number): number => Math.max(-89, Math.min(89, deg));
    // Combined-bbox centre (doc coords) + per-node ancestor matrices, read
    // from the live `<svge-renderer>` — the proven Flip/Align pattern. The
    // three batch Entry types are structurally identical ({id, parentMatrix}).
    const collectTransformContext = (
      injector: Injector,
    ): { entries: { id: NodeId; parentMatrix: Transform | null }[]; center: Point } | null => {
      const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
      if (svg === null) return null;
      const sel = injector.get(SelectionService);
      const layers = injector.get(LayersService);
      const entries: { id: NodeId; parentMatrix: Transform | null }[] = [];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const id of sel.selectedIds()) {
        if (layers.isLocked(id)) continue;
        const bbox = getRenderedNodeBBox(svg, id);
        if (bbox === null) continue;
        entries.push({ id, parentMatrix: getRenderedParentMatrix(svg, id) });
        minX = Math.min(minX, bbox.x);
        minY = Math.min(minY, bbox.y);
        maxX = Math.max(maxX, bbox.x + bbox.width);
        maxY = Math.max(maxY, bbox.y + bbox.height);
      }
      if (entries.length === 0 || !Number.isFinite(minX)) return null;
      return { entries, center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } };
    };
    const openTransformDialog = async (
      mode: TransformDialogMode,
      runCtx: MenuContributionContext | undefined,
    ): Promise<void> => {
      const injector = runCtx?.injector ?? ctx.injector;
      const ref = injector.get(SvgeTransformDialogService).open(mode, injector);
      const result = await firstValueFrom(ref.afterClosed());
      if (result == null) return; // cancelled / degenerate (e.g. scale 0)
      const sel = collectTransformContext(injector);
      if (sel === null) return; // nothing selected / not rendered
      const bus = injector.get(CommandBus);
      switch (result.mode) {
        case 'rotate':
          bus.dispatch(new RotateNodesCommand(sel.entries, sel.center, deg2rad(result.angleDeg)));
          return;
        case 'scale':
          bus.dispatch(new ResizeNodesCommand(sel.entries, sel.center, result.sx, result.sy));
          return;
        case 'skew':
          bus.dispatch(
            new SkewNodesCommand(
              sel.entries,
              sel.center,
              deg2rad(clampSkewDeg(result.skewXDeg)),
              deg2rad(clampSkewDeg(result.skewYDeg)),
            ),
          );
          return;
      }
    };
    const TRANSFORM_ITEMS: readonly {
      readonly id: string;
      readonly mode: TransformDialogMode;
      readonly label: string;
      readonly icon: string;
      readonly tooltip: string;
      readonly order: number;
    }[] = [
      {
        id: 'svge.builtin.ui.object.transform.rotate',
        mode: 'rotate',
        label: 'Rotate…',
        icon: 'rotate_right',
        tooltip: 'Rotate the selection by an exact angle',
        order: 30,
      },
      {
        id: 'svge.builtin.ui.object.transform.scale',
        mode: 'scale',
        label: 'Scale…',
        icon: 'photo_size_select_large',
        tooltip: 'Scale the selection by an exact percentage',
        order: 40,
      },
      {
        id: 'svge.builtin.ui.object.transform.skew',
        mode: 'skew',
        label: 'Skew…',
        icon: 'transform',
        tooltip: 'Skew (shear) the selection by an exact angle',
        order: 50,
      },
    ];
    for (const item of TRANSFORM_ITEMS) {
      ctx.track(
        reg.register({
          id: item.id,
          parentId: 'svge.builtin.object.flip',
          slot: MENU_SLOT.OBJECT,
          label: item.label,
          icon: item.icon,
          tooltip: item.tooltip,
          order: item.order,
          disabled: selectionEmptyFactory,
          run(runCtx) {
            void openTransformDialog(item.mode, runCtx);
          },
        }),
      );
    }

    // ── D-093 — Path ▸ Simplify… / Offset Path… (parameter dialogs) ──
    //
    // Re-home the D-090 Path ▸ Simplify and Offset Path entries (removed
    // from `builtinRoadmapMenuPlugin`, where they dispatched with a HARDCODED
    // default and NO dialog). Each now prompts for its single numeric
    // parameter via `<svge-number-prompt-dialog>` before dispatching — the
    // missing "enter the amount" step every pro editor offers. Ids + orders
    // preserved (`svge.builtin.path.simplify` 60, `…offset` 70) so the Path
    // menu reads identically; only the run() gained a dialog (hence moved
    // here, where Material lives — D-017).
    const selectedPathIds = (injector: Injector): NodeId[] => {
      const sel = injector.get(SelectionService);
      const root = injector.get(EditorStateService).document().root;
      const out: NodeId[] = [];
      for (const id of sel.selectedIds()) {
        const node = findNodeById(root, id);
        if (node !== null && node.type === 'path') out.push(id);
      }
      return out;
    };
    const noPathSelectionFactory = (injector: Injector): Signal<boolean> =>
      computed(() => selectedPathIds(injector).length === 0);
    const openSimplifyDialog = async (
      runCtx: MenuContributionContext | undefined,
    ): Promise<void> => {
      const injector = runCtx?.injector ?? ctx.injector;
      const ids = selectedPathIds(injector);
      if (ids.length === 0) return;
      const ref = injector.get(SvgeNumberPromptDialogService).open(
        {
          icon: 'show_chart',
          title: 'Simplify',
          subtitle: 'Reduce anchor count while preserving the shape',
          label: 'Tolerance',
          unit: 'px',
          value: DEFAULT_SIMPLIFY_TOLERANCE,
          min: 0,
          step: 0.1,
          hint: 'Higher tolerance removes more anchors (smoother, less faithful). 0 keeps every point.',
        },
        injector,
      );
      const tolerance = await firstValueFrom(ref.afterClosed());
      if (tolerance == null) return;
      injector.get(CommandBus).dispatch(new SimplifyPathCommand(ids, tolerance));
    };
    const openOffsetDialog = async (runCtx: MenuContributionContext | undefined): Promise<void> => {
      const injector = runCtx?.injector ?? ctx.injector;
      const ids = selectedPathIds(injector);
      if (ids.length === 0) return;
      const ref = injector.get(SvgeNumberPromptDialogService).open(
        {
          icon: 'line_style',
          title: 'Offset Path',
          subtitle: 'Create a parallel contour inside or outside the path',
          label: 'Distance',
          unit: 'px',
          value: DEFAULT_OFFSET_DISTANCE,
          step: 1,
          hint: 'Positive offsets outward; negative offsets inward (inset).',
        },
        injector,
      );
      const distance = await firstValueFrom(ref.afterClosed());
      if (distance == null) return;
      injector.get(CommandBus).dispatch(new OffsetPathCommand(ids, distance));
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.path.simplify',
        slot: MENU_SLOT.PATH,
        label: 'Simplify…',
        icon: 'show_chart',
        order: 60,
        disabled: noPathSelectionFactory,
        run(runCtx) {
          void openSimplifyDialog(runCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.path.offset',
        slot: MENU_SLOT.PATH,
        label: 'Offset Path…',
        icon: 'line_style',
        order: 70,
        disabled: noPathSelectionFactory,
        run(runCtx) {
          void openOffsetDialog(runCtx);
        },
      }),
    );
  },
};
