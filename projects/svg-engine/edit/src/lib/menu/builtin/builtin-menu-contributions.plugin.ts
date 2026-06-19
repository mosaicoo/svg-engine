import { computed, type Injector, type ProviderToken, signal, type Signal } from '@angular/core';
import {
  ANIMATION_KEY,
  type BoundingBox,
  CommandBus,
  ConvertNodeToPathCommand,
  createGroup,
  createImage,
  CreateLayerCommand,
  DivideCommand,
  DuplicateNodeCommand,
  EditorStateService,
  EnsureDefaultPageCommand,
  ExcludeCommand,
  findNodeById,
  findParent,
  type FlipAxis,
  FlipNodeCommand,
  generateNodeId,
  getNodeBBox,
  getNodesWorldBBox,
  GroupSelectionCommand,
  HistoryService,
  AUTO_PARENT,
  InsertNodeCommand,
  IntersectCommand,
  isLayer,
  isPage,
  isSmartObject,
  MakeLayerCommand,
  MakeSmartObjectCommand,
  multiply,
  type NodeId,
  type Point,
  RasterizeNodeCommand,
  RemoveNodeCommand,
  ReorderNodeCommand,
  type ReorderDirection,
  RestoreSnapshotCommand,
  SetPropertyCommand,
  SnapshotsService,
  SubtractCommand,
  type SvgDocument,
  type SvgNode,
  type TextNode,
  type Transform,
  translate,
  UngroupCommand,
  UnionCommand,
  UnmakeLayerCommand,
  withSmartObjectFlag,
} from 'svg-engine/core';
import {
  gunzipText,
  gzipText,
  pngExporter,
  renderPng,
  svgExporter,
  svgImporter,
  svgzExporter,
} from 'svg-engine/io';
import { OptimizeCommand, OptimizerRegistry } from 'svg-engine/optimize';
import { ViewportService } from 'svg-engine/render';

