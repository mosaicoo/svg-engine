import { type EditorPlugin, MenuContributionRegistry, PLUGIN_API_VERSION } from 'svg-engine/edit';
import { CONTEXT_MENU_SLOT, MENU_SLOT } from 'svg-engine/ui';

/**
 * Demo plugin that contributes a handful of File / Edit / View / Help
 * menu items so the `<svge-menu-bar>` showcase (D-038 Phase 1) has
 * actual content to render in the playground's Shell parcial demo
 * (when the user toggles "Show menu bar" on).
 *
 * **Not part of the library** — lives in `projects/playground/` as a
 * reference implementation. Real consumers would build their own
 * menu items via the same `MenuContributionRegistry` API.
 *
 * Includes a 2-level submenu (`Edit > Transform > Rotate 90° CW`)
 * to prove cascading menus work end-to-end.
 */
export const demoMenuBarPlugin: EditorPlugin = {
  id: 'svge.playground.demo-menu-bar',
  name: 'Playground — demo menu bar items',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const reg = ctx.injector.get(MenuContributionRegistry);

    // ── File menu ───────────────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'demo.file.new',
        slot: MENU_SLOT.FILE,
        label: 'New',
        icon: 'insert_drive_file',
        shortcut: 'Ctrl+N',
        order: 10,
        run() {
          console.info('[demo] File > New');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'demo.file.open',
        slot: MENU_SLOT.FILE,
        label: 'Open…',
        icon: 'folder_open',
        shortcut: 'Ctrl+O',
        order: 20,
        run() {
          console.info('[demo] File > Open');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'demo.file.divider1',
        slot: MENU_SLOT.FILE,
        label: '',
        order: 30,
        divider: true,

        run() {
          /* parent / divider — no action; child run()s are dispatched instead */
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'demo.file.save',
        slot: MENU_SLOT.FILE,
        label: 'Save',
        icon: 'save',
        shortcut: 'Ctrl+S',
        order: 40,
        run() {
          console.info('[demo] File > Save');
        },
      }),
    );

    // ── Edit menu (with a submenu) ─────────────────────────────────
    ctx.track(
      reg.register({
        id: 'demo.edit.undo',
        slot: MENU_SLOT.EDIT,
        label: 'Undo',
        icon: 'undo',
        shortcut: 'Ctrl+Z',
        order: 10,
        run() {
          console.info('[demo] Edit > Undo');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'demo.edit.redo',
        slot: MENU_SLOT.EDIT,
        label: 'Redo',
        icon: 'redo',
        shortcut: 'Ctrl+Shift+Z',
        order: 20,
        run() {
          console.info('[demo] Edit > Redo');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'demo.edit.divider1',
        slot: MENU_SLOT.EDIT,
        label: '',
        order: 30,
        divider: true,

        run() {
          /* parent / divider — no action; child run()s are dispatched instead */
        },
      }),
    );
    // Parent of the submenu — `run()` is ignored when it has children.
    ctx.track(
      reg.register({
        id: 'demo.edit.transform',
        slot: MENU_SLOT.EDIT,
        label: 'Transform',
        icon: 'transform',
        order: 40,

        run() {
          /* parent / divider — no action; child run()s are dispatched instead */
        },
      }),
    );
    // Submenu leaves
    ctx.track(
      reg.register({
        id: 'demo.edit.transform.rotate-cw',
        slot: MENU_SLOT.EDIT,
        parentId: 'demo.edit.transform',
        label: 'Rotate 90° CW',
        icon: 'rotate_right',
        order: 10,
        run() {
          console.info('[demo] Edit > Transform > Rotate 90° CW');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'demo.edit.transform.rotate-ccw',
        slot: MENU_SLOT.EDIT,
        parentId: 'demo.edit.transform',
        label: 'Rotate 90° CCW',
        icon: 'rotate_left',
        order: 20,
        run() {
          console.info('[demo] Edit > Transform > Rotate 90° CCW');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'demo.edit.transform.flip-h',
        slot: MENU_SLOT.EDIT,
        parentId: 'demo.edit.transform',
        label: 'Flip Horizontal',
        order: 30,
        run() {
          console.info('[demo] Edit > Transform > Flip H');
        },
      }),
    );

    // ── View menu ──────────────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'demo.view.zoom-in',
        slot: MENU_SLOT.VIEW,
        label: 'Zoom In',
        icon: 'zoom_in',
        shortcut: 'Ctrl++',
        order: 10,
        run() {
          console.info('[demo] View > Zoom In');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'demo.view.zoom-out',
        slot: MENU_SLOT.VIEW,
        label: 'Zoom Out',
        icon: 'zoom_out',
        shortcut: 'Ctrl+-',
        order: 20,
        run() {
          console.info('[demo] View > Zoom Out');
        },
      }),
    );

    // ── Toolbar.main slot (D-038 post-Phase 4 fix) ─────────────────
    // Items aqui aparecem na <svge-toolbar slot="toolbar.main"> entre
    // o título e os built-ins (undo/redo/zoom) do svge-editor.
    ctx.track(
      reg.register({
        id: 'demo.toolbar.save',
        slot: 'toolbar.main',
        label: 'Save',
        icon: 'save',
        shortcut: 'Ctrl+S',
        order: 10,
        run() {
          console.info('[demo] toolbar.main > Save');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'demo.toolbar.export',
        slot: 'toolbar.main',
        label: 'Export SVG',
        icon: 'download',
        order: 20,
        run() {
          console.info('[demo] toolbar.main > Export SVG');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'demo.toolbar.optimize',
        slot: 'toolbar.main',
        label: 'Optimize',
        icon: 'auto_fix_high',
        order: 30,
        run() {
          console.info('[demo] toolbar.main > Optimize');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'demo.toolbar.view-source',
        slot: 'toolbar.main',
        label: 'View Source',
        icon: 'code',
        order: 40,
        run() {
          console.info('[demo] toolbar.main > View Source');
        },
      }),
    );

    // ── Help menu ──────────────────────────────────────────────────
    ctx.track(
      reg.register({
        id: 'demo.help.about',
        slot: MENU_SLOT.HELP,
        label: 'About SVGEngine',
        icon: 'info',
        order: 10,
        run() {
          alert(
            'SVGEngine Playground — demo menu bar (D-038 Phase 1).\nFile/Edit/View/Object/Help slots populated via MenuContributionRegistry.',
          );
        },
      }),
    );

    // ── Context menu items (D-038 Phase 2) ─────────────────────────
    // Right-click on the canvas in shell-completo / shell-parcial /
    // shell-canvas-only opens these. Demonstrates that the same
    // MenuContributionRegistry powers both menu bar AND context menu —
    // plugins author once, consumers wire the slots independently.
    ctx.track(
      reg.register({
        id: 'demo.ctx.canvas.paste',
        slot: CONTEXT_MENU_SLOT.CANVAS,
        label: 'Paste',
        icon: 'content_paste',
        shortcut: 'Ctrl+V',
        order: 10,
        run() {
          console.info('[demo] Context > Paste');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'demo.ctx.canvas.select-all',
        slot: CONTEXT_MENU_SLOT.CANVAS,
        label: 'Select All',
        icon: 'select_all',
        shortcut: 'Ctrl+A',
        order: 20,
        run() {
          console.info('[demo] Context > Select All');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'demo.ctx.canvas.div',
        slot: CONTEXT_MENU_SLOT.CANVAS,
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
        id: 'demo.ctx.canvas.zoom-fit',
        slot: CONTEXT_MENU_SLOT.CANVAS,
        label: 'Zoom to Fit',
        icon: 'fit_screen',
        order: 40,
        run() {
          console.info('[demo] Context > Zoom to Fit');
        },
      }),
    );
    ctx.track(
      reg.register({
        id: 'demo.ctx.canvas.props',
        slot: CONTEXT_MENU_SLOT.CANVAS,
        label: 'Workspace Settings…',
        icon: 'settings',
        order: 50,
        run() {
          console.info('[demo] Context > Workspace Settings');
        },
      }),
    );
  },
};
