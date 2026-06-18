import { computed, type Injector, type Signal } from '@angular/core';
import {
  type AnchorRef,
  BatchConvertToPathCommand,
  CleanUpPathCommand,
  CommandBus,
  EditorStateService,
  findNodeById,
  JoinPathsCommand,
  type NodeId,
  OutlineStrokeCommand,
  type PathSplitCut,
  ReversePathCommand,
  SplitPathCommand,
} from 'svg-engine/core';

import { AnchorSelectionService } from '../../anchor-editor/anchor-selection.service';
import { type EditorPlugin, PLUGIN_API_VERSION } from '../../plugin/plugin';
import { SelectionService } from '../../selection/selection.service';
import type { MenuContribution, MenuContributionContext } from '../menu-contribution';
import { MenuContributionRegistry } from '../menu-contribution-registry.service';
import { MENU_SLOT } from '../menu-slots';

/**
 * **`builtinRoadmapMenuPlugin`** — **D-085** (menubar reorganization,
 * Option B).
 *
 * Completes the 9-menu Option B layout that the other built-in menu
 * plugins start: it owns the **brand-new menus** (Path / Tools / Window
 * + the Object ▸ Mask submenu) and registers every **roadmap
 * ("coming soon") placeholder** — features that are *planned but not yet
 * implemented*. Roadmap items render **visible but disabled** with a
 * distinct clock icon (`comingSoon: true`), so the menu doubles as a
 * public roadmap and **no existing capability is ever hidden**.
 *
 * **Two kinds of entry**:
 *
 * 1. **Roadmap placeholders** (the vast majority) — `comingSoon: true`,
 *    a no-op `run()`, and `disabled` pinned to `true`. The NLU
 *    auto-discovery skips them (`menuContributionToIntent`), so a voice
 *    command never fires a no-op. Shipping one = delete it here and wire
 *    a real entry in the appropriate plugin.
 * 2. **A handful of REAL new entries** the engine already supports but
 *    that had no menu home before Option B:
 *    - **Path ▸ Convert to Path** → `BatchConvertToPathCommand` (one
 *      undoable step over the convertible selection).
 *
 * **Cross-plugin parents**: some roadmap children attach to parents
 * registered by sibling plugins (e.g. Transform ▸ Rotate under
 * `svge.builtin.object.flip`, or Tools ▸ Plugins ▸ Install Plugin under
 * `svge.tools.plugins`). `parentId` is resolved at render time by
 * `<svge-menu-bar>`, so install order doesn't matter — but this plugin
 * MUST be installed alongside the core menu plugins (it is, via
 * `provideSvgEngineEditorBuiltins`).
 *
 * **Opt-in**: like every built-in plugin, consumers provision it
 * explicitly. Headless consumers that don't want a roadmap omit it.
 */

// Shared "always disabled" signal for roadmap leaves. `computed` returns
// a 0-arg callable, so `resolveDisabledSignal` treats it as a plain
// Signal (not a factory) — exactly what we want (every roadmap leaf is
// disabled regardless of scope).
const ROADMAP_DISABLED: Signal<boolean> = computed(() => true);

/** Build a disabled, marked, no-op roadmap leaf contribution. */
function roadmapLeaf(opts: {
  id: string;
  slot: string;
  label: string;
  icon: string;
  order: number;
  parentId?: string;
  shortcut?: string;
}): MenuContribution {
  return {
    id: opts.id,
    slot: opts.slot,
    label: opts.label,
    icon: opts.icon,
    order: opts.order,
    parentId: opts.parentId,
    shortcut: opts.shortcut,
    comingSoon: true,
    disabled: ROADMAP_DISABLED,
    run() {
      /* roadmap placeholder — intentionally no-op */
    },
  };
}

/**
 * Build a structural submenu **parent** that hosts a mix of real +
 * roadmap children (e.g. Tools ▸ Plugins, Window ▸ Workspace/Panels). NOT
 * marked `comingSoon` because at least one child is real and the parent
 * is fully usable.
 */