import {
  type AlignAxis,
  AlignmentService,
  type DistributeAxis,
  KeyObjectService,
  type NodeBBox,
  resolveAlignReference,
} from '../../alignment';
import { AnimationService } from '../../animation/animation.service';
import { ClipboardService } from '../../clipboard/clipboard.service';
import { RecentFilesService } from '../../recent-files/recent-files.service';
import { SVGE_HELP_LINKS, type SvgeHelpLinks } from '../../help';
import { makeClipMask, releaseClipMask, topmostSelected } from '../../clip-mask/clip-mask-actions';
import { SelectSameService } from '../../find-replace/select-same.service';
import { getRenderedNodeBBox, getRenderedNodeLocalBBox } from '../../geometry/node-bbox';
import {
  ImportPlacementService,
  placementBounds,
} from '../../import-placement/import-placement.service';
import {
  insertRasterImageFromHref,
  pickAndInsertRasterImage,
} from '../../import-image/raster-image-import';
import { ImportSettingsService } from '../../import-settings/import-settings.service';
import { LayersService } from '../../layers/layers.service';
import { ActiveDefsService } from '../../library/active-defs.service';
import { PANEL_ID, PanelHostService } from '../../panel/panel-host.service';
import { ActivePageService } from '../../pages/active-page.service';
import { PagesService } from '../../pages/pages.service';
import { type EditorPlugin } from '../../plugin/plugin';
import { PLUGIN_API_VERSION } from '../../plugin/plugin';
import { SelectionService } from '../../selection/selection.service';
import { SmartObjectActionsService } from '../../smart-object-actions/smart-object-actions.service';
import { FullscreenService } from '../../fullscreen/fullscreen.service';
import { SnapService } from '../../snap/snap.service';
import { WorkspaceService } from '../../workspace/workspace.service';
import {
  parseWorkspace,
  serializeWorkspace,
  type WorkspaceConfigState,
  type WorkspaceEditorState,
} from '../../workspace/workspace-file';
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
      const state = injector.get(EditorStateService);
      return computed(() => {
        const ids = selection.selectedIds();
        if (ids.size < 2) return true;
        // Layers and Pages are top-level only — they can't be grouped
        // (GroupSelectionCommand rejects them as a hard guard). Disable the
        // item up-front when any is selected so the user sees it's not
        // allowed, instead of Ctrl+G / Object ▸ Group being a silent no-op.
        const root = state.document().root;
        for (const id of ids) {
          const node = findNodeById(root, id);
          if (node !== null && (isLayer(node) || isPage(node))) return true;
        }
        return false;
      });
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
    // Align needs ≥ 1 selected node. A single node aligns to the active
    // page ("Align to Page" — Illustrator's "Align to Artboard"); ≥ 2
    // align relative to the selection. The only disabled case is an
    // empty selection. The run handler branches on count.
    const cantAlignFactory = (injector: Injector): Signal<boolean> => {
      const selection = injector.get(SelectionService);
      return computed(() => selection.selectedIds().size < 1);
    };
    // **D-094** — "Make Key Object" needs a focused node inside a multi-
    // selection (≥ 2). The focused (last-clicked) node becomes the fixed
    // alignment anchor; "Clear Key Object" is enabled only while one is set.
    const cantMakeKeyFactory = (injector: Injector): Signal<boolean> => {
      const selection = injector.get(SelectionService);
      return computed(() => {
        const ids = selection.selectedIds();
        if (ids.size < 2) return true;
        const focus = selection.focusId();
        return focus === null || !ids.has(focus);
      });
    };
    const noKeyObjectFactory = (injector: Injector): Signal<boolean> => {
      const keyObject = injector.get(KeyObjectService);
      return computed(() => !keyObject.hasKeyObject());
    };
    // D-065 — Distribute needs ≥ 3 nodes (2 nodes have nothing
    // "between" them to space; 3+ have at least one inner node to
    // redistribute). Matches the canDistribute computed used by the
    // dogfooded custom-editor.
    const cantDistributeFactory = (injector: Injector): Signal<boolean> => {
      const selection = injector.get(SelectionService);
      return computed(() => selection.selectedIds().size < 3);
    };
    // D-065 — Pathfinder needs ≥ 2 path-compatible nodes. The
    // commands auto-convert rect/ellipse/line/polygon/polyline →
    // path internally, so we just gate on count here; the run
    // handler skips groups/text/image-only selections by short-
    // circuiting at command-dispatch time.
    const cantPathfinderFactory = (injector: Injector): Signal<boolean> => {
      const selection = injector.get(SelectionService);
      return computed(() => selection.selectedIds().size < 2);
    };
    // D-066 — noImageSelectionFactory moved to
    // builtinUiMenuContributionsPlugin (same place as the Trace Image
    // menu entry that consumes it).

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
    // **D-115** — `File ▸ Open…`. Replaces the current document with a file
    // chosen from disk, dispatched by EXTENSION: `.svg` today, the editor's
    // proprietary format later (see `openFromFile`). Ctrl+O — the canonical
    // "open" shortcut — lives here now (it was previously a display hint on
    // Import ▸ SVG…, which is the additive "place into current doc" action).
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.open',
        slot: MENU_SLOT.FILE,
        label: 'Open…',
        icon: 'file_open',
        shortcut: 'Ctrl+O',
        order: 12,
        run(runCtx) {
          openFromFile(runCtx, fromCtx);
        },
      }),
    );
    // **D-136** — `File ▸ Open Recent ▶`. A REAL dynamic submenu backed by
    // `RecentFilesService` (replaces the roadmap placeholder removed from
    // `builtinRoadmapMenuPlugin`). The parent is always present + enabled; its
    // children are (re)registered reactively from the MRU list via the effect
    // below — one row per recent file (reopens by replaying the stored SVG),
    // plus a divider + "Clear Recent Files", or a single disabled
    // "No recent files" row when empty (so the submenu never collapses into a
    // dead leaf). The reopen lands in the editor that fired the item
    // (`runCtx.injector`); the shared `RecentFilesService` (root-scoped) is the
    // app-wide MRU, mirroring the color history.
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.open-recent',
        slot: MENU_SLOT.FILE,
        label: 'Open Recent',
        icon: 'history',
        order: 14,
        run() {
          /* submenu parent — the children carry the actions */
        },
      }),
    );
    {
      const recent = ctx.injector.get(RecentFilesService);
      // Constant signal for the always-disabled "No recent files" row.
      const emptyRowDisabled = signal(true);
      let recentChildHandles: { dispose(): void }[] = [];
      // Rebuild the submenu children from the current MRU. Driven by an explicit
      // observer (`recent.onChange`), NOT an Angular `effect`: an effect would
      // write the `MenuContributionRegistry` signal from inside change
      // detection (the menu-bar reads that same signal), which can spin CD into
      // a loop. This runs once now + only on `record`/`clear` (user actions,
      // off the render path), so the registry writes stay out of the reactive
      // graph. Reading `recent.files()` here is a plain read (no effect → no
      // tracking).
      const syncRecentChildren = (): void => {
        for (const handle of recentChildHandles) handle.dispose();
        recentChildHandles = [];
        const files = recent.files();
        if (files.length === 0) {
          recentChildHandles.push(
            reg.register({
              id: 'svge.builtin.file.open-recent.empty',
              parentId: 'svge.builtin.file.open-recent',
              slot: MENU_SLOT.FILE,
              label: 'No recent files',
              order: 0,
              disabled: emptyRowDisabled,
              run() {
                /* no-op placeholder */
              },
            }),
          );
          return;
        }
        files.forEach((file, index) => {
          recentChildHandles.push(
            reg.register({
              id: `svge.builtin.file.open-recent.item-${index}`,
              parentId: 'svge.builtin.file.open-recent',
              slot: MENU_SLOT.FILE,
              label: file.name,
              tooltip: file.name,
              icon: 'description',
              order: index,
              run(runCtx) {
                // Replay the stored SVG into the active editor; this also
                // re-records the file, moving it back to the top (MRU).
                openSvgText(runCtx, fromCtx, file.svg, file.name);
              },
            }),
          );
        });
        recentChildHandles.push(
          reg.register({
            id: 'svge.builtin.file.open-recent.divider',
            parentId: 'svge.builtin.file.open-recent',
            slot: MENU_SLOT.FILE,
            label: '',
            order: 9000,
            divider: true,
            run() {
              /* divider */
            },
          }),
        );
        recentChildHandles.push(
          reg.register({
            id: 'svge.builtin.file.open-recent.clear',
            parentId: 'svge.builtin.file.open-recent',
            slot: MENU_SLOT.FILE,
            label: 'Clear Recent Files',
            icon: 'delete_sweep',
            order: 9001,
            run(runCtx) {
              fromCtx(RecentFilesService, runCtx).clear();
            },
          }),
        );
      };
      syncRecentChildren();
      ctx.track({ dispose: recent.onChange(syncRecentChildren) });
      ctx.track({
        dispose: () => {
          for (const handle of recentChildHandles) handle.dispose();
        },
      });
    }
    // **D-085 / D-136** — divider after Open Recent, before the Import submenu.
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.divider1',
        slot: MENU_SLOT.FILE,
        label: '',
        order: 18,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    // ── File ▸ Import ▶ submenu (D-085) ─────────────────────────────
    // The existing real "Import SVG" becomes the first child ("SVG…").
    // Image / Smart Object / External Asset are roadmap children added
    // by `builtinRoadmapMenuPlugin`.
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.import-menu',
        slot: MENU_SLOT.FILE,
        label: 'Import',
        icon: 'folder_open',
        order: 20,
        run() {
          /* submenu parent — children drive the actual imports */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.import',
        parentId: 'svge.builtin.file.import-menu',
        slot: MENU_SLOT.FILE,
        label: 'SVG…',
        icon: 'description',
        // **D-115** — Ctrl+O moved to `File ▸ Open…` (the canonical "open
        // replaces the document" action); Import is the additive "place into
        // the current document" flow and no longer claims the shortcut.
        order: 10,
        run(runCtx) {
          importSvgFromFile(runCtx, fromCtx);
        },
      }),
    );
    // **D-117** — `File ▸ Import ▸ Image…`. Same action as `Insert ▸ Image…`
    // (one shared handler) — embeds a local raster file as an `<image>` sized to
    // its natural dimensions. Two entry points: "Insert" (add to document) and
    // "Import" (bring an external source in).
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.import-image',
        parentId: 'svge.builtin.file.import-menu',
        slot: MENU_SLOT.FILE,
        label: 'Image…',
        icon: 'image',
        order: 15,
        run(runCtx) {
          pickAndInsertRasterImage(runCtx?.injector);
        },
      }),
    );
    // **D-116** — `File ▸ Import ▸ From URL…`. Prompts for a web image URL,
    // detects SVG vs raster from the response, and imports it ADDITIVELY —
    // same downstream as Import ▸ SVG… (SVG) / an embedded `<image>` (raster).
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.import-url',
        parentId: 'svge.builtin.file.import-menu',
        slot: MENU_SLOT.FILE,
        label: 'From URL…',
        icon: 'link',
        order: 20,
        run(runCtx) {
          importFromUrl(runCtx, fromCtx);
        },
      }),
    );
    // **D-139** — `File ▸ Import ▸ Smart Object…`. Picks an SVG/SVGZ and embeds
    // it as a single Smart Object (D-074) — distinct from `Import ▸ SVG…` (loose
    // additive) and `Insert ▸ Smart Object…` (create from scratch). Replaces the
    // former roadmap placeholder.
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.import-smart-object',
        parentId: 'svge.builtin.file.import-menu',
        slot: MENU_SLOT.FILE,
        label: 'Smart Object…',
        icon: 'inventory_2',
        order: 30,
        run(runCtx) {
          importSvgFromFile(runCtx, fromCtx, importSmartObjectText);
        },
      }),
    );
    // **D-085** — divider after the (roadmap) Save / Save As… items.
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.divider2',
        slot: MENU_SLOT.FILE,
        label: '',
        order: 38,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    // ── File ▸ Save / Save As… (D-138) ──────────────────────────────
    // Workspace round-trip. In a browser (no File System Access API) both are
    // downloads, so the meaningful axis is FORMAT: Save → readable `.svge`
    // JSON; Save As… → gzipped `.svgez`. No keyboard shortcut is wired yet
    // (Ctrl+Shift+S already drives Take Snapshot — D-073 — and Ctrl+S needs
    // browser-intercept handling; deferred to a focused follow-up).
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.save',
        slot: MENU_SLOT.FILE,
        label: 'Save',
        icon: 'save',
        tooltip: 'Save workspace (.svge — readable JSON)',
        shortcut: 'Ctrl+S',
        order: 30,
        run(runCtx) {
          void saveWorkspace(runCtx, fromCtx, false);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.save-as',
        slot: MENU_SLOT.FILE,
        label: 'Save As… (Compressed)',
        icon: 'save_as',
        tooltip: 'Save compressed workspace (.svgez — gzipped)',
        order: 32,
        run(runCtx) {
          void saveWorkspace(runCtx, fromCtx, true);
        },
      }),
    );
    // ── File ▸ Export ▶ submenu (D-085) ─────────────────────────────
    // SVG / Animated SVG (SMIL) / PNG are real; Export Selection /
    // Artboard / Batch are roadmap children added by the roadmap plugin.
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.export-menu',
        slot: MENU_SLOT.FILE,
        label: 'Export',
        icon: 'download',
        order: 40,
        run() {
          /* submenu parent — children drive the actual exports */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.export-svg',
        parentId: 'svge.builtin.file.export-menu',
        slot: MENU_SLOT.FILE,
        label: 'SVG…',
        icon: 'download',
        order: 10,
        run(runCtx) {
          void exportAndDownload(runCtx, fromCtx, 'svg');
        },
      }),
    );
    // D-137 — Compressed SVG (.svgz): gzip of the plain SVG export. Sits right
    // under "SVG…" so the two SVG variants group together (the Illustrator /
    // Inkscape convention).
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.export-svgz',
        parentId: 'svge.builtin.file.export-menu',
        slot: MENU_SLOT.FILE,
        label: 'SVG (Compressed)…',
        icon: 'folder_zip',
        order: 15,
        run(runCtx) {
          void exportAndDownload(runCtx, fromCtx, 'svgz');
        },
      }),
    );
    // **D-082 F9d** — Export the animation as a standalone animated SVG (native
    // SMIL). Reuses the SVG export path with the opt-in flag; falls back to a
    // plain SVG when the page has no animation.
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.export-svg-animated',
        parentId: 'svge.builtin.file.export-menu',
        slot: MENU_SLOT.FILE,
        label: 'Animated SVG (SMIL)…',
        icon: 'animation',
        order: 20,
        run(runCtx) {
          void exportAndDownload(runCtx, fromCtx, 'svg', true);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.export-png',
        parentId: 'svge.builtin.file.export-menu',
        slot: MENU_SLOT.FILE,
        label: 'PNG…',
        icon: 'image',
        order: 30,
        run(runCtx) {
          void exportAndDownload(runCtx, fromCtx, 'png');
        },
      }),
    );
    // D-044: Optimize current document via the OptimizerRegistry pipeline.
    ctx.track(
      reg.register({
        id: 'svge.builtin.file.optimize',
        slot: MENU_SLOT.FILE,
        label: 'Optimize…',
        icon: 'auto_fix_high',
        order: 60,
        run(runCtx) {
          const bus = fromCtx(CommandBus, runCtx);
          const registry = fromCtx(OptimizerRegistry, runCtx);
          bus.dispatch(new OptimizeCommand(registry));
        },
      }),
    );
    // **D-085** — divider before Document Settings… (roadmap, order 72)
    // and Exit (roadmap, order 90), both added by the roadmap plugin.
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
        // **D-085** — after the clipboard cluster (Cut/Copy/Paste/
        // Duplicate, orders 40–48), before the Select submenu (60).
        order: 50,
        disabled: noSelectionFactory,
        run(runCtx) {
          deleteSelected(runCtx, fromCtx);
        },
      }),
    );

    // ── Edit ▸ Select ▶ submenu (D-085) ─────────────────────────────
    // Wraps Select All, the D-071a "Select Same" trio, and Invert Selection
    // (D-120 — real now; was a `builtinRoadmapMenuPlugin` placeholder).
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.select-menu',
        slot: MENU_SLOT.EDIT,
        label: 'Select',
        icon: 'select_all',
        order: 60,
        run() {
          /* submenu parent — children drive the actual selection ops */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.select-all',
        parentId: 'svge.builtin.edit.select-menu',
        slot: MENU_SLOT.EDIT,
        label: 'Select All',
        icon: 'select_all',
        shortcut: 'Ctrl+A',
        order: 10,
        run(runCtx) {
          selectAllTopLevel(runCtx, fromCtx);
        },
      }),
    );
    // **D-120** — Invert Selection: select the active page's top-level objects
    // that aren't currently selected. Disabled when the page has no objects to
    // invert into (mirrors `selectAllTopLevel`'s no-op condition, surfaced as a
    // greyed item). Order 50 keeps the slot the roadmap placeholder used.
    const noPageObjectsFactory = (injector: Injector): Signal<boolean> => {
      const pages = injector.get(ActivePageService);
      return computed(() => {
        const container = pages.treeForRendering();
        return container.type !== 'group' || container.children.length === 0;
      });
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.invert-selection',
        parentId: 'svge.builtin.edit.select-menu',
        slot: MENU_SLOT.EDIT,
        label: 'Invert Selection',
        icon: 'flip',
        order: 50,
        disabled: noPageObjectsFactory,
        run(runCtx) {
          invertSelection(runCtx, fromCtx);
        },
      }),
    );

    // D-071a — Select Same (Fill / Stroke / Font Family). Illustrator
    // convention. Each entry is disabled when there's no focused node
    // (need a single anchor to "match against") OR when the focused
    // node doesn't have the relevant attribute.
    const noFocusFactory = (injector: Injector): Signal<boolean> => {
      const sel = injector.get(SelectionService);
      const state = injector.get(EditorStateService);
      return computed(() => {
        const id = sel.focusId();
        if (id === null) return true;
        const node = findNodeById(state.document().root, id);
        return node === null;
      });
    };
    const noFontFamilyFocusFactory = (injector: Injector): Signal<boolean> => {
      const sel = injector.get(SelectionService);
      const state = injector.get(EditorStateService);
      return computed(() => {
        const id = sel.focusId();
        if (id === null) return true;
        const node = findNodeById(state.document().root, id);
        if (node === null || node.type !== 'text') return true;
        return typeof (node as TextNode).fontFamily !== 'string';
      });
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.select-same-fill',
        parentId: 'svge.builtin.edit.select-menu',
        slot: MENU_SLOT.EDIT,
        label: 'Select Same Fill',
        icon: 'palette',
        order: 20,
        disabled: noFocusFactory,
        run(runCtx) {
          fromCtx(SelectSameService, runCtx).selectSameFill();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.select-same-stroke',
        parentId: 'svge.builtin.edit.select-menu',
        slot: MENU_SLOT.EDIT,
        label: 'Select Same Stroke',
        icon: 'border_color',
        order: 30,
        disabled: noFocusFactory,
        run(runCtx) {
          fromCtx(SelectSameService, runCtx).selectSameStroke();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.select-same-font-family',
        parentId: 'svge.builtin.edit.select-menu',
        slot: MENU_SLOT.EDIT,
        label: 'Select Same Font Family',
        icon: 'text_format',
        order: 40,
        disabled: noFontFamilyFocusFactory,
        run(runCtx) {
          fromCtx(SelectSameService, runCtx).selectSameFontFamily();
        },
      }),
    );

    // D-044: Cut/Copy/Paste/Duplicate — clipboard + duplicate handlers.
    // **D-085** — reordered to 40–48 so the clipboard cluster sits
    // directly under the Undo/Redo divider, before Delete (Option B).
    // "Paste In Place" (order 46) is a roadmap item added by the roadmap
    // plugin between Paste and Duplicate.
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.cut',
        slot: MENU_SLOT.EDIT,
        label: 'Cut',
        icon: 'content_cut',
        shortcut: 'Ctrl+X',
        order: 40,
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
        order: 42,
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
        order: 44,
        disabled: noClipboardFactory,
        run(runCtx) {
          pasteFromClipboard(runCtx, fromCtx, PASTE_OFFSET);
        },
      }),
    );
    // **D-102** — Paste In Place. Ships the roadmap placeholder
    // `svge.roadmap.edit.paste-in-place` (removed). Same flow as Paste but a
    // ZERO offset, so the content lands at its ORIGINAL coordinates
    // (Illustrator's Ctrl+Shift+V) instead of the +10px nudge a plain Paste
    // now uses. Order 46 keeps it between Paste (44) and Duplicate (48), as
    // the roadmap comment intended. Disabled when the clipboard is empty.
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.paste-in-place',
        slot: MENU_SLOT.EDIT,
        label: 'Paste In Place',
        icon: 'content_paste_go',
        shortcut: 'Ctrl+Shift+V',
        order: 46,
        disabled: noClipboardFactory,
        run(runCtx) {
          pasteFromClipboard(runCtx, fromCtx, { x: 0, y: 0 });
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
        order: 48,
        disabled: noSelectionFactory,
        run(runCtx) {
          duplicateSelected(runCtx, fromCtx);
        },
      }),
    );
    // ── D-073 — History snapshots submenu ─────────────────────────
    //
    // Edit ▸ History submenu hosting Take Snapshot, Restore Last,
    // and Clear All. Placed BEFORE the Group divider (order 60) so
    // the snapshot actions stay grouped with other Edit primitives
    // (Cut/Copy/Paste/Duplicate above). Photoshop also puts
    // snapshot controls under Edit > History.
    //
    // Disabled signals:
    // - "Take Snapshot": always enabled (the document always exists).
    // - "Restore Last": disabled when the snapshots list is empty.
    // - "Clear All": disabled when empty.
    const noSnapshotsFactory = (injector: Injector): Signal<boolean> => {
      const snaps = injector.get(SnapshotsService, null, { optional: true });
      if (snaps === null) return computed(() => true);
      return computed(() => snaps.count() === 0);
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.history',
        slot: MENU_SLOT.EDIT,
        label: 'History',
        icon: 'history',
        // **D-085** — after the Select submenu (60); Find & Replace…
        // (ui plugin, order 80) follows. Group/Ungroup moved to Object.
        order: 70,
        run() {
          /* submenu parent — children drive the actual actions */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.history.take',
        parentId: 'svge.builtin.edit.history',
        slot: MENU_SLOT.EDIT,
        label: 'Take Snapshot',
        icon: 'photo_camera',
        shortcut: 'Ctrl+Shift+S',
        order: 10,
        run(runCtx) {
          const snaps = fromCtx(SnapshotsService, runCtx);
          const state = fromCtx(EditorStateService, runCtx);
          snaps.take(state.document(), { source: 'manual' });
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.history.restore-last',
        parentId: 'svge.builtin.edit.history',
        slot: MENU_SLOT.EDIT,
        label: 'Restore Last Snapshot',
        icon: 'restore',
        shortcut: 'Ctrl+Alt+Z',
        order: 20,
        disabled: noSnapshotsFactory,
        run(runCtx) {
          const snaps = fromCtx(SnapshotsService, runCtx);
          const list = snaps.snapshots();
          if (list.length === 0) return;
          // Most-recent snapshot is at index 0 (newest-first order).
          // Prefer the FIRST non-auto-restore one — `auto-restore`
          // snapshots aren't visible in the panel anyway, but
          // defensive check keeps the menu intuitive.
          const target = list.find((s) => s.source !== 'auto-restore') ?? list[0]!;
          fromCtx(CommandBus, runCtx).dispatch(new RestoreSnapshotCommand(target.id, snaps));
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.history.divider1',
        parentId: 'svge.builtin.edit.history',
        slot: MENU_SLOT.EDIT,
        label: '',
        order: 30,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.history.clear',
        parentId: 'svge.builtin.edit.history',
        slot: MENU_SLOT.EDIT,
        label: 'Clear All Snapshots',
        icon: 'delete_sweep',
        order: 40,
        disabled: noSnapshotsFactory,
        run(runCtx) {
          if (typeof window !== 'undefined') {
            const ok = window.confirm('Delete all snapshots? This cannot be undone.');
            if (!ok) return;
          }
          fromCtx(SnapshotsService, runCtx).clear();
        },
      }),
    );

    // **D-085** — Group / Ungroup MOVED from the Edit menu to the top of
    // the Object menu (Option B convention: object-lifecycle ops live in
    // Object, matching Illustrator). Their ids
    // (`svge.builtin.edit.group` / `…ungroup`) are kept for backward
    // compatibility (shortcuts, NLU, consumer overrides) even though they
    // now register in `MENU_SLOT.OBJECT` — see the Object menu section.

    // ── View menu (D-085 — Zoom ▶ / Display ▶ / Show ▶ submenus) ────
    //
    // The existing flat Zoom/Grid/Rulers/Outline/Timeline toggles become
    // children of three submenus (Option B). Fit Canvas (fit content bounds —
    // D-119), Fit Selection (D-118) + Actual Size (setZoom(1)) are **real**
    // entries. The Display ▸ submenu is now ALL real: Presentation Mode (D-128),
    // Outline Mode, Pixel Preview (D-130), Full Screen (D-129) — no roadmap
    // children left under View. Show ▸ Guides + Artboard Labels (D-123) and
    // Selection Bounds (D-124) were dropped — see `builtinRoadmapMenuPlugin`.

    // ── View ▸ Zoom ▶ ──────────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.zoom-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Zoom',
        icon: 'zoom_in',
        order: 10,
        run() {
          /* submenu parent */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.zoom-in',
        parentId: 'svge.builtin.view.zoom-menu',
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
        parentId: 'svge.builtin.view.zoom-menu',
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
        parentId: 'svge.builtin.view.zoom-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Reset Zoom',
        icon: 'fit_screen',
        order: 30,
        run(runCtx) {
          fromCtx(ViewportService, runCtx).reset();
        },
      }),
    );
    // **D-085 / D-119** — Fit Canvas: zoom/pan so ALL drawn content in the
    // active canvas (the active page, or the whole document in legacy no-page
    // mode) fits in the window — the "fit content bounds" implementation the
    // D-085 slot was reserved for. Distinct from Reset Zoom (which pins zoom
    // to 100% on the page) and genuinely useful for imported SVGs whose art
    // overflows the page viewBox (D-115). Falls back to framing the page/
    // document viewBox when the canvas is empty.
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.zoom-fit-canvas',
        parentId: 'svge.builtin.view.zoom-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Fit Canvas',
        icon: 'crop_free',
        order: 40,
        run(runCtx) {
          zoomFitCanvas(runCtx, fromCtx);
        },
      }),
    );
    // **D-118** — Fit Selection: zoom/pan to frame the current selection's
    // world bounding box (model-based; multi-editor-safe). Disabled with no
    // selection (reuses `noSelectionFactory`).
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.zoom-fit-selection',
        parentId: 'svge.builtin.view.zoom-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Fit Selection',
        icon: 'center_focus_strong',
        order: 50,
        disabled: noSelectionFactory,
        run(runCtx) {
          zoomFitSelection(runCtx, fromCtx);
        },
      }),
    );
    // **D-085** — Actual Size: pin zoom to exactly 100%.
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.zoom-actual-size',
        parentId: 'svge.builtin.view.zoom-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Actual Size (100%)',
        icon: 'aspect_ratio',
        order: 60,
        run(runCtx) {
          fromCtx(ViewportService, runCtx).setZoom(1);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.divider1',
        slot: MENU_SLOT.VIEW,
        label: '',
        order: 20,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    // ── View ▸ Display ▶ ───────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.display-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Display',
        icon: 'visibility',
        order: 30,
        run() {
          /* submenu parent */
        },
      }),
    );
    // **D-128** — Presentation Mode (was the `Preview` roadmap placeholder,
    // order 10). Hides ALL editor chrome and shows only the artwork
    // full-viewport (Figma/Affinity "Presentation"). Distinct from Outline
    // Mode (which changes how shapes RENDER) — this hides the editor UI. The
    // shells apply a `.presentation-mode` host class from the signal and exit
    // on Esc (this menu is hidden while active, so Esc is the way out).
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.display.presentation',
        parentId: 'svge.builtin.view.display-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Presentation Mode',
        icon: 'slideshow',
        order: 10,
        tooltip: 'Hide all panels and chrome — show only the artwork. Press Esc to exit.',
        run(runCtx) {
          fromCtx(WorkspaceService, runCtx).togglePresentationMode();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.toggle-outline',
        parentId: 'svge.builtin.view.display-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Outline Mode',
        icon: 'gesture',
        order: 20,
        run(runCtx) {
          fromCtx(WorkspaceService, runCtx).toggleOutlineMode();
        },
      }),
    );
    // **D-130** — Pixel Preview (was the `Pixel Preview` roadmap placeholder,
    // order 30). Toggles WorkspaceService.pixelPreview(), applied by the
    // PixelPreviewFilter directive on the renderer: disables anti-aliasing
    // (crispEdges) + nearest-neighbour raster scaling (pixelated) so the art
    // previews as it would rasterize to the pixel grid. Orthogonal to Outline
    // Mode (suppresses fills) — both compose.
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.display.pixel-preview',
        parentId: 'svge.builtin.view.display-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Pixel Preview',
        icon: 'grid_4x4',
        order: 30,
        tooltip: 'Preview the artwork rasterized to the pixel grid (hard, anti-alias-free edges).',
        run(runCtx) {
          fromCtx(WorkspaceService, runCtx).togglePixelPreview();
        },
      }),
    );
    // **D-131** — Pixel Preview (Rasterized): the pixel-accurate ("chunky")
    // variant. Toggles WorkspaceService.pixelPreviewRaster(); the shell mounts
    // <svg:g svgePixelPreviewRaster> which rasterizes the page to a native-res
    // bitmap shown nearest-neighbour (real device pixels, Illustrator-style).
    // Heavier than D-130's CSS preview, and web fonts / foreignObject may not
    // render (SVG→canvas limitation) — hence a separate item.
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.display.pixel-preview-raster',
        parentId: 'svge.builtin.view.display-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Pixel Preview (Rasterized)',
        icon: 'apps',
        order: 35,
        tooltip:
          'Pixel-accurate preview: rasterizes the page to real device pixels (slower; web fonts / embedded HTML may not appear).',
        run(runCtx) {
          fromCtx(WorkspaceService, runCtx).togglePixelPreviewRaster();
        },
      }),
    );
    // **D-129** — Full Screen (was the `Full Screen` roadmap placeholder, order
    // 40). Uses the native Fullscreen API via FullscreenService: gives the
    // editor element the whole monitor (hides browser/OS chrome). Distinct from
    // Presentation Mode (D-128, hides the EDITOR chrome inside the page) — the
    // two compose. Disabled when the API is unavailable (SSR / sandboxed
    // iframe). Browser exits on Esc/F11 natively. requestFullscreen needs a
    // user gesture: the menu click → run() chain is synchronous, so it holds.
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.display.full-screen',
        parentId: 'svge.builtin.view.display-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Full Screen',
        icon: 'fullscreen',
        order: 40,
        tooltip: 'Fill the entire screen (browser fullscreen). Press Esc to exit.',
        disabled: (injector: Injector) =>
          computed(() => !injector.get(FullscreenService).isSupported()),
        run(runCtx) {
          fromCtx(FullscreenService, runCtx).toggle();
        },
      }),
    );
    // ── View ▸ Show ▶ ──────────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.show-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Show',
        icon: 'visibility',
        order: 40,
        run() {
          /* submenu parent */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.toggle-grid',
        parentId: 'svge.builtin.view.show-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Grid',
        icon: 'grid_on',
        order: 10,
        run(runCtx) {
          fromCtx(WorkspaceService, runCtx).toggleGrid();
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.toggle-rulers',
        parentId: 'svge.builtin.view.show-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Rulers',
        icon: 'straighten',
        order: 20,
        run(runCtx) {
          fromCtx(WorkspaceService, runCtx).toggleRulers();
        },
      }),
    );
    // **D-082 F6 follow-up** — Animation Timeline visibility toggle. Flips
    // WorkspaceService.timeline(), which `<svge-shell-pro>` reads to mount
    // the bottom dock + drive the canvas preview from the playhead.
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.toggle-timeline',
        parentId: 'svge.builtin.view.show-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Timeline',
        icon: 'timeline',
        order: 30,
        run(runCtx) {
          fromCtx(WorkspaceService, runCtx).toggleTimeline();
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
    // ── View ▸ Snap submenu ────────────────────────────────────────
    //
    // Convert the single "Snap" toggle into a Photoshop-style submenu
    // exposing BOTH the on/off flag AND the mode (Grid only / Objects
    // only / Both). Keeps the previous one-click toggle UX via the
    // first child ("Enabled") plus adds direct mode switching for
    // power users who reach via menu/keyboard.
    //
    // Visual feedback of the **currently active** mode lives in the
    // status bar pill (which mirrors the same SnapService state and
    // shows "off"/"grid"/"objects"/"both" by reading the signals).
    // The menu items don't try to render their own checkmarks — would
    // require MenuContribution refactor (no native `checked` field
    // today). Acceptable trade-off: status bar is the source of truth
    // for visual state, menu is the action surface.
    //
    // Picking a mode item also FORCES enabled=true — saves the user
    // from a 2-step "enable + pick mode" sequence. Matches Photoshop's
    // "View ▸ Snap To ▸ <target>" behavior (selecting a target turns
    // snap on if it wasn't).
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.snap',
        slot: MENU_SLOT.VIEW,
        label: 'Snap',
        icon: 'grid_3x3',
        order: 80,
        run() {
          /* submenu parent — children drive the actual actions */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.snap.enabled',
        parentId: 'svge.builtin.view.snap',
        slot: MENU_SLOT.VIEW,
        label: 'Enabled',
        icon: 'power_settings_new',
        order: 10,
        run(runCtx) {
          const snap = fromCtx(SnapService, runCtx);
          snap.setEnabled(!snap.enabled());
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.snap.divider1',
        parentId: 'svge.builtin.view.snap',
        slot: MENU_SLOT.VIEW,
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
        id: 'svge.builtin.view.snap.mode-grid',
        parentId: 'svge.builtin.view.snap',
        slot: MENU_SLOT.VIEW,
        label: 'Grid only',
        icon: 'grid_4x4',
        order: 30,
        run(runCtx) {
          const snap = fromCtx(SnapService, runCtx);
          snap.setMode('grid');
          if (!snap.enabled()) snap.setEnabled(true);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.snap.mode-objects',
        parentId: 'svge.builtin.view.snap',
        slot: MENU_SLOT.VIEW,
        label: 'Objects only',
        icon: 'category',
        order: 40,
        run(runCtx) {
          const snap = fromCtx(SnapService, runCtx);
          snap.setMode('objects');
          if (!snap.enabled()) snap.setEnabled(true);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.snap.mode-both',
        parentId: 'svge.builtin.view.snap',
        slot: MENU_SLOT.VIEW,
        label: 'Both',
        icon: 'apps',
        order: 50,
        run(runCtx) {
          const snap = fromCtx(SnapService, runCtx);
          snap.setMode('both');
          if (!snap.enabled()) snap.setEnabled(true);
        },
      }),
    );
    // **D-126** — "Snap to Guides" is an ADDITIONAL, independent toggle (it does
    // NOT touch the Grid only / Objects only / Both mode above). Default off, so
    // clicking it turns guide-snapping ON; clicking again turns it off. Turning
    // it on also forces snap enabled. A divider separates it from the mode
    // group since it's a different axis (mode = grid/objects; this = guides).
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.snap.divider2',
        parentId: 'svge.builtin.view.snap',
        slot: MENU_SLOT.VIEW,
        label: '',
        order: 55,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.snap.guides',
        parentId: 'svge.builtin.view.snap',
        slot: MENU_SLOT.VIEW,
        label: 'Snap to Guides',
        icon: 'straighten',
        // **D-126** — explain the additive nature (it confused at first: this is
        // NOT a "Grid + Guides" preset). Rendered as a native `title=` by
        // `<svge-menu-bar>` ([attr.title]="item.tooltip").
        tooltip:
          'Also snap to your guide lines. Independent toggle layered on top of the ' +
          'active Grid / Objects / Both mode — it adds guides, it does not replace the mode.',
        order: 60,
        run(runCtx) {
          const snap = fromCtx(SnapService, runCtx);
          snap.toggleSnapToGuides();
          if (snap.snapToGuides() && !snap.enabled()) snap.setEnabled(true);
        },
      }),
    );

    // ── View ▸ Guides submenu (PRO-GAP G2-G4) ───────────────────────
    //
    // Mirror the Custom Editor toolbar's "+H guide / +V guide / Clear
    // guides" buttons as a proper Illustrator-style submenu in the
    // Professional shell. Custom users had one-click access from the
    // toolbar; Pro users discover via View ▸ Guides ▸ … and the same
    // drag-from-ruler gesture (D-019 polish) keeps working.
    //
    // **Position chosen**: the centre of the currently visible viewport
    // (in document coordinates). Reading `ViewportService.viewBox()`
    // gives us the live pan/zoom box; centring inside it makes the new
    // guide land where the user is looking — predictable when zoomed
    // in/out. Falls back to (0,0) when the viewport isn't initialized
    // yet (shouldn't happen in practice, defensive only).
    //
    // **Clear All disabled gate**: factory reads `WorkspaceService.guides()`
    // and disables when empty so users get the standard greyed-out
    // affordance (matches the dialog's "Clear all" behavior).
    const noGuidesFactory = (injector: Injector): Signal<boolean> => {
      const ws = injector.get(WorkspaceService);
      return computed(() => ws.guides().length === 0);
    };
    const addGuideAtViewportCentre = (axis: 'h' | 'v', runCtx?: MenuContributionContext): void => {
      const ws = fromCtx(WorkspaceService, runCtx);
      const viewport = fromCtx(ViewportService, runCtx);
      const box = viewport.viewBox();
      // h(orizontal) guide is a horizontal line at a Y coordinate;
      // v(ertical) is a vertical line at an X coordinate. Centre the
      // perpendicular axis inside the currently visible box.
      const position = axis === 'h' ? box.y + box.height / 2 : box.x + box.width / 2;
      ws.addGuide(axis, position);
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.guides',
        slot: MENU_SLOT.VIEW,
        label: 'Guides',
        icon: 'straighten',
        // After Snap (80), before Workspace Settings (which is on
        // File menu) — sits with the other "show/hide canvas chrome"
        // entries. Matches Illustrator's `View ▸ Guides ▸ …` placement.
        order: 85,
        run() {
          /* submenu parent — children drive the actual actions */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.guides.add-h',
        parentId: 'svge.builtin.view.guides',
        slot: MENU_SLOT.VIEW,
        label: 'Add Horizontal Guide',
        icon: 'horizontal_rule',
        order: 10,
        run(runCtx) {
          addGuideAtViewportCentre('h', runCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.guides.add-v',
        parentId: 'svge.builtin.view.guides',
        slot: MENU_SLOT.VIEW,
        label: 'Add Vertical Guide',
        // Material has no canonical "vertical_rule" icon at the time of
        // writing; `vertical_align_center` reads as a single vertical
        // line in most icon sets, closest available match.
        icon: 'vertical_align_center',
        order: 20,
        run(runCtx) {
          addGuideAtViewportCentre('v', runCtx);
        },
      }),
    );
    // **D-121 / D-122** — Lock Guides + Unlock Guides as two state-aware items
    // (the project convention — cf. Make/Release Clipping Path / Smart Object),
    // instead of one toggle. Each is `disabled` when it would be a no-op: Lock
    // is disabled when already locked, Unlock when already unlocked. When
    // locked, `GuidesOverlay` makes guides non-interactive — they stay visible
    // but can't be selected, dragged, or deleted on the canvas. Add/Clear
    // (explicit commands) keep working.
    const guidesLockedFactory = (injector: Injector): Signal<boolean> => {
      const ws = injector.get(WorkspaceService);
      return computed(() => ws.guidesLocked());
    };
    const guidesUnlockedFactory = (injector: Injector): Signal<boolean> => {
      const ws = injector.get(WorkspaceService);
      return computed(() => !ws.guidesLocked());
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.guides.lock',
        parentId: 'svge.builtin.view.guides',
        slot: MENU_SLOT.VIEW,
        label: 'Lock Guides',
        icon: 'lock',
        order: 25,
        disabled: guidesLockedFactory, // already locked → nothing to lock
        run(runCtx) {
          fromCtx(WorkspaceService, runCtx).setGuidesLocked(true);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.guides.unlock',
        parentId: 'svge.builtin.view.guides',
        slot: MENU_SLOT.VIEW,
        label: 'Unlock Guides',
        icon: 'lock_open',
        order: 26,
        disabled: guidesUnlockedFactory, // already unlocked → nothing to unlock
        run(runCtx) {
          fromCtx(WorkspaceService, runCtx).setGuidesLocked(false);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.guides.divider1',
        parentId: 'svge.builtin.view.guides',
        slot: MENU_SLOT.VIEW,
        label: '',
        order: 30,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.view.guides.clear',
        parentId: 'svge.builtin.view.guides',
        slot: MENU_SLOT.VIEW,
        label: 'Clear All Guides',
        icon: 'clear_all',
        order: 40,
        disabled: noGuidesFactory,
        run(runCtx) {
          fromCtx(WorkspaceService, runCtx).clearGuides();
        },
      }),
    );

    // ── Object menu ────────────────────────────────────────────────
    // **D-085** — Group / Ungroup moved here from the Edit menu (top of
    // Object, before Arrange), matching Illustrator / Option B. Ids kept
    // as `svge.builtin.edit.group` / `…ungroup` for backward compat
    // (shortcuts, NLU, consumer overrides) — only the slot changed.
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.group',
        slot: MENU_SLOT.OBJECT,
        label: 'Group',
        icon: 'group_work',
        shortcut: 'Ctrl+G',
        order: 5,
        disabled: cantGroupFactory,
        run(runCtx) {
          groupSelection(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.edit.ungroup',
        slot: MENU_SLOT.OBJECT,
        label: 'Ungroup',
        icon: 'call_split',
        shortcut: 'Ctrl+Shift+G',
        order: 7,
        disabled: cantUngroupFactory,
        run(runCtx) {
          ungroupFocus(runCtx, fromCtx);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.divider-arrange',
        slot: MENU_SLOT.OBJECT,
        label: '',
        order: 8,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );

    // ── Object ▸ Arrange ▶ (z-order) ───────────────────────────────
    const reorder = (direction: ReorderDirection, runCtx?: MenuContributionContext): void => {
      const sel = fromCtx(SelectionService, runCtx);
      const ids = Array.from(sel.selectedIds());
      if (ids.length === 0) return;
      const bus = fromCtx(CommandBus, runCtx);
      for (const id of ids) bus.dispatch(new ReorderNodeCommand(id, direction));
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.arrange',
        slot: MENU_SLOT.OBJECT,
        label: 'Arrange',
        icon: 'layers',
        order: 20,
        disabled: noSelectionFactory,
        run() {
          /* submenu parent — children drive the actual reorder */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.bring-to-front',
        parentId: 'svge.builtin.object.arrange',
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
        parentId: 'svge.builtin.object.arrange',
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
        parentId: 'svge.builtin.object.arrange',
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
        parentId: 'svge.builtin.object.arrange',
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

    // ── D-078 — Object › Flip submenu (parity with Inspector) ───────
    //
    // The Transform tab in the Inspector exposes Flip H / Flip V
    // buttons but the menu bar had no surface for the same gesture —
    // users browsing the menu chrome had no way to discover it.
    // Mirrors the Inspector logic exactly: one FlipNodeCommand per
    // selected unlocked node, pivoting around each shape's OWN bbox
    // centre so every node mirrors in place (Photoshop "Flip
    // Horizontal" / Illustrator "Reflect" convention). Multi-selection
    // produces N undo entries — same trade-off the Inspector accepts
    // for a low-frequency operation.
    //
    // Placed at order 45 — between "Send to Back" (40) and the Align
    // submenu (50). Sits with the per-node spatial transforms (flip
    // is a single-node operation, unlike Align/Distribute/Pathfinder
    // which need ≥ 2 nodes), so the menu reads
    // reorder → flip → align → distribute → pathfinder top-to-bottom.
    //
    // **Why we need an SVG ref (not just the document model)**: bbox
    // depends on the rendered geometry post-transform, which is the
    // browser's job to compute. We query the live `<svge-renderer>`
    // mount the same way collectSelectedBBoxes does below (proven
    // pattern from D-065 align/distribute). If no SVG is mounted
    // (headless / SSR), the handler no-ops gracefully.
    // **D-085** — relabeled "Flip" → "Transform" (Option B). Keeps id
    // `svge.builtin.object.flip` so the real Flip H/V children stay
    // attached; Rotate / Scale / Skew / Reset Transform are roadmap
    // children added by `builtinRoadmapMenuPlugin` under this same id.
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.flip',
        slot: MENU_SLOT.OBJECT,
        label: 'Transform',
        icon: 'transform',
        order: 30,
        disabled: noSelectionFactory,
        run() {
          /* submenu parent — children drive the actual transform */
        },
      }),
    );
    const dispatchFlip = (runCtx: MenuContributionContext | undefined, axis: FlipAxis): void => {
      const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
      if (svg === null) return;
      const sel = fromCtx(SelectionService, runCtx);
      const layers = fromCtx(LayersService, runCtx);
      const bus = fromCtx(CommandBus, runCtx);
      for (const id of sel.selectedIds()) {
        if (layers.isLocked(id)) continue;
        const bbox = getRenderedNodeBBox(svg, id);
        if (bbox === null) continue;
        const pivot: Point = {
          x: bbox.x + bbox.width / 2,
          y: bbox.y + bbox.height / 2,
        };
        bus.dispatch(new FlipNodeCommand(id, axis, pivot));
      }
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.flip.horizontal',
        parentId: 'svge.builtin.object.flip',
        slot: MENU_SLOT.OBJECT,
        label: 'Flip Horizontal',
        icon: 'flip',
        tooltip: 'Mirror left ↔ right around each shape’s centre',
        order: 10,
        disabled: noSelectionFactory,
        run(runCtx) {
          dispatchFlip(runCtx, 'horizontal');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.flip.vertical',
        parentId: 'svge.builtin.object.flip',
        slot: MENU_SLOT.OBJECT,
        label: 'Flip Vertical',
        icon: 'flip',
        tooltip: 'Mirror top ↕ bottom around each shape’s centre',
        order: 20,
        disabled: noSelectionFactory,
        run(runCtx) {
          dispatchFlip(runCtx, 'vertical');
        },
      }),
    );

    // ── D-109 — Object ▸ Rasterize ▸ {1× | 2× | 3×} ─────────────────
    //
    // Replace each selected vector node with a raster <image> baked at the
    // chosen device-pixel scale (Illustrator's *Object ▸ Rasterize*). 1×
    // matches the element 1:1 (crisp at 100% on standard-DPI screens); 2×
    // (recommended) stays sharp on retina + moderate zoom; 3× for print-ish
    // density. Async + browser-only (canvas render); disabled with no
    // selection. See `rasterizeSelection`.
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.rasterize',
        slot: MENU_SLOT.OBJECT,
        label: 'Rasterize',
        icon: 'image',
        order: 35,
        disabled: noSelectionFactory,
        run() {
          /* submenu parent — children carry the resolution */
        },
      }),
    );
    const rasterizePresets = [
      { label: '1×', scale: 1, order: 10 },
      { label: '2× (recommended)', scale: 2, order: 20 },
      { label: '3×', scale: 3, order: 30 },
    ] as const;
    for (const preset of rasterizePresets) {
      ctx.track(
        reg.register({
          id: `svge.builtin.object.rasterize.${preset.scale}x`,
          parentId: 'svge.builtin.object.rasterize',
          slot: MENU_SLOT.OBJECT,
          label: preset.label,
          icon: 'image',
          order: preset.order,
          disabled: noSelectionFactory,
          run(runCtx) {
            void rasterizeSelection(runCtx, fromCtx, preset.scale);
          },
        }),
      );
    }

    // ── D-093 — Object ▸ Transform ▸ Reset Transform ────────────────
    //
    // Ships the roadmap placeholder `svge.roadmap.object.transform.reset`
    // (removed from `builtinRoadmapMenuPlugin`). Mechanically identical to
    // the Inspector's `resetTransform()`: clears rotation / scale / skew
    // back to identity while KEEPING the translation (`[1,0,0,1,e,f]`), so
    // the shape doesn't teleport. No dialog — it's a one-shot action. One
    // undoable `SetPropertyCommand` per selected, unlocked node; nodes
    // already at identity rotation/scale are skipped (no no-op history).
    // Lives edit-side (no Material needed). Order 60 — last under the
    // Transform submenu (Flip H/V 10/20, Rotate/Scale/Skew 30/40/50 added
    // by the UI plugin, Reset 60).
    const dispatchResetTransform = (runCtx: MenuContributionContext | undefined): void => {
      const sel = fromCtx(SelectionService, runCtx);
      const layers = fromCtx(LayersService, runCtx);
      const state = fromCtx(EditorStateService, runCtx);
      const bus = fromCtx(CommandBus, runCtx);
      for (const id of sel.selectedIds()) {
        if (layers.isLocked(id)) continue;
        const node = findNodeById(state.document().root, id);
        if (node === null) continue;
        const t = node.transform;
        // Already identity rotation+scale+skew → nothing to clear.
        if (t[0] === 1 && t[1] === 0 && t[2] === 0 && t[3] === 1) continue;
        const next: Transform = [1, 0, 0, 1, t[4], t[5]];
        bus.dispatch(new SetPropertyCommand(id, 'transform', next));
      }
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.transform.reset',
        parentId: 'svge.builtin.object.flip',
        slot: MENU_SLOT.OBJECT,
        label: 'Reset Transform',
        icon: 'restart_alt',
        tooltip: 'Clear rotation, scale and skew (keep position)',
        order: 60,
        disabled: noSelectionFactory,
        run(runCtx) {
          dispatchResetTransform(runCtx);
        },
      }),
    );

    // ── D-065 — Object › Align / Distribute / Pathfinder submenus ──
    //
    // Industry-standard placement (Illustrator → Object, Inkscape →
    // Object/Path, Affinity → Layer/Arrange). All three live as
    // submenus under Object to keep the menu chrome compact and the
    // discoverability path consistent ("everything that mutates
    // multiple shapes at once lives here").
    //
    // **Reusable selection helper** — both Align and Distribute call
    // `alignment.align/distribute(items, axis)` where `items` is a
    // `NodeBBox[]` collected from the rendered SVG. Pathfinder takes
    // the raw id list. We query the DOM once per fire (matches the
    // proven custom-editor pattern; `<svge-renderer>` mounts a single
    // <svg> root that's always reachable via querySelector).
    const collectSelectedBBoxes = (
      runCtx: MenuContributionContext | undefined,
    ): readonly NodeBBox[] => {
      const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
      if (svg === null) return [];
      const sel = fromCtx(SelectionService, runCtx);
      const out: NodeBBox[] = [];
      for (const id of sel.selectedIds()) {
        const bb = getRenderedNodeBBox(svg, id);
        if (bb !== null) out.push({ id, bbox: bb });
      }
      return out;
    };

    // ── Align ▶ parent ─────────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.align',
        slot: MENU_SLOT.OBJECT,
        label: 'Align',
        icon: 'align_horizontal_center',
        order: 50,
        disabled: cantAlignFactory,
        run() {
          /* submenu parent — children drive the actual alignment */
        },
      }),
    );
    // Align children — horizontal axis (X)
    const registerAlign = (
      id: string,
      label: string,
      icon: string,
      order: number,
      axis: AlignAxis,
    ): void => {
      ctx.track(
        reg.register({
          id,
          parentId: 'svge.builtin.object.align',
          slot: MENU_SLOT.OBJECT,
          label,
          icon,
          order,
          disabled: cantAlignFactory,
          run(runCtx) {
            const items = collectSelectedBBoxes(runCtx);
            if (items.length === 0) return;
            // **D-094** — single, centralized reference resolution shared by
            // the menu, Inspector and Select tool-options. `resolveAlignReference`
            // picks the reference: a designated **key object** (≥ 2 selected),
            // else the **page/artboard** (single node), else `null` = align to
            // the **selection union**. Page = active page viewBox (fallback doc).
            const page =
              fromCtx(ActivePageService, runCtx).activePageViewBox() ??
              fromCtx(EditorStateService, runCtx).document().viewBox;
            const keyId = fromCtx(KeyObjectService, runCtx).keyObjectId();
            const reference = resolveAlignReference(items, keyId, page);
            const alignment = fromCtx(AlignmentService, runCtx);
            if (reference !== null) {
              alignment.alignToReference(items, axis, reference);
            } else {
              alignment.align(items, axis);
            }
          },
        }),
      );
    };
    registerAlign(
      'svge.builtin.object.align.left',
      'Align Left',
      'align_horizontal_left',
      10,
      'left',
    );
    registerAlign(
      'svge.builtin.object.align.center-h',
      'Center Horizontal',
      'align_horizontal_center',
      20,
      'center-x',
    );
    registerAlign(
      'svge.builtin.object.align.right',
      'Align Right',
      'align_horizontal_right',
      30,
      'right',
    );
    // Divider between H and V axes inside the Align submenu.
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.align.divider1',
        parentId: 'svge.builtin.object.align',
        slot: MENU_SLOT.OBJECT,
        label: '',
        order: 40,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    registerAlign('svge.builtin.object.align.top', 'Align Top', 'align_vertical_top', 50, 'top');
    registerAlign(
      'svge.builtin.object.align.center-v',
      'Center Vertical',
      'align_vertical_center',
      60,
      'center-y',
    );
    registerAlign(
      'svge.builtin.object.align.bottom',
      'Align Bottom',
      'align_vertical_bottom',
      70,
      'bottom',
    );

    // ── D-094 — Align ▸ Key Object (Illustrator "Align to Key Object") ──
    //
    // Ships the roadmap placeholder `svge.roadmap.object.align.align-to`
    // (removed from `builtinRoadmapMenuPlugin`). With ≥ 2 nodes selected,
    // "Make Key Object" pins the focused (last-clicked) node as the fixed
    // alignment anchor; the 6 align ops then align everything to it (it
    // stays put) instead of to the selection union — `resolveAlignReference`
    // reads `KeyObjectService.keyObjectId()`. "Clear Key Object" reverts to
    // union/page alignment. Transient UI state (not undoable, not persisted)
    // — auto-clears when the key object leaves the selection.
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.align.divider-key',
        parentId: 'svge.builtin.object.align',
        slot: MENU_SLOT.OBJECT,
        label: '',
        order: 80,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.align.make-key',
        parentId: 'svge.builtin.object.align',
        slot: MENU_SLOT.OBJECT,
        label: 'Make Key Object',
        icon: 'center_focus_strong',
        tooltip: 'Align the rest of the selection to the focused object (it stays put)',
        order: 90,
        disabled: cantMakeKeyFactory,
        run(runCtx) {
          const sel = fromCtx(SelectionService, runCtx);
          const focus = sel.focusId();
          if (focus === null || !sel.selectedIds().has(focus)) return;
          fromCtx(KeyObjectService, runCtx).setKeyObject(focus);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.align.clear-key',
        parentId: 'svge.builtin.object.align',
        slot: MENU_SLOT.OBJECT,
        label: 'Clear Key Object',
        icon: 'center_focus_weak',
        tooltip: 'Stop aligning to the key object (back to selection / page)',
        order: 100,
        disabled: noKeyObjectFactory,
        run(runCtx) {
          fromCtx(KeyObjectService, runCtx).clear();
        },
      }),
    );

    // ── Distribute ▶ parent ────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.distribute',
        slot: MENU_SLOT.OBJECT,
        label: 'Distribute',
        icon: 'horizontal_distribute',
        order: 60,
        disabled: cantDistributeFactory,
        run() {
          /* submenu parent */
        },
      }),
    );
    const registerDistribute = (
      id: string,
      label: string,
      icon: string,
      order: number,
      axis: DistributeAxis,
    ): void => {
      ctx.track(
        reg.register({
          id,
          parentId: 'svge.builtin.object.distribute',
          slot: MENU_SLOT.OBJECT,
          label,
          icon,
          order,
          disabled: cantDistributeFactory,
          run(runCtx) {
            const items = collectSelectedBBoxes(runCtx);
            if (items.length < 3) return;
            fromCtx(AlignmentService, runCtx).distribute(items, axis);
          },
        }),
      );
    };
    registerDistribute(
      'svge.builtin.object.distribute.h',
      'Horizontally',
      'horizontal_distribute',
      10,
      'horizontal',
    );
    registerDistribute(
      'svge.builtin.object.distribute.v',
      'Vertically',
      'vertical_distribute',
      20,
      'vertical',
    );

    // ── Boolean ▶ parent (D-085, ex-"Pathfinder") ──────────────────
    // **D-085** — relabeled "Pathfinder" → "Boolean (Pathfinder)" per
    // Option B. Id kept (`svge.builtin.object.pathfinder`) so the 5
    // destructive ops below stay attached. The non-destructive **Live
    // Boolean** ops (Make Live Union/Intersect/Subtract/Exclude +
    // Refresh + Release) from `builtinAdvancedEditMenuPlugin` also
    // re-parent here as flat leaves (the menu bar renders 2 levels only,
    // so they're siblings of Union/Intersect/… rather than a nested
    // "Live ▶" sub-submenu).
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.pathfinder',
        slot: MENU_SLOT.OBJECT,
        label: 'Boolean (Pathfinder)',
        icon: 'join_inner',
        order: 70,
        disabled: cantPathfinderFactory,
        run() {
          /* submenu parent */
        },
      }),
    );
    // Helper: auto-convert non-path leaves before applying boolean op.
    // Matches /custom-editor behavior (rect/ellipse/line/polygon/
    // polyline are upgraded to paths; group/text/image are left to
    // the command's own validation, which fails silently).
    const dispatchPathfinder = (
      runCtx: MenuContributionContext | undefined,
      Ctor:
        | typeof UnionCommand
        | typeof IntersectCommand
        | typeof SubtractCommand
        | typeof ExcludeCommand
        | typeof DivideCommand,
    ): void => {
      const sel = fromCtx(SelectionService, runCtx);
      const ids = Array.from(sel.selectedIds()) as NodeId[];
      if (ids.length < 2) return;
      const state = fromCtx(EditorStateService, runCtx);
      const bus = fromCtx(CommandBus, runCtx);
      for (const id of ids) {
        const node = findNodeById(state.document().root, id);
        if (node === null) continue;
        if (
          node.type === 'rect' ||
          node.type === 'ellipse' ||
          node.type === 'line' ||
          node.type === 'polygon' ||
          node.type === 'polyline'
        ) {
          bus.dispatch(new ConvertNodeToPathCommand(id));
        }
      }
      bus.dispatch(new Ctor(ids));
      // Operand A keeps its id; re-select for visual confirmation.
      sel.select(ids[0]!);
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.pathfinder.union',
        parentId: 'svge.builtin.object.pathfinder',
        slot: MENU_SLOT.OBJECT,
        label: 'Union',
        icon: 'join_inner',
        tooltip: 'Merge overlapping shapes into one (A ∪ B)',
        order: 10,
        disabled: cantPathfinderFactory,
        run(runCtx) {
          dispatchPathfinder(runCtx, UnionCommand);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.pathfinder.intersect',
        parentId: 'svge.builtin.object.pathfinder',
        slot: MENU_SLOT.OBJECT,
        label: 'Intersect',
        icon: 'join_full',
        tooltip: 'Keep only the overlapping area (A ∩ B)',
        order: 20,
        disabled: cantPathfinderFactory,
        run(runCtx) {
          dispatchPathfinder(runCtx, IntersectCommand);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.pathfinder.subtract',
        parentId: 'svge.builtin.object.pathfinder',
        slot: MENU_SLOT.OBJECT,
        label: 'Subtract',
        icon: 'join_left',
        tooltip: 'Remove the others from the first shape (A \\ B)',
        order: 30,
        disabled: cantPathfinderFactory,
        run(runCtx) {
          dispatchPathfinder(runCtx, SubtractCommand);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.pathfinder.divide',
        parentId: 'svge.builtin.object.pathfinder',
        slot: MENU_SLOT.OBJECT,
        label: 'Divide',
        icon: 'call_split',
        tooltip: 'Split into non-overlapping regions',
        order: 40,
        disabled: cantPathfinderFactory,
        run(runCtx) {
          dispatchPathfinder(runCtx, DivideCommand);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.pathfinder.exclude',
        parentId: 'svge.builtin.object.pathfinder',
        slot: MENU_SLOT.OBJECT,
        label: 'Exclude',
        icon: 'join_right',
        tooltip: 'Keep non-overlapping areas (symmetric difference)',
        order: 50,
        disabled: cantPathfinderFactory,
        run(runCtx) {
          dispatchPathfinder(runCtx, ExcludeCommand);
        },
      }),
    );

    // ── D-072 — Logical Layers (Object ▸ Layer submenu) ─────────────
    //
    // Three commands, all gated by per-target context:
    //
    // - **New Layer** (always available): creates an empty top-level
    //   layer at the front of the document. Drives the same gesture
    //   the Layers Panel "+" button fires.
    // - **Convert to Layer**: enabled only when the focused node is a
    //   top-level group (not nested, not already a layer, not a leaf
    //   shape). The command itself rejects illegal targets; the
    //   disabled signal mirrors the same predicate so the menu UI
    //   shows the constraint up-front instead of failing silently.
    // - **Convert to Group**: enabled only when the focused node is a
    //   layer. Inverse of Convert to Layer.
    //
    // Placed in `menu.object` (above Pathfinder, below Send to Back) —
    // mirrors Illustrator's "Object ▸ Layer" submenu position. Could
    // be promoted to its own top-level `menu.layer` in the future, but
    // a submenu keeps the menu bar narrow while D-072 lands.
    const cantConvertToLayerFactory = (injector: Injector): Signal<boolean> => {
      const sel = injector.get(SelectionService);
      const state = injector.get(EditorStateService);
      return computed(() => {
        const id = sel.focusId();
        if (id === null) return true;
        const root = state.document().root;
        const node = findNodeById(root, id);
        if (node === null || node.type !== 'group') return true;
        if (isLayer(node)) return true; // already a layer
        if (isPage(node)) return true; // a page is not a convertible group
        const parent = findParent(root, id);
        // Top-level = direct child of a **layer container**: the document
        // root (legacy, page-less docs) OR a page (D-079). The old
        // root-only check left this permanently disabled under Pages,
        // where a top-level group is a child of the active page.
        return parent === null || (parent.id !== root.id && !isPage(parent));
      });
    };
    const cantConvertToGroupFactory = (injector: Injector): Signal<boolean> => {
      const sel = injector.get(SelectionService);
      const state = injector.get(EditorStateService);
      return computed(() => {
        const id = sel.focusId();
        if (id === null) return true;
        const node = findNodeById(state.document().root, id);
        return node === null || !isLayer(node);
      });
    };
    // **D-085** — "New Layer" relocated to the **Insert** menu (Option B
    // groups node-creation under Insert: Layer/Artboard/Symbol/…). Slot
    // changed to INSERT; id kept (`svge.builtin.object.new-layer`) for
    // backward compatibility. Order 50 places it after Image (40).
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.new-layer',
        slot: MENU_SLOT.INSERT,
        label: 'Layer',
        icon: 'layers',
        order: 50,
        run(runCtx) {
          const bus = fromCtx(CommandBus, runCtx);
          const sel = fromCtx(SelectionService, runCtx);
          const cmd = new CreateLayerCommand();
          bus.dispatch(cmd);
          const newId = cmd.getCreatedLayerId();
          if (newId !== null) sel.select(newId);
        },
      }),
    );

    // ── Object ▸ Mask ▶ submenu (D-086) — REAL clip/mask by gesture ─
    // Topmost selected node → `<clipPath>`/`<mask>` def (consumed); the
    // rest get the reference. Release restores the clip shape (Illustrator
    // parity). io-aware logic lives in `clip-mask-actions`; the commands
    // (MakeClipMaskCommand / ReleaseClipMaskCommand) are pure-core.
    const noClipRefFactory = (injector: Injector): Signal<boolean> => {
      const sel = injector.get(SelectionService);
      const state = injector.get(EditorStateService);
      return computed(() => {
        const id = sel.focusId();
        if (id === null) return true;
        const node = findNodeById(state.document().root, id);
        return node === null || node.style.clipPath === undefined;
      });
    };
    const noMaskRefFactory = (injector: Injector): Signal<boolean> => {
      const sel = injector.get(SelectionService);
      const state = injector.get(EditorStateService);
      return computed(() => {
        const id = sel.focusId();
        if (id === null) return true;
        const node = findNodeById(state.document().root, id);
        return node === null || node.style.mask === undefined;
      });
    };
    // **D-086 follow-up** — Make Clipping Path needs ≥ 2 selected (one
    // clipper + ≥ 1 target, like Group) AND the clipper (the topmost
    // selected node) must be vector geometry: SVG **ignores `<image>`
    // inside `<clipPath>`**, so an image clipper would silently crop the
    // targets to nothing. We forbid that combination here; the item's
    // tooltip points users to Make Opacity Mask (a `<mask>` renders any
    // content, images included) or Trace Image (vectorize first). The
    // clipper resolution reuses `topmostSelected` — the single source of
    // truth shared with `makeClipMask`, so the disabled rule can never
    // drift from which node actually becomes the clip.
    const cantMakeClipFactory = (injector: Injector): Signal<boolean> => {
      const selection = injector.get(SelectionService);
      const state = injector.get(EditorStateService);
      return computed(() => {
        const ids = Array.from(selection.selectedIds()) as NodeId[];
        if (ids.length < 2) return true;
        const clipper = topmostSelected(state.document().root, ids);
        return clipper === null || clipper.type === 'image';
      });
    };
    const releaseFromFocus = (
      runCtx: MenuContributionContext | undefined,
      kind: 'clipPath' | 'mask',
    ): void => {
      const injector = runCtx?.injector ?? ctx.injector;
      const id = injector.get(SelectionService).focusId();
      if (id !== null) releaseClipMask(injector, id, kind);
    };
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.mask',
        slot: MENU_SLOT.OBJECT,
        label: 'Mask',
        icon: 'masks',
        order: 75,
        disabled: noSelectionFactory,
        run() {
          /* submenu parent */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.mask.make-clip',
        parentId: 'svge.builtin.object.mask',
        slot: MENU_SLOT.OBJECT,
        label: 'Make Clipping Path',
        icon: 'crop',
        shortcut: 'Ctrl+7',
        order: 10,
        tooltip:
          'O objeto de cima recorta os de baixo. Requer 2+ objetos, e o de cima ' +
          'não pode ser uma imagem — para mascarar com imagem use Make Opacity ' +
          'Mask, ou vetorize antes com Trace Image.',
        // ≥ 2 selected AND the clipper must be vector geometry (not an
        // <image> — see `cantMakeClipFactory`). Opacity Mask keeps the
        // looser `cantGroupFactory` (images are valid mask content).
        disabled: cantMakeClipFactory,
        run(runCtx) {
          makeClipMask(runCtx?.injector ?? ctx.injector, 'clipPath');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.mask.release-clip',
        parentId: 'svge.builtin.object.mask',
        slot: MENU_SLOT.OBJECT,
        label: 'Release Clipping Path',
        icon: 'crop_free',
        order: 20,
        disabled: noClipRefFactory,
        run(runCtx) {
          releaseFromFocus(runCtx, 'clipPath');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.mask.divider',
        parentId: 'svge.builtin.object.mask',
        slot: MENU_SLOT.OBJECT,
        label: '',
        order: 25,
        divider: true,
        run() {
          /* divider */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.mask.make-opacity',
        parentId: 'svge.builtin.object.mask',
        slot: MENU_SLOT.OBJECT,
        label: 'Make Opacity Mask',
        icon: 'opacity',
        order: 30,
        disabled: cantGroupFactory,
        run(runCtx) {
          makeClipMask(runCtx?.injector ?? ctx.injector, 'mask');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.mask.release-mask',
        parentId: 'svge.builtin.object.mask',
        slot: MENU_SLOT.OBJECT,
        label: 'Release Mask',
        icon: 'layers_clear',
        order: 40,
        disabled: noMaskRefFactory,
        run(runCtx) {
          releaseFromFocus(runCtx, 'mask');
        },
      }),
    );

    // ── Object ▸ Convert ▶ submenu (D-085) ──────────────────────────
    // Hosts the group↔layer converters. Trace Image (ui plugin) and
    // Outline Stroke (roadmap) are NOT here — per Option B, Convert to
    // Path + Outline Stroke live in the new top-level **Path** menu, and
    // Trace Image stays a real entry contributed by the ui plugin under
    // this same parent id (`svge.builtin.object.convert`).
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.convert',
        slot: MENU_SLOT.OBJECT,
        label: 'Convert',
        icon: 'transform',
        order: 80,
        run() {
          /* submenu parent */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.convert-to-layer',
        parentId: 'svge.builtin.object.convert',
        slot: MENU_SLOT.OBJECT,
        label: 'Convert to Layer',
        icon: 'folder_special',
        order: 20,
        disabled: cantConvertToLayerFactory,
        run(runCtx) {
          const sel = fromCtx(SelectionService, runCtx);
          const id = sel.focusId();
          if (id === null) return;
          fromCtx(CommandBus, runCtx).dispatch(new MakeLayerCommand(id));
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.convert-to-group',
        parentId: 'svge.builtin.object.convert',
        slot: MENU_SLOT.OBJECT,
        label: 'Convert Layer to Group',
        icon: 'folder',
        order: 30,
        disabled: cantConvertToGroupFactory,
        run(runCtx) {
          const sel = fromCtx(SelectionService, runCtx);
          const id = sel.focusId();
          if (id === null) return;
          const cmd = new UnmakeLayerCommand(id);
          fromCtx(CommandBus, runCtx).dispatch(cmd);
          // A single-child layer dissolves (the child is promoted) — the
          // layer id is then gone, so re-select the surviving node to keep
          // the selection live.
          const result = cmd.getResultNodeId();
          if (result !== null) sel.select(result);
        },
      }),
    );

    // ── D-074 — Smart Objects submenu ────────────────────────────
    //
    // Object ▸ Smart Object hosting the 4 Photoshop-convention
    // operations:
    //
    // - Convert to Smart Object — wraps current selection (≥1 nodes).
    // - Edit Contents — opens the wrapper's source XML in an editor
    //   dialog (provided by `svg-engine/ui`'s
    //   `builtinUiMenuContributionsPlugin`; this entry is just a
    //   placeholder hook here for keyboard-only invocation flows,
    //   wrapped behind a confirm prompt).
    // - Replace Contents — file picker for SVG; replaces children
    //   preserving wrapper transform/style/name.
    // - Release Smart Object (D-110, was "Rasterize") — unwraps, dropping
    //   the flag and hoisting children. Inverse of Convert.
    //
    // Disabled signals gate each action to its applicable target.
    const cantConvertToSmartObjectFactory = (injector: Injector): Signal<boolean> => {
      const sel = injector.get(SelectionService);
      const state = injector.get(EditorStateService);
      return computed(() => {
        const ids = sel.selectedIds();
        if (ids.size === 0) return true;
        // All selected nodes must share the same parent (Make
        // command's same-parent invariant — keeps menu honest).
        const root = state.document().root;
        let firstParentId: NodeId | null = null;
        for (const id of ids) {
          const p = findParent(root, id);
          if (p === null) return true;
          if (firstParentId === null) firstParentId = p.id;
          else if (p.id !== firstParentId) return true;
        }
        return false;
      });
    };
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
        id: 'svge.builtin.object.smart-object',
        slot: MENU_SLOT.OBJECT,
        label: 'Smart Object',
        icon: 'inventory_2',
        order: 85,
        run() {
          /* submenu parent */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.smart-object.convert',
        parentId: 'svge.builtin.object.smart-object',
        slot: MENU_SLOT.OBJECT,
        label: 'Convert to Smart Object',
        icon: 'inventory_2',
        order: 10,
        disabled: cantConvertToSmartObjectFactory,
        run(runCtx) {
          const sel = fromCtx(SelectionService, runCtx);
          const ids = Array.from(sel.selectedIds()) as NodeId[];
          if (ids.length === 0) return;
          const bus = fromCtx(CommandBus, runCtx);
          const cmd = new MakeSmartObjectCommand(ids);
          bus.dispatch(cmd);
          const newId = cmd.getCreatedWrapperId();
          if (newId !== null) sel.select(newId);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.smart-object.divider1',
        parentId: 'svge.builtin.object.smart-object',
        slot: MENU_SLOT.OBJECT,
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
        id: 'svge.builtin.object.smart-object.replace',
        parentId: 'svge.builtin.object.smart-object',
        slot: MENU_SLOT.OBJECT,
        label: 'Replace Contents…',
        icon: 'sync_alt',
        order: 30,
        disabled: notOnSmartObjectFactory,
        run(runCtx) {
          const sel = fromCtx(SelectionService, runCtx);
          const id = sel.focusId();
          if (id === null) return;
          // **D-076 refactor**: delegate to SmartObjectActionsService
          // (also consumed by the Inspector Smart Object section) so
          // both call sites share identical file-picker, parsing,
          // error handling and warning behaviour.
          fromCtx(SmartObjectActionsService, runCtx).replaceContents(id);
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'svge.builtin.object.smart-object.release',
        parentId: 'svge.builtin.object.smart-object',
        slot: MENU_SLOT.OBJECT,
        label: 'Release Smart Object',
        icon: 'view_module',
        order: 40,
        disabled: notOnSmartObjectFactory,
        run(runCtx) {
          const sel = fromCtx(SelectionService, runCtx);
          const id = sel.focusId();
          if (id === null) return;
          // **D-076 refactor**: same service powers the Inspector's Release
          // button. Kept as thin pass-through because the action is a
          // single dispatch — but funneling through the service keeps
          // the call surface uniform across plugin and panel.
          fromCtx(SmartObjectActionsService, runCtx).release(id);
        },
      }),
    );

    // ── D-066 — Trace Image moved to builtinUiMenuContributionsPlugin
    //
    // The D-065 follow-up registered a simple no-dialog Trace Image
    // entry here (defaults threshold=128, tolerance=1). D-066 replaces
    // it with a Material-dialog version (sliders + hide-source
    // checkbox + status pill) that lives in
    // builtinUiMenuContributionsPlugin — the edit/ headless plugin
    // can't open dialogs (Material is svg-engine/ui only).
    //
    // Headless consumers that want Trace Image without the dialog
    // can construct their own contribution that calls
    // `new TraceImageCommand(id, opts)` directly. The command is
    // still exported from svg-engine/edit/autotrace and works
    // standalone (no DI coupling, no dialog requirement).

    // ── Help menu ──────────────────────────────────────────────────
    //
    // **`svge.builtin.help.about` MOVED** to `builtinUiMenuContributionsPlugin`
    // in svg-engine/ui — D-044 follow-up. The edit-side plugin could
    // only call `alert()` because @angular/material/dialog can't be
    // imported here (D-017 headless boundary). Moving the Help ▸ About
    // entry to the UI plugin unlocks `<svge-about-dialog>` with proper
    // Material chrome (dialog-shell + drag/resize + focus trap + ARIA).
    // Consumers wiring builtinUiMenuContributionsPlugin get the
    // Material About automatically; consumers omitting it (rare —
    // basically headless-only consumers) won't see Help ▸ About at all,
    // which is the correct behavior for a headless build.

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
          pasteFromClipboard(runCtx, fromCtx, PASTE_OFFSET);
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

    // ── D-096 — Help ▸ Documentation / Tutorials / Plugin Development /
    //    Report Issue (external links) ─────────────────────────────────
    //
    // Ship the roadmap placeholders `svge.roadmap.help.{documentation,
    // tutorials,plugin-development,report-issue}` (removed). Each opens its
    // configured URL in a new tab. Destinations come from the host-independent,
    // DI-configurable `SVGE_HELP_LINKS` token — defaults are RELATIVE `/docs/…`
    // paths (resolve against the running app's own origin, no domain hard-coded)
    // and Report Issue → the public issue tracker. Apps repoint via
    // `provideSvgeHelpLinks`. Opening a URL needs no Material, so these live
    // edit-side (About SVG Studio, a Material dialog, stays UI-side). Always
    // enabled — Help is never gated by selection/document.
    const openHelpLink = (url: string): void => {
      if (typeof window === 'undefined') return;
      window.open(url, '_blank', 'noopener,noreferrer');
    };
    // Report Issue: enrich an http(s) target with a pre-filled `body` (page
    // URL + User-Agent) so reports arrive with basic diagnostics. Left
    // verbatim for non-web schemes (mailto:, …) or when `body` is already set.
    const buildReportIssueUrl = (base: string): string => {
      if (typeof window === 'undefined') return base;
      try {
        const u = new URL(base, window.location.href);
        if ((u.protocol === 'http:' || u.protocol === 'https:') && !u.searchParams.has('body')) {
          const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown';
          u.searchParams.set('body', `\n\n---\nPage: ${window.location.href}\nUser-Agent: ${ua}`);
          return u.toString();
        }
      } catch {
        /* not a parseable absolute URL — open verbatim (e.g. relative path) */
      }
      return base;
    };
    const HELP_LINK_ITEMS: readonly {
      readonly id: string;
      readonly label: string;
      readonly icon: string;
      readonly order: number;
      readonly key: keyof SvgeHelpLinks;
      readonly report?: boolean;
    }[] = [
      {
        id: 'svge.builtin.help.documentation',
        label: 'Documentation',
        icon: 'menu_book',
        order: 20,
        key: 'documentation',
      },
      {
        id: 'svge.builtin.help.tutorials',
        label: 'Tutorials',
        icon: 'school',
        order: 30,
        key: 'tutorials',
      },
      {
        id: 'svge.builtin.help.plugin-development',
        label: 'Plugin Development',
        icon: 'code',
        order: 50,
        key: 'pluginDevelopment',
      },
      {
        id: 'svge.builtin.help.report-issue',
        label: 'Report Issue',
        icon: 'bug_report',
        order: 60,
        key: 'reportIssue',
        report: true,
      },
    ];
    for (const item of HELP_LINK_ITEMS) {
      ctx.track(
        reg.register({
          id: item.id,
          slot: MENU_SLOT.HELP,
          label: item.label,
          icon: item.icon,
          order: item.order,
          run(runCtx) {
            const links = fromCtx(SVGE_HELP_LINKS, runCtx);
            const url = item.report ? buildReportIssueUrl(links[item.key]) : links[item.key];
            openHelpLink(url);
          },
        }),
      );
    }

    // ── D-098 — Window ▸ Panels (reveal real panels) ──────────────────
    //
    // Ship the roadmap placeholders `svge.roadmap.window.panels.*` (removed):
    // each item now asks the active shell to reveal the matching panel via
    // the layout-independent `PanelHostService.reveal(PANEL_ID.*)`. The menu
    // knows ONLY the logical id — the shell maps it to wherever the panel
    // lives today (which `<svge-panel-group>` tab, collapsed or not). When
    // the layout changes, only the shell's mapping changes; this list is
    // untouched. The handler is headless (no Material) so it lives edit-side.
    //
    // The list mirrors the **actual** right-rail tabs of `<svge-shell-pro>`
    // (the only built-in shell with a panel rail). The previous placeholders
    // listed panels that don't exist as docked panels (Transform — an
    // Inspector section; Assets / Plugins — not panels; Inspector — same as
    // Properties; Pages — an always-visible overlay; Effects — same as
    // Appearance), so they're dropped rather than shipped as dead reveals.
    // Children of the `svge.window.panels` structural parent (registered by
    // `builtinRoadmapMenuPlugin`). Always enabled — reveal is a no-op when
    // no shell hosts the panel (headless / minimal shells).
    const PANEL_REVEAL_ITEMS: readonly {
      readonly id: string;
      readonly label: string;
      readonly icon: string;
      readonly order: number;
      readonly panelId: string;
    }[] = [
      {
        id: 'svge.window.panels.layers',
        label: 'Layers',
        icon: 'layers',
        order: 10,
        panelId: PANEL_ID.LAYERS,
      },
      {
        id: 'svge.window.panels.history',
        label: 'History',
        icon: 'history',
        order: 20,
        panelId: PANEL_ID.HISTORY,
      },
      {
        id: 'svge.window.panels.properties',
        label: 'Properties',
        icon: 'tune',
        order: 30,
        panelId: PANEL_ID.PROPERTIES,
      },
      {
        id: 'svge.window.panels.appearance',
        label: 'Appearance',
        icon: 'auto_awesome',
        order: 40,
        panelId: PANEL_ID.APPEARANCE,
      },
      {
        id: 'svge.window.panels.export',
        label: 'Export',
        icon: 'download',
        order: 50,
        panelId: PANEL_ID.EXPORT,
      },
      {
        id: 'svge.window.panels.gradient',
        label: 'Gradient',
        icon: 'gradient',
        order: 60,
        panelId: PANEL_ID.GRADIENT,
      },
    ];
    for (const item of PANEL_REVEAL_ITEMS) {
      ctx.track(
        reg.register({
          id: item.id,
          parentId: 'svge.window.panels',
          slot: MENU_SLOT.WINDOW,
          label: item.label,
          icon: item.icon,
          order: item.order,
          run(runCtx) {
            fromCtx(PanelHostService, runCtx).reveal(item.panelId);
          },
        }),
      );
    }
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
  // **D-103** — select inside the ACTIVE PAGE, not the document root. After
  // PAGES-REFACTOR the root's top-level children are PAGES, so selecting
  // `root.children` selected the page node itself — which shows no selection
  // overlay (a page is the artboard, not a user object), hence "nothing
  // appears selected". `treeForRendering()` is the active page's GroupNode
  // (or the root when no page), i.e. the container of the visible, selectable
  // objects — the same subtree the renderer paints. Matches Illustrator's
  // "select all on the active artboard".
  const container = fromCtx(ActivePageService, runCtx).treeForRendering();
  if (container.type !== 'group' || container.children.length === 0) return;
  fromCtx(SelectionService, runCtx).selectMany(container.children.map((c) => c.id));
}

