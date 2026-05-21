import {
  CommandBus,
  EditorStateService,
  findNodeById,
  GroupSelectionCommand,
  UngroupCommand,
} from 'svg-engine/core';
import type { EditorPlugin } from '../plugin/plugin';
import { PLUGIN_API_VERSION } from '../plugin/plugin';
import { SelectionService } from '../selection/selection.service';
import { ShortcutRegistry } from './shortcut-registry.service';

/**
 * **`builtinEditorShortcutsPlugin`** — D-040 (Sprint Pro-Editor polish).
 *
 * Opt-in plugin that registers the **canonical editor shortcuts** that
 * Illustrator / Affinity / Figma users expect to "just work":
 *
 * | Combo           | Action                                                   |
 * | --------------- | -------------------------------------------------------- |
 * | `Ctrl+Z`        | Undo (`CommandBus.undo`)                                 |
 * | `Ctrl+Y`        | Redo (`CommandBus.redo`)                                 |
 * | `Ctrl+Shift+Z` | Redo (Mac/Linux idiom) — same handler                     |
 * | `Ctrl+G`        | Group current selection (`GroupSelectionCommand`)        |
 * | `Ctrl+Shift+G` | Ungroup focused selection (`UngroupCommand`)              |
 * | `Ctrl+A`        | Select all top-level nodes in the document root          |
 *
 * **Why opt-in (not auto-installed by the shell)**: consumers may want
 * different bindings (e.g., remap to Cmd+ on macOS via custom plugin;
 * disable Ctrl+A for read-only viewers; replace Ctrl+Z with their own
 * undo that also saves a draft). Forcing these globally would surprise
 * those use cases. Mosaicoo's "drop-in shell" provisions this plugin
 * by default in `app.config.ts`; bare `<svge-editor>` consumers choose.
 *
 * **`Ctrl` matching on macOS**: matches `Cmd` (meta) too — the
 * `ShortcutService` combo parser treats `Ctrl` as "primary modifier"
 * cross-platform.
 *
 * **`when` guards**: each shortcut returns the `selection.hasSelection`
 * (or similar) computed so a registry-driven preferences UI can show
 * enabled/disabled state. Disabled shortcuts pass through to the
 * browser default (or the next match).
 *
 * **NOT included** (intentional scope):
 * - `Ctrl+C` / `Ctrl+V` (clipboard) — no `ClipboardService` yet
 * - `Ctrl+S` (save) — depends on consumer's save strategy
 * - `Ctrl+D` (duplicate) — needs `DuplicateCommand` (deferred; can
 *   be added later as the same plugin or as a follow-up)
 * - Arrow nudge — already provided by `selectionNudgePlugin`
 *
 * Future expansion: more bindings can be registered by other plugins
 * (or by replacing this one with a customized fork). The shortcut
 * registry is composable — multiple plugins coexist.
 */
export const builtinEditorShortcutsPlugin: EditorPlugin = {
  id: 'svge.builtin.editor-shortcuts',
  name: 'Built-in editor shortcuts (D-040)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const shortcuts = ctx.injector.get(ShortcutRegistry);
    const bus = ctx.injector.get(CommandBus);
    const selection = ctx.injector.get(SelectionService);
    const state = ctx.injector.get(EditorStateService);

    // ── Undo / Redo ────────────────────────────────────────────────
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.undo',
        combo: 'Ctrl+Z',
        description: 'Undo last command',
        run(event) {
          event.preventDefault();
          bus.undo();
        },
      }),
    );
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.redo-y',
        combo: 'Ctrl+Y',
        description: 'Redo (Windows idiom)',
        run(event) {
          event.preventDefault();
          bus.redo();
        },
      }),
    );
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.redo-shift-z',
        combo: 'Ctrl+Shift+Z',
        description: 'Redo (Mac/Linux idiom)',
        run(event) {
          event.preventDefault();
          bus.redo();
        },
      }),
    );

    // ── Group / Ungroup ────────────────────────────────────────────
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.group',
        combo: 'Ctrl+G',
        description: 'Group selection',
        run(event) {
          const ids = Array.from(selection.selectedIds());
          if (ids.length < 2) return; // need at least 2 to form a group
          event.preventDefault();
          bus.dispatch(new GroupSelectionCommand(ids));
        },
      }),
    );
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.ungroup',
        combo: 'Ctrl+Shift+G',
        description: 'Ungroup focused selection',
        run(event) {
          const focus = selection.focusId();
          if (focus === null) return;
          // Only dispatch when the focus IS a group — UngroupCommand
          // returns fail() otherwise but we save the round-trip.
          const node = findNodeById(state.document().root, focus);
          if (node === null || node.type !== 'group') return;
          event.preventDefault();
          bus.dispatch(new UngroupCommand(focus));
        },
      }),
    );

    // ── Select All ─────────────────────────────────────────────────
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.select-all',
        combo: 'Ctrl+A',
        description: 'Select all top-level nodes',
        run(event) {
          const root = state.document().root;
          if (root.type !== 'group' || root.children.length === 0) return;
          event.preventDefault();
          selection.selectMany(root.children.map((c) => c.id));
        },
      }),
    );
  },
};