function structuralParent(opts: {
  id: string;
  slot: string;
  label: string;
  icon: string;
  order: number;
}): MenuContribution {
  return {
    id: opts.id,
    slot: opts.slot,
    label: opts.label,
    icon: opts.icon,
    order: opts.order,
    run() {
      /* submenu parent */
    },
  };
}

const CONVERTIBLE_TYPES = new Set(['rect', 'ellipse', 'line', 'polygon', 'polyline']);

/** Ids of the currently-selected nodes that `ConvertNodeToPath` accepts. */
function convertibleSelectedIds(injector: Injector): NodeId[] {
  const sel = injector.get(SelectionService);
  const state = injector.get(EditorStateService);
  const root = state.document().root;
  const out: NodeId[] = [];
  for (const id of sel.selectedIds()) {
    const node = findNodeById(root, id);
    if (node !== null && CONVERTIBLE_TYPES.has(node.type)) out.push(id as NodeId);
  }
  return out;
}

// ── D-090 — Path menu helpers (shared by the real Path entries) ─────────

/** Ids of currently-selected `path` nodes (the Path ops operate on these). */
function selectedPathIds(injector: Injector): NodeId[] {
  const sel = injector.get(SelectionService);
  const root = injector.get(EditorStateService).document().root;
  const out: NodeId[] = [];
  for (const id of sel.selectedIds()) {
    const node = findNodeById(root, id);
    if (node !== null && node.type === 'path') out.push(id as NodeId);
  }
  return out;
}

/** Selected `path` ids that actually carry a visible stroke (Outline Stroke). */
function selectedStrokablePathIds(injector: Injector): NodeId[] {
  const root = injector.get(EditorStateService).document().root;
  return selectedPathIds(injector).filter((id) => {
    const node = findNodeById(root, id);
    if (node === null) return false;
    const stroke = node.style.stroke;
    const width = node.style.strokeWidth ?? 1;
    return typeof stroke === 'string' && stroke !== 'none' && stroke.trim() !== '' && width > 0;
  });
}

/**
 * Build Split cut points from the current anchor selection. Split is a
 * single-path op, so we pick the node that owns the most selected anchors
 * and return its `(subpathIndex, anchorIndex)` cuts. Returns `null` when
 * no anchors are selected.
 */
function splitTargetFromAnchorSelection(
  injector: Injector,
): { nodeId: NodeId; cuts: PathSplitCut[] } | null {
  const refs = injector.get(AnchorSelectionService).selected();
  if (refs.length === 0) return null;
  const byNode = new Map<string, AnchorRef[]>();
  for (const ref of refs) {
    const list = byNode.get(ref.nodeId) ?? [];
    list.push(ref);
    byNode.set(ref.nodeId, list);
  }
  let bestNode: string | null = null;
  let bestCount = 0;
  for (const [nodeId, list] of byNode) {
    if (list.length > bestCount) {
      bestCount = list.length;
      bestNode = nodeId;
    }
  }
  if (bestNode === null) return null;
  const cuts: PathSplitCut[] = byNode
    .get(bestNode)!
    .map((r) => ({ subpathIndex: r.subpathIndex, anchorIndex: r.anchorIndex }));
  return { nodeId: bestNode as NodeId, cuts };
}