/**
 * **D-120** — `Edit ▸ Select ▸ Invert Selection`. Selects every top-level
 * object on the active page that is NOT currently selected (and drops the
 * ones that are). Mirrors {@link selectAllTopLevel}'s universe — the active
 * page's direct children (`treeForRendering()`), i.e. Illustrator's "invert
 * on the active artboard" — so Select All and Invert stay consistent.
 *
 * Lock-awareness is free: `SelectionService.selectMany` filters out locked
 * ids, so a locked object never enters the inverted selection (it also can't
 * be in the current selection, so it's simply never selectable — correct).
 */
function invertSelection(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  const container = fromCtx(ActivePageService, runCtx).treeForRendering();
  if (container.type !== 'group' || container.children.length === 0) return;
  const selected = fromCtx(SelectionService, runCtx).selectedIds();
  const inverted = container.children.filter((c) => !selected.has(c.id)).map((c) => c.id);
  fromCtx(SelectionService, runCtx).selectMany(inverted);
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

/**
 * **D-102** — default offset for a plain **Paste**. Matches
 * `DuplicateNodeCommand`'s 10px (Figma / Affinity convention) so the pasted
 * copy lands visibly off the original instead of stacked exactly on top.
 * **Paste In Place** passes a zero offset to keep the original coordinates
 * (Illustrator's Ctrl+Shift+V semantics).
 */
const PASTE_OFFSET: Point = { x: 10, y: 10 };

/**
 * Paste the clipboard into the active page (`AUTO_PARENT`). `offset` shifts
 * every pasted node in its parent's coordinate space:
 *
 * - `PASTE_OFFSET` (plain **Paste**) → the copy is visible, not stacked on
 *   the original. (The pre-D-102 Paste used no offset, i.e. it was already
 *   effectively "paste in place" — which made the original placeholder
 *   redundant; D-102 splits the two so each is distinct.)
 * - `{ x: 0, y: 0 }` (**Paste In Place**) → exact original coordinates.
 */
function pasteFromClipboard(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
  offset: Point,
): void {
  const clipboard = fromCtx(ClipboardService, runCtx);
  const nodes = clipboard.paste();
  if (nodes.length === 0) return;
  const bus = fromCtx(CommandBus, runCtx);
  const inPlace = offset.x === 0 && offset.y === 0;
  // **PAGES-REFACTOR Fase 1**: AUTO_PARENT — CommandBus resolves the
  // active page (or root) via INSERT_PARENT_RESOLVER, no manual lookup.
  for (const node of nodes) {
    // Compose the offset onto the top-level node only — descendants keep
    // their relative transforms, so a pasted group shifts as a whole
    // (same approach as DuplicateNodeCommand).
    const placed: SvgNode = inPlace
      ? node
      : { ...node, transform: multiply(translate(offset.x, offset.y), node.transform) };
    bus.dispatch(new InsertNodeCommand(AUTO_PARENT, placed));
  }
  // Select the newly-pasted nodes so subsequent operations target them
  // (matches the convention of every professional editor). Ids are
  // preserved by the spread, so the original `nodes` ids still match.
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

/**
 * **D-118** — `View ▸ Zoom ▸ Fit Selection`. Frames the current selection's
 * world bounding box in the viewport. Model-based (no DOM): reads the scoped
 * `EditorStateService` document + `SelectionService` ids, so it's multi-editor
 * safe. No-op for an empty selection (the menu item is also disabled then).
 */
function zoomFitSelection(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  const ids = fromCtx(SelectionService, runCtx).selectedIds();
  if (ids.size === 0) return;
  const root = fromCtx(EditorStateService, runCtx).document().root;
  const box = getNodesWorldBBox(root, ids);
  if (box !== null) fromCtx(ViewportService, runCtx).fitBox(box);
}

/**
 * **D-119** — `View ▸ Zoom ▸ Fit Canvas`. Frames all drawn content in the
 * active canvas. Model-based via {@link getNodeBBox} over the rendered tree —
 * the active page in pages mode, or the document root in legacy (pre-D-079)
 * mode — so it's multi-editor safe and, unlike a page-viewBox fit, includes
 * art that overflows the page (e.g. imported SVGs whose content spills outside
 * the artboard — D-115).
 *
 * **Empty-canvas fallback**: `getNodeBBox` of a content-less group is a
 * degenerate zero-area box at the group origin, which would make `fitBox`
 * zoom into a point. So when there's no content we frame the page's viewBox
 * (or the document viewBox in legacy mode) exactly instead — "Fit Canvas" on
 * a blank page still does the sensible thing (fit the artboard).
 */
function zoomFitCanvas(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  const pages = fromCtx(ActivePageService, runCtx);
  const state = fromCtx(EditorStateService, runCtx);
  const page = pages.activePage();
  const tree: SvgNode = page !== null ? (page as unknown as SvgNode) : state.document().root;
  const content = getNodeBBox(tree);
  const viewport = fromCtx(ViewportService, runCtx);
  if (content.width > 0 && content.height > 0) {
    viewport.fitBox(content);
  } else {
    const frame = pages.activePageViewBox() ?? state.document().viewBox;
    viewport.fitBox(frame, 0);
  }
}

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
  // **D-111** — bootstrap Page 1 so the fresh document opens with an active
  // page, matching the editor's mount-time bootstrap (which only fires once at
  // construction and so does NOT re-run on New). `resetDocument()` leaves a
  // pageless root; without this, tools would draw into the root and the page
  // overlay would vanish. `ActivePageService`'s auto-recovery effect then makes
  // the new Page 1 active (it auto-picks the first page when the current id is
  // invalid). Dispatched BEFORE `history.clear()` so the page-create isn't a
  // stray undo step — "new doc + Page 1" is the clean baseline.
  fromCtx(CommandBus, runCtx).dispatch(new EnsureDefaultPageCommand());
  fromCtx(HistoryService, runCtx).clear();
  fromCtx(ViewportService, runCtx).reset();
  fromCtx(SelectionService, runCtx).clear();
}

/**
 * **D-115** — extension-dispatched `File ▸ Open…`. Opens a file picker and
 * routes by file extension:
 *
 * - `.svg` → {@link openSvgText} (replace the workspace with the file's content
 *   in a page sized to its viewBox).
 * - the editor's proprietary format (extension TBD) → its own loader, once
 *   defined. The `default` branch is the wiring point: add a `case` for the new
 *   extension and an `accept` entry below.
 *
 * Unlike `File ▸ Import ▸ SVG…` (ADDITIVE — places art into the CURRENT
 * document), Open REPLACES the workspace, mirroring `File ▸ New` (confirm +
 * fresh document + a new active page) — but the page is sized from the file
 * instead of the editor default.
 */
function openFromFile(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  if (typeof document === 'undefined') return;
  const input = document.createElement('input');
  input.type = 'file';
  // D-137/D-138: `.svgz` (compressed SVG) plus `.svge`/`.svgez` (workspace,
  // readable + gzipped) join `.svg` — `File ▸ Open…` opens any of them.
  input.accept = '.svg,.svgz,.svge,.svgez,image/svg+xml';
  input.style.display = 'none';
  input.addEventListener(
    'change',
    () => {
      const file = input.files?.[0];
      input.remove();
      if (file === undefined || file === null) return;
      const dot = file.name.lastIndexOf('.');
      const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
      const fail = (err: unknown): void => {
        if (typeof window !== 'undefined') {
          window.alert(
            `Could not read "${file.name}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      };
      // D-138: workspace file (JSON envelope; `.svgez` is the gzipped variant).
      if (ext === 'svge' || ext === 'svgez') {
        void readWorkspaceFileText(file)
          .then((text) => openWorkspaceText(runCtx, fromCtx, text))
          .catch(fail);
        return;
      }
      if (ext !== 'svg' && ext !== 'svgz') {
        if (typeof window !== 'undefined') {
          window.alert(`Opening ".${ext}" files is not supported yet.`);
        }
        return;
      }
      // D-137: `.svgz` is decompressed first; both branches end at SVG text.
      void readSvgFileText(file)
        .then((text) => openSvgText(runCtx, fromCtx, text, file.name))
        .catch(fail);
    },
    { once: true },
  );
  document.body.appendChild(input);
  input.click();
}

/**
 * **D-137** — read a picked file as SVG text. `.svgz` (gzip-compressed SVG) is
 * decompressed via {@link gunzipText}; plain `.svg` is read as text directly.
 * Dispatched by extension so `File ▸ Open…` and `File ▸ Import ▸ SVG…` share
 * one decode path.
 */
function readSvgFileText(file: File): Promise<string> {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  if (ext === 'svgz') {
    return file.arrayBuffer().then((buffer) => gunzipText(buffer));
  }
  return file.text();
}

/**
 * **D-115** — parse + open an SVG string as a fresh document. Confirms before
 * discarding (like `File ▸ New`), then hands the parsed document to
 * {@link openSvgDocument}. Best-effort: a malformed file alerts and aborts
 * without touching the current workspace.
 */
function openSvgText(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
  text: string,
  // **D-136** — file name (when known) to record in the recent-files MRU after
  // a successful open. Omitted for paste-style opens with no source name.
  sourceName?: string,
): void {
  const result = svgImporter.import(text);
  if (!result.ok) {
    if (typeof window !== 'undefined') window.alert(`Open failed: ${result.error}`);
    return;
  }
  // Confirm BEFORE replacing — only when there's work to lose (matches New).
  if (typeof window !== 'undefined') {
    const root = fromCtx(EditorStateService, runCtx).document().root;
    const hasContent = root.type === 'group' && root.children.length > 0;
    if (hasContent && !window.confirm('Discard the current document and open this file?')) {
      return;
    }
  }
  openSvgDocument(runCtx, fromCtx, result.document);
  // **D-136** — record only after the document was actually replaced (past the
  // confirm + successful import), so a cancelled open never pollutes the MRU.
  // Reopening from a recent entry re-records it → it moves back to the top.
  if (sourceName !== undefined) {
    fromCtx(RecentFilesService, runCtx).record(sourceName, text);
  }
  if (result.warnings.length > 0 && typeof console !== 'undefined') {
    console.warn(`[SVGEngine] Open warnings:\n${result.warnings.join('\n')}`);
  }
}

/**
 * **D-115** — install `parsed` as the editor's document, sized to the file.
 *
 * - `resetDocument(parsed)` replaces the workspace; `parsed.viewBox` carries the
 *   file's viewBox, which becomes the document's coordinate system.
 * - `EnsureDefaultPageCommand` wraps the file's top-level content into a fresh
 *   `Page 1` **sized to `parsed.viewBox`** (its `withPageFlag(group, doc.viewBox)`
 *   path). For our OWN multi-page exports (which import WITH page flags) the
 *   command is a no-op and the original pages load verbatim.
 * - Content positioned OUTSIDE the viewBox stays inside Page 1 and still
 *   renders — the renderer is `overflow: visible` and the page is a plain group
 *   (no clip). The page frames the viewBox; the canvas keeps showing the rest.
 * - History is cleared (Open is a new baseline, not an undo step), the viewport
 *   frames the page, and selection is cleared. Mirrors `newDocument`.
 */
function openSvgDocument(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
  parsed: SvgDocument,
): void {
  fromCtx(EditorStateService, runCtx).resetDocument(parsed);
  fromCtx(CommandBus, runCtx).dispatch(new EnsureDefaultPageCommand());
  fromCtx(HistoryService, runCtx).clear();
  fromCtx(ViewportService, runCtx).fit();
  fromCtx(SelectionService, runCtx).clear();
}

function importSvgFromFile(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
  // **D-139** — the text handler is pluggable: `importSvgTextAdditive` (default,
  // `Import ▸ SVG…`) inserts loose; `importSmartObjectText` wraps the import as a
  // single Smart Object (`Import ▸ Smart Object…`). Both share this picker.
  handle: (
    runCtx: MenuContributionContext | undefined,
    fromCtx: Resolver,
    text: string,
  ) => void = importSvgTextAdditive,
): void {
  if (typeof document === 'undefined') return;
  // Programmatic <input type="file"> — no UI scaffolding required.
  // Pattern matches what `/svg-viewer` route does (browser-native flow,
  // works without Material).
  const input = document.createElement('input');
  input.type = 'file';
  // D-137: accept compressed `.svgz` too (decompressed in readSvgFileText).
  input.accept = '.svg,.svgz,image/svg+xml';
  input.style.display = 'none';
  input.addEventListener(
    'change',
    () => {
      const file = input.files?.[0];
      input.remove();
      if (file === undefined || file === null) return;
      void readSvgFileText(file)
        .then((text) => handle(runCtx, fromCtx, text))
        .catch((err: unknown) => {
          if (typeof window !== 'undefined') {
            window.alert(
              `Could not read "${file.name}": ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        });
    },
    { once: true },
  );
  document.body.appendChild(input);
  input.click();
}

/**
 * **D-105/D-116** — parse `text` as an SVG and insert it ADDITIVELY into the
 * current document (never replaces it). Shared by `File ▸ Import ▸ SVG…` (file)
 * and `File ▸ Import ▸ From URL…` (fetched SVG). Best-effort: a malformed SVG
 * alerts and aborts without touching the document.
 */
function importSvgTextAdditive(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
  text: string,
): void {
  const result = svgImporter.import(text);
  if (!result.ok) {
    if (typeof window !== 'undefined') window.alert(`Import failed: ${result.error}`);
    return;
  }
  processImportedSvgDocument(runCtx, fromCtx, result.document);
  if (result.warnings.length > 0 && typeof console !== 'undefined') {
    console.warn(`[SVGEngine] Import warnings:\n${result.warnings.join('\n')}`);
  }
}

/**
 * **D-139** — parse `text` as an SVG and insert it ADDITIVELY as a single Smart
 * Object (D-074) on the active page. Unlike {@link importSvgTextAdditive}, the
 * imported art is wrapped as one non-destructive, editable-in-isolation unit;
 * and it always uses the centered insertion (not the interactive `place`
 * gesture) for predictable behavior. Best-effort: a malformed SVG alerts and
 * aborts without touching the document.
 */
function importSmartObjectText(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
  text: string,
): void {
  const result = svgImporter.import(text);
  if (!result.ok) {
    if (typeof window !== 'undefined') window.alert(`Import failed: ${result.error}`);
    return;
  }
  placeImportedSvgIntoActivePage(runCtx, fromCtx, result.document, true);
  if (result.warnings.length > 0 && typeof console !== 'undefined') {
    console.warn(`[SVGEngine] Import (Smart Object) warnings:\n${result.warnings.join('\n')}`);
  }
}

/**
 * **D-107/D-116** — route a parsed import to the active placement mode:
 *
 * - `'place'`: hand the art to `ImportPlacementService` (drag a rectangle).
 * - `'centered'` (default): insert at natural 1:1 size centered on the active
 *   page (D-106).
 *
 * Either way the import is ADDITIVE — inserted into the active page, preserving
 * every existing page + element (the old replace-the-document flow was D-105's
 * data-loss bug).
 */
function processImportedSvgDocument(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
  doc: SvgDocument,
): void {
  if (fromCtx(ImportSettingsService, runCtx).placementMode() === 'place') {
    beginImportPlacement(runCtx, fromCtx, doc);
  } else {
    placeImportedSvgIntoActivePage(runCtx, fromCtx, doc);
  }
}

/**
 * **D-116** — `File ▸ Import ▸ From URL…`. Prompts for a web image URL, fetches
 * it, classifies SVG vs raster (Content-Type, then extension, then content
 * sniff), and imports ADDITIVELY — SVG via {@link importSvgTextAdditive}
 * (identical to `Import ▸ SVG…`), raster via an embedded `<image>`
 * ({@link importRasterFromHref}).
 *
 * **CORS**: the fetch is cross-origin and may be blocked. Rasters fall back to
 * REFERENCING the URL directly (`<image href>` loads cross-origin without CORS);
 * SVGs need the text, so a blocked SVG fetch guides the user to download +
 * `Import ▸ SVG…`. The URL is user-pasted (a direct user action), and SVG
 * content is sanitised by `svgImporter`; only http(s) URLs are accepted.
 */
function importFromUrl(runCtx: MenuContributionContext | undefined, fromCtx: Resolver): void {
  if (typeof window === 'undefined') return;
  const raw = window.prompt('Paste an image URL (SVG or raster):');
  if (raw === null) return; // cancelled
  const url = raw.trim();
  if (url.length === 0) return;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    window.alert('That does not look like a valid URL.');
    return;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    window.alert('Only http(s) image URLs are supported.');
    return;
  }
  if (typeof fetch === 'undefined') {
    window.alert('Importing from a URL is not available in this environment.');
    return;
  }
  void fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
      const kind = classifyImageUrl(contentType, parsed.pathname);
      if (kind === 'raster') {
        return res
          .blob()
          .then((blob) => blobToDataUrl(blob))
          .then((dataUrl) => insertRasterImageFromHref(runCtx?.injector, dataUrl));
      }
      // SVG, or unknown — read the text and confirm it really is an `<svg>`
      // root before importing; otherwise treat it as a raster reference.
      return res.text().then((text) => {
        if (
          kind === 'svg' ||
          /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(text)
        ) {
          importSvgTextAdditive(runCtx, fromCtx, text);
        } else {
          insertRasterImageFromHref(runCtx?.injector, url);
        }
      });
    })
    .catch(() => {
      // Fetch blocked (usually CORS) or network error. A raster can still be
      // referenced directly; an SVG needs its text, so guide the user.
      if (classifyImageUrl('', parsed.pathname) === 'svg') {
        window.alert(
          'Could not fetch that SVG — the server may block cross-origin requests. ' +
            'Download the file and use File ▸ Import ▸ SVG… instead.',
        );
      } else {
        insertRasterImageFromHref(runCtx?.injector, url);
      }
    });
}

