import { computed, type Injector, type Signal } from '@angular/core';
import {
  BatchConvertToPathCommand,
  CommandBus,
  EditorStateService,
  findNodeById,
  type NodeId,
} from 'svg-engine/core';

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
    track(
      roadmapLeaf({
        id: 'svge.roadmap.file.open',
        slot: MENU_SLOT.FILE,
        label: 'Open…',
        icon: 'folder_open',
        order: 12,
      }),
    );
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
    track(
      roadmapLeaf({
        id: 'svge.roadmap.file.import.image',
        parentId: 'svge.builtin.file.import-menu',
        slot: MENU_SLOT.FILE,
        label: 'Image…',
        icon: 'image',
        order: 20,
      }),
    );
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
    track(
      roadmapLeaf({
        id: 'svge.roadmap.edit.paste-in-place',
        slot: MENU_SLOT.EDIT,
        label: 'Paste In Place',
        icon: 'content_paste_go',
        order: 46,
        shortcut: 'Ctrl+Shift+V',
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.edit.invert-selection',
        parentId: 'svge.builtin.edit.select-menu',
        slot: MENU_SLOT.EDIT,
        label: 'Invert Selection',
        icon: 'flip',
        order: 50,
      }),
    );

    // ── View (roadmap) ─────────────────────────────────────────────
    track(
      roadmapLeaf({
        id: 'svge.roadmap.view.zoom.fit-selection',
        parentId: 'svge.builtin.view.zoom-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Fit Selection',
        icon: 'center_focus_strong',
        order: 50,
      }),
    );
    // Display ▶ roadmap children (Outline Mode is the real one, order 20).
    track(
      roadmapLeaf({
        id: 'svge.roadmap.view.display.preview',
        parentId: 'svge.builtin.view.display-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Preview',
        icon: 'visibility',
        order: 10,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.view.display.pixel-preview',
        parentId: 'svge.builtin.view.display-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Pixel Preview',
        icon: 'grid_4x4',
        order: 30,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.view.display.full-screen',
        parentId: 'svge.builtin.view.display-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Full Screen',
        icon: 'fullscreen',
        order: 40,
        shortcut: 'F11',
      }),
    );
    // Show ▶ roadmap children (Grid/Rulers/Timeline are real, orders 10-30).
    track(
      roadmapLeaf({
        id: 'svge.roadmap.view.show.guides',
        parentId: 'svge.builtin.view.show-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Guides',
        icon: 'straighten',
        order: 40,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.view.show.selection-bounds',
        parentId: 'svge.builtin.view.show-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Selection Bounds',
        icon: 'select_all',
        order: 50,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.view.show.artboard-labels',
        parentId: 'svge.builtin.view.show-menu',
        slot: MENU_SLOT.VIEW,
        label: 'Artboard Labels',
        icon: 'label',
        order: 60,
      }),
    );
    // Snap ▶ extra targets (Enabled/Grid/Objects/Both are real).
    track(
      roadmapLeaf({
        id: 'svge.roadmap.view.snap.guides',
        parentId: 'svge.builtin.view.snap',
        slot: MENU_SLOT.VIEW,
        label: 'Guides',
        icon: 'straighten',
        order: 60,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.view.snap.pixels',
        parentId: 'svge.builtin.view.snap',
        slot: MENU_SLOT.VIEW,
        label: 'Pixels',
        icon: 'grid_4x4',
        order: 70,
      }),
    );
    // Guides ▶ extra (Add H/Add V/Clear are real).
    track(
      roadmapLeaf({
        id: 'svge.roadmap.view.guides.lock',
        parentId: 'svge.builtin.view.guides',
        slot: MENU_SLOT.VIEW,
        label: 'Lock Guides',
        icon: 'lock',
        order: 25,
      }),
    );

    // ── Insert (roadmap) ───────────────────────────────────────────
    // Shape ▶ extra (the 7 shapes + the real "Layer" are wired elsewhere).
    track(
      roadmapLeaf({
        id: 'svge.roadmap.insert.shape.custom',
        parentId: 'svge.insert.shape',
        slot: MENU_SLOT.INSERT,
        label: 'Custom Shape…',
        icon: 'extension',
        order: 80,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.insert.artboard',
        slot: MENU_SLOT.INSERT,
        label: 'Artboard',
        icon: 'dashboard',
        order: 60,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.insert.symbol',
        slot: MENU_SLOT.INSERT,
        label: 'Symbol',
        icon: 'widgets',
        order: 70,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.insert.component',
        slot: MENU_SLOT.INSERT,
        label: 'Component',
        icon: 'category',
        order: 80,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.insert.smart-object',
        slot: MENU_SLOT.INSERT,
        label: 'Smart Object…',
        icon: 'inventory_2',
        order: 90,
      }),
    );

    // ── Object (roadmap) ───────────────────────────────────────────
    // Transform ▶ extra (Flip H/V are real, orders 10/20).
    track(
      roadmapLeaf({
        id: 'svge.roadmap.object.transform.rotate',
        parentId: 'svge.builtin.object.flip',
        slot: MENU_SLOT.OBJECT,
        label: 'Rotate',
        icon: 'rotate_right',
        order: 30,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.object.transform.scale',
        parentId: 'svge.builtin.object.flip',
        slot: MENU_SLOT.OBJECT,
        label: 'Scale',
        icon: 'photo_size_select_large',
        order: 40,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.object.transform.skew',
        parentId: 'svge.builtin.object.flip',
        slot: MENU_SLOT.OBJECT,
        label: 'Skew',
        icon: 'transform',
        order: 50,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.object.transform.reset',
        parentId: 'svge.builtin.object.flip',
        slot: MENU_SLOT.OBJECT,
        label: 'Reset Transform',
        icon: 'restart_alt',
        order: 60,
      }),
    );
    // Align ▶ extra (6 align ops are real).
    track(
      roadmapLeaf({
        id: 'svge.roadmap.object.align.align-to',
        parentId: 'svge.builtin.object.align',
        slot: MENU_SLOT.OBJECT,
        label: 'Align To…',
        icon: 'align_horizontal_center',
        order: 80,
      }),
    );
    // Distribute ▶ extra (2 distribute ops are real).
    track(
      roadmapLeaf({
        id: 'svge.roadmap.object.distribute.spacing',
        parentId: 'svge.builtin.object.distribute',
        slot: MENU_SLOT.OBJECT,
        label: 'Spacing…',
        icon: 'space_bar',
        order: 30,
      }),
    );
    // ── Object ▸ Mask ▶ — SHIPPED (D-086) ──────────────────────────
    // The Mask submenu (Make/Release Clipping Path + Make/Release Opacity
    // Mask) is now REAL — registered with working handlers by
    // `builtinMenuContributionsPlugin` (it needs io serialization, which
    // this roadmap plugin deliberately avoids). No longer a placeholder.
    // ── Object ▸ Apply Filter… (NEW — suggestion #3) ───────────────
    // The visual SVG-filter editor already exists as the Effects panel
    // (D-047); this menu-driven "apply a filter" flow is the roadmap part.
    track(
      roadmapLeaf({
        id: 'svge.roadmap.object.apply-filter',
        slot: MENU_SLOT.OBJECT,
        label: 'Apply Filter…',
        icon: 'auto_awesome',
        order: 95,
      }),
    );

    // ── Path menu (NEW) ────────────────────────────────────────────
    // Convert to Path is REAL (BatchConvertToPathCommand); the rest are
    // roadmap. Outline Stroke + Convert to Path are the two items Option B
    // relocates here from Object.
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
    track(
      roadmapLeaf({
        id: 'svge.roadmap.path.outline-stroke',
        slot: MENU_SLOT.PATH,
        label: 'Outline Stroke',
        icon: 'border_style',
        order: 20,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.path.join',
        slot: MENU_SLOT.PATH,
        label: 'Join',
        icon: 'call_merge',
        order: 30,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.path.split',
        slot: MENU_SLOT.PATH,
        label: 'Split',
        icon: 'call_split',
        order: 40,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.path.reverse',
        slot: MENU_SLOT.PATH,
        label: 'Reverse Direction',
        icon: 'swap_horiz',
        order: 50,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.path.simplify',
        slot: MENU_SLOT.PATH,
        label: 'Simplify',
        icon: 'show_chart',
        order: 60,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.path.offset',
        slot: MENU_SLOT.PATH,
        label: 'Offset Path',
        icon: 'line_style',
        order: 70,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.path.smooth',
        slot: MENU_SLOT.PATH,
        label: 'Smooth',
        icon: 'gesture',
        order: 80,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.path.clean-up',
        slot: MENU_SLOT.PATH,
        label: 'Clean Up',
        icon: 'cleaning_services',
        order: 90,
      }),
    );

    // ── Tools menu (NEW) ───────────────────────────────────────────
    track(
      roadmapLeaf({
        id: 'svge.roadmap.tools.command-palette',
        slot: MENU_SLOT.TOOLS,
        label: 'Command Palette',
        icon: 'terminal',
        order: 10,
        shortcut: 'Ctrl+Shift+P',
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.tools.quick-search',
        slot: MENU_SLOT.TOOLS,
        label: 'Quick Search',
        icon: 'search',
        order: 20,
        shortcut: 'Ctrl+K',
      }),
    );
    // Plugins ▶ — Manage Plugins (real) is contributed by the ui plugin.
    track(
      structuralParent({
        id: 'svge.tools.plugins',
        slot: MENU_SLOT.TOOLS,
        label: 'Plugins',
        icon: 'extension',
        order: 30,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.tools.plugins.install',
        parentId: 'svge.tools.plugins',
        slot: MENU_SLOT.TOOLS,
        label: 'Install Plugin…',
        icon: 'add',
        order: 20,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.tools.plugins.enable-disable',
        parentId: 'svge.tools.plugins',
        slot: MENU_SLOT.TOOLS,
        label: 'Enable / Disable',
        icon: 'toggle_on',
        order: 30,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.tools.plugins.developer-mode',
        parentId: 'svge.tools.plugins',
        slot: MENU_SLOT.TOOLS,
        label: 'Developer Mode',
        icon: 'developer_mode',
        order: 40,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.tools.plugin-console',
        slot: MENU_SLOT.TOOLS,
        label: 'Plugin Console',
        icon: 'code',
        order: 40,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.tools.developer-tools',
        slot: MENU_SLOT.TOOLS,
        label: 'Developer Tools',
        icon: 'build',
        order: 50,
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
    // **D-087 — SHIPPED.** "Keyboard Shortcuts…" is now a real command
    // (the keyboard-shortcuts manager dialog) registered by
    // `builtinUiMenuContributionsPlugin` under this same parent at order
    // 20. The roadmap placeholder was removed per the "ship = delete the
    // placeholder" convention.
    track(
      roadmapLeaf({
        id: 'svge.roadmap.window.workspace.reset',
        parentId: 'svge.window.workspace',
        slot: MENU_SLOT.WINDOW,
        label: 'Reset Workspace',
        icon: 'restart_alt',
        order: 30,
      }),
    );
    // Panels ▶ — every existing panel listed as a roadmap show/hide toggle.
    // The panels themselves exist (mounted in the shells); per-panel
    // menu-driven visibility is the roadmap part.
    track(
      structuralParent({
        id: 'svge.window.panels',
        slot: MENU_SLOT.WINDOW,
        label: 'Panels',
        icon: 'view_sidebar',
        order: 20,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.window.panels.layers',
        parentId: 'svge.window.panels',
        slot: MENU_SLOT.WINDOW,
        label: 'Layers',
        icon: 'layers',
        order: 10,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.window.panels.properties',
        parentId: 'svge.window.panels',
        slot: MENU_SLOT.WINDOW,
        label: 'Properties',
        icon: 'tune',
        order: 20,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.window.panels.appearance',
        parentId: 'svge.window.panels',
        slot: MENU_SLOT.WINDOW,
        label: 'Appearance',
        icon: 'palette',
        order: 30,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.window.panels.transform',
        parentId: 'svge.window.panels',
        slot: MENU_SLOT.WINDOW,
        label: 'Transform',
        icon: 'transform',
        order: 40,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.window.panels.history',
        parentId: 'svge.window.panels',
        slot: MENU_SLOT.WINDOW,
        label: 'History',
        icon: 'history',
        order: 50,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.window.panels.assets',
        parentId: 'svge.window.panels',
        slot: MENU_SLOT.WINDOW,
        label: 'Assets',
        icon: 'collections',
        order: 60,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.window.panels.effects',
        parentId: 'svge.window.panels',
        slot: MENU_SLOT.WINDOW,
        label: 'Effects',
        icon: 'auto_awesome',
        order: 70,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.window.panels.pages',
        parentId: 'svge.window.panels',
        slot: MENU_SLOT.WINDOW,
        label: 'Pages',
        icon: 'description',
        order: 80,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.window.panels.plugins',
        parentId: 'svge.window.panels',
        slot: MENU_SLOT.WINDOW,
        label: 'Plugins',
        icon: 'extension',
        order: 90,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.window.panels.inspector',
        parentId: 'svge.window.panels',
        slot: MENU_SLOT.WINDOW,
        label: 'Inspector',
        icon: 'manage_search',
        order: 95,
      }),
    );

    // ── Help (roadmap) — About SVG Studio (real) is from the ui plugin ─
    track(
      roadmapLeaf({
        id: 'svge.roadmap.help.documentation',
        slot: MENU_SLOT.HELP,
        label: 'Documentation',
        icon: 'menu_book',
        order: 20,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.help.tutorials',
        slot: MENU_SLOT.HELP,
        label: 'Tutorials',
        icon: 'school',
        order: 30,
      }),
    );
    // **D-087 — SHIPPED.** The Help ▸ Keyboard Shortcuts placeholder was
    // removed; the real manager lives under Window ▸ Workspace ▸ Keyboard
    // Shortcuts… (single canonical location) — see
    // `builtinUiMenuContributionsPlugin`.
    track(
      roadmapLeaf({
        id: 'svge.roadmap.help.plugin-development',
        slot: MENU_SLOT.HELP,
        label: 'Plugin Development',
        icon: 'code',
        order: 50,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.help.report-issue',
        slot: MENU_SLOT.HELP,
        label: 'Report Issue',
        icon: 'bug_report',
        order: 60,
      }),
    );
    track(
      roadmapLeaf({
        id: 'svge.roadmap.help.check-updates',
        slot: MENU_SLOT.HELP,
        label: 'Check Updates',
        icon: 'system_update',
        order: 70,
      }),
    );
  },
};