export const builtinRoadmapMenuPlugin: EditorPlugin = {
  id: 'svge.builtin.roadmap-menu',
  name: 'Menubar Option B — Path/Tools/Window menus, Mask + roadmap items (D-085)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const reg = ctx.injector.get(MenuContributionRegistry);
    const track = (c: MenuContribution): void => {
      ctx.track(reg.register(c));
    };

    // ── File (roadmap) ─────────────────────────────────────────────
    // **D-115** — `File ▸ Open…` (order 12) is now a REAL item registered by
    // `builtinMenuContributionsPlugin` (extension-based open: SVG today, the
    // editor's proprietary format later). The roadmap placeholder was removed
    // to avoid a duplicate entry. `Open Recent…` stays roadmap for now.
    track(
      roadmapLeaf({
        id: 'svge.roadmap.file.open-recent',
        slot: MENU_SLOT.FILE,
        label: 'Open Recent…',
        icon: 'history',
        order: 14,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.file.save',
        slot: MENU_SLOT.FILE,
        label: 'Save',
        icon: 'save',
        order: 30,
        shortcut: 'Ctrl+S',
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.file.save-as',
        slot: MENU_SLOT.FILE,
        label: 'Save As…',
        icon: 'save_as',
        order: 32,
        shortcut: 'Ctrl+Shift+S',
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.file.document-settings',
        slot: MENU_SLOT.FILE,
        label: 'Document Settings…',
        icon: 'settings',
        order: 72,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.file.exit',
        slot: MENU_SLOT.FILE,
        label: 'Exit',
        icon: 'logout',
        order: 90,
      }),
    );
    // Import ▶ roadmap children (parent `svge.builtin.file.import-menu`).
    // **D-117** — `Image…` (order 15) is now REAL (shared raster handler with
    // `Insert ▸ Image…`); the roadmap placeholder was removed.
    track(
      roadmapLeaf({
        id: 'svge.roadmap.file.import.smart-object',
        parentId: 'svge.builtin.file.import-menu',
        slot: MENU_SLOT.FILE,
        label: 'Smart Object…',
        icon: 'inventory_2',
        order: 30,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.file.import.external-asset',
        parentId: 'svge.builtin.file.import-menu',
        slot: MENU_SLOT.FILE,
        label: 'External Asset…',
        icon: 'link',
        order: 40,
      }),
    );
    // Export ▶ roadmap children (parent `svge.builtin.file.export-menu`).
    track(
      roadmapLeaf({
        id: 'svge.roadmap.file.export.selection',
        parentId: 'svge.builtin.file.export-menu',
        slot: MENU_SLOT.FILE,
        label: 'Export Selection…',
        icon: 'crop',
        order: 40,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.file.export.artboard',
        parentId: 'svge.builtin.file.export-menu',
        slot: MENU_SLOT.FILE,
        label: 'Export Artboard…',
        icon: 'crop_portrait',
        order: 50,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.file.export.batch',
        parentId: 'svge.builtin.file.export-menu',
        slot: MENU_SLOT.FILE,
        label: 'Batch Export…',
        icon: 'dynamic_feed',
        order: 60,
      }),
    );

    // ── Edit (roadmap) ─────────────────────────────────────────────
    // **D-102 — SHIPPED.** "Paste In Place" (Edit, order 46) is now a real
    // command registered by `builtinMenuContributionsPlugin`: pastes at the
    // original coordinates (zero offset) while a plain Paste now nudges +10px,
    // so the two are distinct. Roadmap placeholder removed per convention.
    // **D-120 — SHIPPED.** "Invert Selection" (Edit ▸ Select, order 50) is now
    // a real command registered by `builtinMenuContributionsPlugin`
    // (`svge.builtin.edit.invert-selection`): it selects the active page's
    // top-level objects that aren't currently selected. Roadmap placeholder
    // removed per convention.

    // ── View (roadmap) ─────────────────────────────────────────────
    // **D-118 — SHIPPED.** "Fit Selection" (View ▸ Zoom, order 50) is now a
    // real command registered by `builtinMenuContributionsPlugin`
    // (`svge.builtin.view.zoom-fit-selection`): it frames the current
    // selection's world bbox via `ViewportService.fitBox`. Roadmap
    // placeholder removed per convention (it shared order 50 and rendered a
    // duplicate clock-icon entry next to the real one).
    // Display ▶ roadmap children (Outline Mode is the real one, order 20).
    // **D-128 — SHIPPED (renamed).** The "Preview" placeholder (order 10) was
    // promoted to a real **Presentation Mode** toggle
    // (`svge.builtin.view.display.presentation`) registered by
    // `builtinMenuContributionsPlugin`: it hides ALL editor chrome and shows
    // only the artwork full-viewport (Esc to exit). Renamed from "Preview"
    // because, with Outline Mode already shipped, the Illustrator-sense
    // "Preview" (the non-outline view) would have been redundant; the useful,
    // non-redundant meaning is Figma/Affinity "Presentation". Roadmap
    // placeholder removed per the "ship = delete the placeholder" convention.
    // **D-130 — SHIPPED.** "Pixel Preview" (order 30) is now a real toggle
    // registered by `builtinMenuContributionsPlugin`
    // (`svge.builtin.view.display.pixel-preview`) backed by
    // `WorkspaceService.pixelPreview()` + the `PixelPreviewFilter` directive
    // (crispEdges + image-rendering: pixelated). Roadmap placeholder removed.
    // → With this, the entire View ▸ Display ▸ submenu is real (Presentation /
    //   Outline / Pixel Preview / Full Screen); no roadmap children remain.
    // **D-129 — SHIPPED.** "Full Screen" (order 40) is now a real toggle
    // registered by `builtinMenuContributionsPlugin`
    // (`svge.builtin.view.display.full-screen`) backed by the native Fullscreen
    // API (`FullscreenService`): it gives the editor element the whole monitor.
    // Distinct from Presentation Mode (D-128) — the two compose. Roadmap
    // placeholder removed per the "ship = delete the placeholder" convention.
    // Show ▶ roadmap children (Grid/Rulers/Timeline are real, orders 10-30).
    // **D-123 — REMOVED.** "Guides" (show/hide guides visibility) dropped: it's
    // redundant with the real `View ▸ Guides ▸ …` submenu (Add / Lock / Unlock /
    // Clear) and adds no value here — per the user.
    // **D-124 — REMOVED.** "Selection Bounds" (show/hide the selection bounding
    // box) dropped: no real gain and it would be confusing — the `.bbox` drawn
    // by `<svge-selection-overlay>` is the only on-canvas selection indicator,
    // so a toggle that hides it makes "is anything selected?" ambiguous — per
    // the user.
    // **D-123 — REMOVED.** "Artboard Labels" dropped: the canvas renders one
    // page at a time (tab model), so there's no multi-artboard surface to label
    // — per the user. The active page's name already shows in the status bar
    // and the page-selection overlay.
    // → With these three gone, `View ▸ Show ▸` has no roadmap children left;
    //   Grid / Rulers / Timeline (the real toggles) are all that remain.
    // Snap ▶ extra targets (Enabled/Grid/Objects/Both are real).
    // **D-126 — SHIPPED.** "Snap to Guides" is now a real, additive toggle
    // registered by `builtinMenuContributionsPlugin`
    // (`svge.builtin.view.snap.guides`, order 60) — it layers on top of the
    // Grid/Objects/Both mode without changing it. Roadmap placeholder removed.
    // **D-127 — REMOVED.** "Pixels" (snap to integer pixel coordinates) dropped
    // per the user: pixel snapping would fight the grid/object/guide snap rather
    // than help, and there is no plan to implement it — so the roadmap
    // placeholder was removed rather than left dangling. → `View ▸ Snap ▸` now
    // has no roadmap children left; Enabled / Grid only / Objects only / Both /
    // Snap to Guides (all real) are everything in the submenu.
    // Guides ▶ — Add H/Add V/Clear are real.
    // **D-121 / D-122 — SHIPPED.** "Lock Guides" is now real, split into two
    // state-aware items by `builtinMenuContributionsPlugin`:
    // `svge.builtin.view.guides.lock` (order 25, disabled when already locked)
    // and `svge.builtin.view.guides.unlock` (order 26, disabled when already
    // unlocked) → `WorkspaceService.setGuidesLocked(true/false)`. Locked guides
    // render but can't be selected/dragged/deleted on the canvas. Roadmap
    // placeholder removed per convention.

    // ── Insert (roadmap) ───────────────────────────────────────────
    // Shape ▶ — the 7 quick shapes are wired by `builtinInsertMenuPlugin`.
    // **D-104 — REMOVED.** "Custom Shape…" was dropped as redundant: every
    // way to get a custom shape already exists elsewhere — draw an arbitrary
    // path with the **Pen** / **Pencil** tools, paste/load existing markup
    // via **File ▸ Import ▸ SVG…**, or pick a preset from the **Shapes**
    // library panel (D-048). A menu entry would only duplicate those (same
    // call as Apply Filter / Check Updates).
    // **D-133 — REMOVED (3 placeholders) + 1 PROMOTED to real.** The four
    // Insert placeholders were resolved per the user ("remover e transformar
    // o Smart Object abrindo o editor"):
    //   • **Artboard** → already shipped as **Pages** (D-079): multi-surface
    //     artboards live in the Pages panel + `menu` page commands, so a
    //     separate "Insert ▸ Artboard" would duplicate that.
    //   • **Symbol** → already shipped as the **Symbol Library** (D-059/D-062):
    //     masters/instances are created from the Libraries panel + Sprayer.
    //   • **Component** → not planned. "Components" (variant-aware design-system
    //     primitives, à la Figma) are out of scope; nothing maps to it, so the
    //     dangling placeholder is dropped rather than left "coming soon".
    //   • **Smart Object…** → now **REAL**, registered by
    //     `builtinUiMenuContributionsPlugin` (it needs a Material dialog — D-017):
    //     it creates a new smart object, inserts it, and opens the Smart Object
    //     editor so the user authors its contents from scratch.

    // ── Object (roadmap) ───────────────────────────────────────────
    // Transform ▶ — SHIPPED (D-093). Flip H/V (edit-side, orders 10/20)
    // and Reset Transform (edit-side, order 60) are real; Rotate… / Scale…
    // / Skew… (orders 30/40/50) are real dialog-backed entries registered
    // by `builtinUiMenuContributionsPlugin` (they need a Material dialog —
    // D-017). No longer roadmap placeholders.
    // Align ▶ — SHIPPED (D-094). The "Align To" reference selection is now
    // real: the 6 align ops auto-pick the reference (key object ▸ page ▸
    // selection) via `resolveAlignReference`, and `builtinMenuContributionsPlugin`
    // adds **Make / Clear Key Object** to this submenu (Illustrator "Align to
    // Key Object"). No longer a roadmap placeholder.
    // Distribute ▶ — SHIPPED (D-095). "Spacing…" (equal edge-to-edge gap,
    // not centers) is now real: `builtinUiMenuContributionsPlugin` adds
    // **Horizontal / Vertical Spacing…** (dialog pre-filled with the current
    // average gap) under this submenu, backed by `computeDistributeSpacingDeltas`.
    // Needs a Material dialog (D-017), so it lives UI-side. No longer a placeholder.
    // ── Object ▸ Mask ▶ — SHIPPED (D-086) ──────────────────────────
    // The Mask submenu (Make/Release Clipping Path + Make/Release Opacity
    // Mask) is now REAL — registered with working handlers by
    // `builtinMenuContributionsPlugin` (it needs io serialization, which
    // this roadmap plugin deliberately avoids). No longer a placeholder.
    // ── Object ▸ Apply Filter… — REMOVED (D-101) ──────────────────
    // Dropped as redundant: applying an SVG filter to the selection is
    // already a real, shipped capability via the **Effects panel** (D-047) —
    // the Appearance tab in the right rail, backed by `EffectRegistry` +
    // `ChainFilterRegistry` (add/remove/reorder/clear effects on the
    // selection, single + composed chains, round-tripped on export). A
    // menu-driven "apply a filter" flow would only duplicate that editor, so
    // the placeholder was removed rather than shipped (same call as Check
    // Updates / Enable-Disable). If a one-click "pick a single filter from
    // the menu" affordance is ever wanted, it can wrap the same registry +
    // `SetStylePropertyOnManyCommand('filter', …)` the panel uses.

    // ── Path menu — ALL REAL (D-090) ───────────────────────────────
    // Every entry dispatches a real core command. Convert to Path =
    // BatchConvertToPathCommand; the rest = the D-090 path-ops commands.
    // "Smooth" was dropped from the menu: the interactive Smooth tool
    // (toolbar, shortcut `s`) already covers it, and the menu's RDP
    // operation is the same algorithm exposed here as "Simplify".
    track({
      id: 'svge.builtin.path.convert-to-path',
      slot: MENU_SLOT.PATH,
      label: 'Convert to Path',
      icon: 'timeline',
      order: 10,
      disabled: (injector: Injector) =>
        computed(() => convertibleSelectedIds(injector).length === 0),
      run(runCtx?: MenuContributionContext) {
        const injector = runCtx?.injector ?? ctx.injector;
        const ids = convertibleSelectedIds(injector);
        if (ids.length === 0) return;
        injector.get(CommandBus).dispatch(new BatchConvertToPathCommand(ids));
      },
    });
    track({
      id: 'svge.builtin.path.outline-stroke',
      slot: MENU_SLOT.PATH,
      label: 'Outline Stroke',
      icon: 'border_style',
      order: 20,
      disabled: (injector: Injector) =>
        computed(() => selectedStrokablePathIds(injector).length === 0),
      run(runCtx?: MenuContributionContext) {
        const injector = runCtx?.injector ?? ctx.injector;
        const ids = selectedStrokablePathIds(injector);
        if (ids.length === 0) return;
        injector.get(CommandBus).dispatch(new OutlineStrokeCommand(ids));
      },
    });
    track({
      id: 'svge.builtin.path.join',
      slot: MENU_SLOT.PATH,
      label: 'Join',
      icon: 'call_merge',
      order: 30,
      disabled: (injector: Injector) => computed(() => selectedPathIds(injector).length === 0),
      run(runCtx?: MenuContributionContext) {
        const injector = runCtx?.injector ?? ctx.injector;
        const ids = selectedPathIds(injector);
        if (ids.length === 0) return;
        injector.get(CommandBus).dispatch(new JoinPathsCommand(ids));
      },
    });
    track({
      id: 'svge.builtin.path.split',
      slot: MENU_SLOT.PATH,
      label: 'Split',
      icon: 'call_split',
      order: 40,
      // Split cuts at the selected ANCHORS (Direct Select / Path Editor),
      // so it's enabled only when ≥1 anchor is selected — distinct from
      // the Knife tool (clicked point) and Release Compound (subpaths).
      disabled: (injector: Injector) =>
        computed(() => injector.get(AnchorSelectionService).count() === 0),
      run(runCtx?: MenuContributionContext) {
        const injector = runCtx?.injector ?? ctx.injector;
        const target = splitTargetFromAnchorSelection(injector);
        if (target === null) return;
        injector.get(CommandBus).dispatch(new SplitPathCommand(target.nodeId, target.cuts));
      },
    });
    track({
      id: 'svge.builtin.path.reverse',
      slot: MENU_SLOT.PATH,
      label: 'Reverse Direction',
      icon: 'swap_horiz',
      order: 50,
      disabled: (injector: Injector) => computed(() => selectedPathIds(injector).length === 0),
      run(runCtx?: MenuContributionContext) {
        const injector = runCtx?.injector ?? ctx.injector;
        const ids = selectedPathIds(injector);
        if (ids.length === 0) return;
        injector.get(CommandBus).dispatch(new ReversePathCommand(ids));
      },
    });
    // Path ▸ Simplify… (order 60) + Offset Path… (order 70) — SHIPPED with
    // parameter dialogs by `builtinUiMenuContributionsPlugin` (D-093). They
    // lived here with HARDCODED defaults and no dialog; moved to the UI
    // plugin so each prompts for its numeric parameter (Material — D-017).
    // Ids/orders preserved so the Path menu reads identically.
    track({
      id: 'svge.builtin.path.clean-up',
      slot: MENU_SLOT.PATH,
      label: 'Clean Up',
      icon: 'cleaning_services',
      order: 90,
      disabled: (injector: Injector) => computed(() => selectedPathIds(injector).length === 0),
      run(runCtx?: MenuContributionContext) {
        const injector = runCtx?.injector ?? ctx.injector;
        const ids = selectedPathIds(injector);
        if (ids.length === 0) return;
        injector.get(CommandBus).dispatch(new CleanUpPathCommand(ids));
      },
    });

    // ── Tools menu (NEW) ───────────────────────────────────────────
    // **Command Palette SHIPPED** — the roadmap placeholder
    // `svge.roadmap.tools.command-palette` was removed; the real entry
    // (`svge.builtin.ui.tools.command-palette`, Ctrl+Shift+P) is
    // registered by `builtinUiMenuContributionsPlugin` (it opens a
    // Material dialog, so it must live in `svg-engine/ui` per D-017).
    //
    // **D-132 — REMOVED.** Four roadmap placeholders were dropped from the
    // Tools menu by product decision (keep it lean + 100% real):
    // - "Quick Search" (Ctrl+K) — redundant with the shipped Command
    //   Palette (action search) and the Layers panel's own search.
    // - "Developer Mode" / "Plugin Console" / "Developer Tools" — the
    //   plugin-DEVELOPER cluster. SVGEngine targets plugin CONSUMERS
    //   (Manage Plugins + Install from URL, both real); a developer
    //   experience isn't on the roadmap, and a web app already exposes the
    //   browser DevTools + the History panel + the SVG Source viewer.
    //
    // Plugins ▶ — Manage Plugins (real) + Install Plugin… (real, D-099) are
    // contributed by the ui plugin. **D-100 — REMOVED.** "Enable / Disable"
    // was dropped as redundant (each plugin row already has an enable/disable
    // toggle). The structural parent stays so those real children have a
    // submenu to attach to.
    track(
      structuralParent({
        id: 'svge.tools.plugins',
        slot: MENU_SLOT.TOOLS,
        label: 'Plugins',
        icon: 'extension',
        order: 30,
      }),
    );

    // ── Window menu (NEW) ──────────────────────────────────────────
    // Workspace ▶ — Workspace Settings (real) is contributed by the ui plugin.
    track(
      structuralParent({
        id: 'svge.window.workspace',
        slot: MENU_SLOT.WINDOW,
        label: 'Workspace',
        icon: 'tune',
        order: 10,
      }),
    );
    // **D-087 / D-088 — SHIPPED.** Both "Keyboard Shortcuts…" (order 20)
    // and "Reset Workspace" (order 30) are now real commands registered by
    // `builtinUiMenuContributionsPlugin` under this same parent. Their
    // roadmap placeholders were removed per the "ship = delete the
    // placeholder" convention.
    // Panels ▶ — structural parent only. **D-098 — SHIPPED.** The per-panel
    // children (Layers / History / Properties / Appearance / Export /
    // Gradient) are now REAL entries registered by
    // `builtinMenuContributionsPlugin`; each calls
    // `PanelHostService.reveal(PANEL_ID.*)` and the active shell switches to
    // that panel. Their roadmap placeholders were removed per the "ship =
    // delete the placeholder" convention (the panels with no docked home —
    // Transform / Assets / Plugins / Inspector / Pages / Effects — were
    // dropped, not shipped as dead reveals; see the plugin for the rationale).
    track(
      structuralParent({
        id: 'svge.window.panels',
        slot: MENU_SLOT.WINDOW,
        label: 'Panels',
        icon: 'view_sidebar',
        order: 20,
      }),
    );

    // ── Help (roadmap) ─────────────────────────────────────────────
    // About SVG Studio (real) is registered by the ui plugin.
    // **D-087 — SHIPPED.** Help ▸ Keyboard Shortcuts → Window ▸ Workspace ▸
    // Keyboard Shortcuts… (single canonical location).
    // **D-096 — SHIPPED.** Documentation / Tutorials / Plugin Development /
    // Report Issue are now real external links registered by
    // `builtinMenuContributionsPlugin`, opening host-independent,
    // DI-configurable URLs (`SVGE_HELP_LINKS` / `provideSvgeHelpLinks`). No
    // longer placeholders.
    //
    // **D-097 — REMOVED.** "Check Updates" was dropped: it makes no sense
    // for a web SPA (every page load already serves the latest hashed
    // build, and there is no service worker to lag behind a deploy) nor
    // for the embeddable library (its version is whatever the host
    // bundled via npm — the library cannot update itself). The Help slot
    // now has no roadmap placeholders at all.
  },
};