/**
 * **D-116** — classify an image source as `'svg'` / `'raster'` / `'unknown'`,
 * preferring the HTTP `Content-Type` and falling back to the URL extension.
 * Exported for unit testing; the fetch/decode/insert path is DOM-bound.
 */
export function classifyImageUrl(
  contentType: string,
  pathname: string,
): 'svg' | 'raster' | 'unknown' {
  if (contentType.includes('svg')) return 'svg';
  if (contentType.startsWith('image/')) return 'raster';
  const ext = pathname.slice(pathname.lastIndexOf('.') + 1).toLowerCase();
  if (ext === 'svg') return 'svg';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico'].includes(ext)) return 'raster';
  return 'unknown';
}

/**
 * Center point for additive inserts: the active page's artboard center, or the
 * visible viewport center when no page is active. Used by the SVG `'centered'`
 * import. (The raster path lives in `import-image/raster-image-import.ts`.)
 */
function activeInsertionCenter(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
): { cx: number; cy: number } {
  const pageVb = fromCtx(ActivePageService, runCtx).activePageViewBox();
  if (pageVb !== null) {
    return { cx: pageVb.x + pageVb.width / 2, cy: pageVb.y + pageVb.height / 2 };
  }
  const vp = fromCtx(ViewportService, runCtx).viewBox();
  return { cx: vp.x + vp.width / 2, cy: vp.y + vp.height / 2 };
}

/**
 * **D-105** — insert imported SVG content **additively** into the active
 * page (never replaces the document).
 *
 * - The importer already returns the file's children wrapped in a group;
 *   it's inserted at its **natural 1:1 size**, centered on the active page's
 *   artboard (D-106 — the "100% centered" mode chosen by the user). When no
 *   page is active it centers on the visible viewport instead.
 * - The imported `<defs>` (gradients / filters / patterns referenced via
 *   `url(#id)`) are merged into the document defs so the art resolves.
 *   Done as a direct state update; on undo the inserted group is removed
 *   and the now-unused defs linger harmlessly.
 * - Inserts via `InsertNodeCommand(AUTO_PARENT, …)` — one undo entry, lands
 *   inside the active page — then selects the result so the user can
 *   immediately reposition / resize it with the normal selection handles.
 *
 * **Companion (D-107)**: {@link beginImportPlacement} is the interactive
 * "drag a placement rectangle on the canvas" alternative (Illustrator's
 * *Place*), selected via the persisted `ImportSettingsService` preference.
 */
function placeImportedSvgIntoActivePage(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
  doc: SvgDocument,
  // **D-139** — when true, the imported group is flagged as a Smart Object
  // (D-074) so it lands as a single non-destructive, editable-in-isolation unit
  // (File ▸ Import ▸ Smart Object…). Default false = plain additive import.
  asSmartObject = false,
): void {
  const imported = doc.root;
  if (imported.type !== 'group' || imported.children.length === 0) return;

  // **D-106** — insert at the file's NATURAL 1:1 size, centered on the
  // ACTIVE PAGE's artboard (fall back to the visible viewport center when no
  // page is active). This is the user-chosen "100% centered" default.
  // **D-113** — center on the art's CONTENT box, not the viewBox: exports that
  // park a small graphic in a big artboard would otherwise center the empty
  // artboard (art lands off-center / out of view).
  const src = placementBounds(imported, doc.viewBox);
  const srcCx = src.x + src.width / 2;
  const srcCy = src.y + src.height / 2;

  const { cx, cy } = activeInsertionCenter(runCtx, fromCtx);

  // Scale 1 (natural); translate so the art's center lands on the page center.
  const placedBase = {
    ...imported,
    transform: [1, 0, 0, 1, cx - srcCx, cy - srcCy] as Transform,
  };
  // **D-139** — wrap the imported group as a Smart Object (D-074) when requested.
  const placed: SvgNode = asSmartObject ? withSmartObjectFlag(placedBase) : placedBase;

  const state = fromCtx(EditorStateService, runCtx);
  const importedDefs = doc.defs;
  if (importedDefs !== undefined && importedDefs.length > 0) {
    const current = state.document();
    state.setDocument({ ...current, defs: `${current.defs ?? ''}\n${importedDefs}` });
  }

  // AUTO_PARENT → the active page (or root) via the CommandBus resolver.
  fromCtx(CommandBus, runCtx).dispatch(new InsertNodeCommand(AUTO_PARENT, placed));
  fromCtx(SelectionService, runCtx).select(placed.id);
}

/**
 * **D-107** — hand the parsed import to {@link ImportPlacementService} for
 * the interactive *place* gesture (the user drags a rectangle on the canvas;
 * the `<svge-import-placement-overlay>` captures the drag and the service
 * commits the fit, defs-merge, insert + select). No-op when the import is
 * empty. Used when the persisted placement preference is `'place'`.
 */
function beginImportPlacement(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
  doc: SvgDocument,
): void {
  const imported = doc.root;
  if (imported.type !== 'group' || imported.children.length === 0) return;
  fromCtx(ImportPlacementService, runCtx).begin({
    group: imported,
    // **D-113** — fit the art's CONTENT box (not the oversized artboard) to the
    // drawn rectangle, so a small graphic on a big viewBox doesn't import as a
    // near-invisible sliver.
    src: placementBounds(imported, doc.viewBox),
    defs: doc.defs,
  });
}

/**
 * **D-109** — `Object ▸ Rasterize`. For each selected (unlocked) node, render
 * just that node to a PNG at `scale`× and replace it with a raster `<image>`
 * at the same parent slot ({@link RasterizeNodeCommand}, one undo each). The
 * node's own transform (incl. rotation) is baked into the bitmap; the image
 * inherits the unchanged ancestor transforms, so it lands exactly where the
 * vector was — no inverse-matrix math (see `getRenderedNodeLocalBBox`).
 *
 * Async (canvas-based rendering). **Measures every node's bounds from the
 * live `<svg>` BEFORE any dispatch** — a dispatch re-renders and replaces the
 * `<g data-node-id>` elements, which would invalidate later `getBBox()`
 * lookups. Browser-only (needs the rendered SVG + canvas); no-ops headless.
 */
async function rasterizeSelection(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
  scale: number,
): Promise<void> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
  if (svg === null) return;
  const selection = fromCtx(SelectionService, runCtx);
  const layers = fromCtx(LayersService, runCtx);
  const state = fromCtx(EditorStateService, runCtx);
  const activeDefs = fromCtx(ActiveDefsService, runCtx);
  const bus = fromCtx(CommandBus, runCtx);

  const doc = state.document();
  const targets: { id: NodeId; node: SvgNode; box: BoundingBox }[] = [];
  for (const id of selection.selectedIds()) {
    if (layers.isLocked(id)) continue;
    const node = findNodeById(doc.root, id);
    if (node === null) continue;
    const box = getRenderedNodeLocalBBox(svg, id);
    if (box === null) continue;
    targets.push({ id, node, box });
  }
  if (targets.length === 0) return;

  // Compose the full defs the SAME way the SVG exporter does (D-058) so any
  // url(#id) references in the isolated render resolve to a real definition.
  const defs = activeDefs.buildExportDefs(doc.defs);

  for (const t of targets) {
    // Sub-document = the node alone, viewBox = its parent-local bounds. The
    // node keeps its own transform, so it fills the viewBox; renderPng crops
    // to exactly that region at `scale`× device pixels.
    const sub: SvgDocument = {
      id: generateNodeId(),
      viewBox: t.box,
      root: createGroup([t.node]),
      defs,
    };
    let href: string;
    try {
      const blob = await renderPng(sub, scale);
      href = await blobToDataUrl(blob);
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[SVGEngine] Rasterize failed:', e);
      continue;
    }
    const image = createImage(
      { x: t.box.x, y: t.box.y, width: t.box.width, height: t.box.height, href },
      // Keep the original name/metadata so the layer panel stays continuous
      // (mirrors ConvertNodeToPathCommand preserving metadata).
      { metadata: t.node.metadata },
    );
    bus.dispatch(new RasterizeNodeCommand(t.id, image));
  }
}

/** Read a Blob as a base64 `data:` URL (self-contained; survives SVG export). */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

async function exportAndDownload(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
  format: 'svg' | 'png' | 'svgz',
  animated = false,
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
  // PAGES-FIX-4: when a page is active, the export contains only that
  // page's content (the page's viewBox becomes the SVG viewBox,
  // the page's children become the root children — no `<g
  // data-svge-kind="page">` wrapper). Multi-page docs still
  // round-trip via the importer's page detection; this is purely
  // an export-side projection.
  const activePage = fromCtx(ActivePageService, runCtx);
  const docWithDefs = { ...docRaw, defs: activeDefs.buildExportDefs(docRaw.defs) };
  let doc = activePage.effectiveExportDoc(docWithDefs);
  // **D-082 F9d — Animated SVG (SMIL) export.** `effectiveExportDoc` projects
  // the active page by replacing the root's children with the page's children
  // — which DROPS the page group that carries the AnimationDoc in its
  // customData. Re-attach the active container's AnimationDoc onto the exported
  // root (whose descendants are the animated nodes) and flip the opt-in flag so
  // the exporter (F9c) injects the SMIL elements. Skipped when there are no
  // tracks (a plain SVG export then).
  if (animated && format === 'svg') {
    const animDoc = fromCtx(AnimationService, runCtx).doc();
    if (animDoc.tracks.length > 0) {
      doc = {
        ...doc,
        root: {
          ...doc.root,
          metadata: {
            ...doc.root.metadata,
            customData: { ...doc.root.metadata.customData, [ANIMATION_KEY]: animDoc },
          },
        },
        exportPreferences: { ...doc.exportPreferences, emitSmilAnimation: true },
      };
    }
  }
  // D-137: SVGZ reuses the entire SVG export pipeline (defs merge, page
  // projection) and gzips the result — `svgzExporter` returns a Blob.
  const exporter = format === 'png' ? pngExporter : format === 'svgz' ? svgzExporter : svgExporter;
  // `Exporter.export` may return `string` (SVG) or `Promise<string | Blob>`
  // (PNG, SVGZ). Normalize both branches into a Blob for download.
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
  anchor.download = `untitled${animated ? '-animated' : ''}.${exporter.extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Defer revoke so the browser has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── D-138 — Save / Open Workspace (.svge / .svgez) ────────────────
//
// The workspace round-trip wraps the FULL multi-page SVG (used defs already
// materialized — the same `ActiveDefsService` merge the Export commands use)
// in a versioned JSON envelope, plus the editor-only state SVG can't hold:
// active page, viewport (pan/zoom) and the `WorkspaceService` presentation
// config. See `workspace-file.ts` for the codec + format rationale; `.svgez`
// is the gzipped variant (D-137 helpers).

/** Capture the editor-only state that travels alongside the document. */
function captureEditorState(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
): WorkspaceEditorState {
  const pages = fromCtx(PagesService, runCtx).pages();
  const activeId = fromCtx(ActivePageService, runCtx).activePageId();
  // Page ids don't survive the SVG round-trip (the exporter omits group ids)
  // but child order does — anchor the active page by INDEX.
  const index = activeId === null ? -1 : pages.findIndex((p) => p.id === activeId);
  const viewport = fromCtx(ViewportService, runCtx);
  const ws = fromCtx(WorkspaceService, runCtx);
  return {
    activePageIndex: index >= 0 ? index : null,
    viewport: {
      zoom: viewport.zoom(),
      panX: viewport.panX(),
      panY: viewport.panY(),
      contentBox: viewport.contentBox(),
    },
    workspace: {
      background: ws.background(),
      page: ws.page(),
      grid: ws.grid(),
      rulers: ws.rulers(),
      guides: ws.guides(),
      guidesLocked: ws.guidesLocked(),
      interaction: ws.interaction(),
    },
  };
}

/**
 * Restore the `WorkspaceService` presentation config from a parsed file.
 * The service's own setters re-validate each value (defense in depth), so a
 * partially-corrupt file degrades field-by-field instead of throwing.
 */
function applyWorkspaceConfigState(
  ws: WorkspaceService,
  cfg: WorkspaceConfigState | undefined,
): void {
  if (cfg === undefined) return;
  if (cfg.background !== undefined) ws.setBackground(cfg.background);
  if (cfg.page !== undefined) ws.patchPage(cfg.page);
  if (cfg.grid !== undefined) ws.patchGrid(cfg.grid);
  if (cfg.rulers !== undefined) ws.setRulersEnabled(cfg.rulers.enabled);
  if (cfg.interaction !== undefined) ws.patchInteraction(cfg.interaction);
  // Replace any existing guides with the saved set. `clearGuides` resets the
  // lock, so re-apply it afterwards. Guide ids regenerate — only axis +
  // position are meaningful.
  ws.clearGuides();
  if (cfg.guides !== undefined) {
    for (const g of cfg.guides) ws.addGuide(g.axis, g.position);
  }
  if (cfg.guidesLocked !== undefined) ws.setGuidesLocked(cfg.guidesLocked);
}

/** Trigger a browser download of `blob` saved as `filename`. */
function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * **D-138** — serialize the whole workspace to `.svge` (readable JSON) or
 * `.svgez` (gzipped) and download it. The document is the FULL multi-page SVG
 * with used defs materialized — NOT the active-page projection used by Export.
 */
async function saveWorkspace(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
  compressed: boolean,
): Promise<void> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const raw = fromCtx(EditorStateService, runCtx).document();
  const activeDefs = fromCtx(ActiveDefsService, runCtx);
  const docWithDefs: SvgDocument = { ...raw, defs: activeDefs.buildExportDefs(raw.defs) };
  const svg = svgExporter.export(docWithDefs);
  if (typeof svg !== 'string') {
    if (typeof window !== 'undefined') window.alert('Save failed: exporter returned non-string.');
    return;
  }
  const json = serializeWorkspace(svg, captureEditorState(runCtx, fromCtx));
  try {
    if (compressed) {
      const bytes = await gzipText(json);
      downloadBlob(new Blob([bytes as BlobPart], { type: 'application/gzip' }), 'untitled.svgez');
    } else {
      downloadBlob(new Blob([json], { type: 'application/json' }), 'untitled.svge');
    }
  } catch (err) {
    if (typeof window !== 'undefined')
      window.alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * **D-138** — parse `.svge` JSON text, import its document, and restore the
 * editor state (workspace config, active page by index, viewport). Confirms
 * before discarding a non-empty document (like {@link openSvgText}).
 */
function openWorkspaceText(
  runCtx: MenuContributionContext | undefined,
  fromCtx: Resolver,
  text: string,
): void {
  const parsed = parseWorkspace(text);
  if (!parsed.ok) {
    if (typeof window !== 'undefined') window.alert(`Open failed: ${parsed.error}`);
    return;
  }
  const result = svgImporter.import(parsed.document);
  if (!result.ok) {
    if (typeof window !== 'undefined') window.alert(`Open failed: ${result.error}`);
    return;
  }
  if (typeof window !== 'undefined') {
    const root = fromCtx(EditorStateService, runCtx).document().root;
    const hasContent = root.type === 'group' && root.children.length > 0;
    if (hasContent && !window.confirm('Discard the current document and open this workspace?')) {
      return;
    }
  }
  // Install the document — mirrors `openSvgDocument` but restores the saved
  // viewport / active page instead of framing + fitting.
  fromCtx(EditorStateService, runCtx).resetDocument(result.document);
  fromCtx(CommandBus, runCtx).dispatch(new EnsureDefaultPageCommand());
  fromCtx(HistoryService, runCtx).clear();
  fromCtx(SelectionService, runCtx).clear();
  applyWorkspaceConfigState(fromCtx(WorkspaceService, runCtx), parsed.editor.workspace);
  const pages = fromCtx(PagesService, runCtx).pages();
  const index = parsed.editor.activePageIndex;
  if (index !== null && index >= 0 && index < pages.length) {
    fromCtx(ActivePageService, runCtx).setActive(pages[index]!.id);
  }
  const vp = parsed.editor.viewport;
  const viewport = fromCtx(ViewportService, runCtx);
  if (vp !== undefined) {
    viewport.setContentBox(vp.contentBox);
    viewport.setZoom(vp.zoom);
    viewport.setPan(vp.panX, vp.panY);
  } else {
    viewport.fit();
  }
  if (result.warnings.length > 0 && typeof console !== 'undefined') {
    console.warn(`[SVGEngine] Open workspace warnings:\n${result.warnings.join('\n')}`);
  }
}

/**
 * **D-138** — read a picked workspace file as JSON text. `.svgez` (gzipped) is
 * decompressed via {@link gunzipText}; `.svge` is read as text directly.
 */
function readWorkspaceFileText(file: File): Promise<string> {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  if (ext === 'svgez') {
    return file.arrayBuffer().then((buffer) => gunzipText(buffer));
  }
  return file.text();
}

// ── D-074 — Smart Object: Replace Contents (file picker) ──────────
//
// **D-076 refactor**: the file-picker + parse + dispatch flow lives in
// `SmartObjectActionsService` (`svg-engine/edit/src/lib/smart-object-actions/`)
// so the Inspector Smart Object section calls the SAME code path as
// this menu entry. The plugin dispatches via
// `SmartObjectActionsService.replaceContents(id)` — see the
// `Replace Contents…` registration in the smart-object submenu above.

// D-074 — Edit Smart Object Contents is handled by the UI-layer
// plugin (svg-engine/ui's `builtinUiMenuContributionsPlugin`)
// because it requires a Material dialog. This edit-layer plugin
// stays free of UI deps (D-017 boundary).
