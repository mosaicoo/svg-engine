import type { ProviderToken } from '@angular/core';
import {
  CommandBus,
  EditorStateService,
  findNodeById,
  GroupSelectionCommand,
  RestoreSnapshotCommand,
  SnapshotsService,
  UngroupCommand,
} from 'svg-engine/core';
import type { EditorPlugin } from '../plugin/plugin';
import { PLUGIN_API_VERSION } from '../plugin/plugin';
import { SelectionService } from '../selection/selection.service';
import type { ShortcutContext } from './shortcut';
import { ShortcutRegistry } from './shortcut-registry.service';

/**
 * **`builtinEditorShortcutsPlugin`** — D-040 (Sprint Pro-Editor polish);
 * refactored in D-042 for multi-editor scope correctness.
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
 * **Multi-editor safety (D-042)**: handlers resolve services from the
 * `ShortcutContext.injector` passed by `ShortcutService` per-fire, NOT
 * from a closure captured at plugin install time. In a multi-editor
 * app using `provideSvgEngineEditorScope()`, this means Ctrl+Z hits
 * **the editor that received focus**, not a root singleton. Plugin
 * install happens once at app bootstrap; the `ctx.injector` from
 * install time is used as a fallback for single-editor apps and tests
 * that invoke handlers directly without a `ShortcutContext`.
 *
 * **NOT included** (intentional scope):
 * - `Ctrl+C` / `Ctrl+V` / `Ctrl+X` (clipboard) — `ClipboardService` +
 *   the corresponding menu contributions exist since D-044, but the
 *   keyboard shortcuts aren't wired here yet. Can be added later as
 *   the same plugin or as a follow-up — gives the consumer a chance
 *   to opt in/out per editor.
 * - `Ctrl+S` (save) — depends on consumer's save strategy.
 * - `Ctrl+D` (duplicate) — `DuplicateNodeCommand` exists since D-044,
 *   but the keyboard binding isn't registered here yet (same rationale
 *   as the clipboard shortcuts above).
 * - Arrow nudge — already provided by `selectionNudgePlugin`.
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

    // Resolution helper — uses the per-fire ShortcutContext.injector
    // when available (multi-editor scope, D-042), falls back to the
    // plugin-install context otherwise (single-editor apps + direct
    // test invocations without ShortcutContext).
    const fromCtx = <T>(runCtx: ShortcutContext | undefined, token: ProviderToken<T>): T =>
      (runCtx?.injector ?? ctx.injector).get(token);

    // ── Undo / Redo ────────────────────────────────────────────────
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.undo',
        combo: 'Ctrl+Z',
        description: 'Undo last command',
        run(event, runCtx) {
          event.preventDefault();
          fromCtx(runCtx, CommandBus).undo();
        },
      }),
    );
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.redo-y',
        combo: 'Ctrl+Y',
        description: 'Redo (Windows idiom)',
        run(event, runCtx) {
          event.preventDefault();
          fromCtx(runCtx, CommandBus).redo();
        },
      }),
    );
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.redo-shift-z',
        combo: 'Ctrl+Shift+Z',
        description: 'Redo (Mac/Linux idiom)',
        run(event, runCtx) {
          event.preventDefault();
          fromCtx(runCtx, CommandBus).redo();
        },
      }),
    );

    // ── Group / Ungroup ────────────────────────────────────────────
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.group',
        combo: 'Ctrl+G',
        description: 'Group selection',
        run(event, runCtx) {
          const selection = fromCtx(runCtx, SelectionService);
          const ids = Array.from(selection.selectedIds());
          if (ids.length < 2) return; // need at least 2 to form a group
          event.preventDefault();
          fromCtx(runCtx, CommandBus).dispatch(new GroupSelectionCommand(ids));
        },
      }),
    );
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.ungroup',
        combo: 'Ctrl+Shift+G',
        description: 'Ungroup focused selection',
        run(event, runCtx) {
          const selection = fromCtx(runCtx, SelectionService);
          const focus = selection.focusId();
          if (focus === null) return;
          // Only dispatch when the focus IS a group — UngroupCommand
          // returns fail() otherwise but we save the round-trip.
          const state = fromCtx(runCtx, EditorStateService);
          const node = findNodeById(state.document().root, focus);
          if (node === null || node.type !== 'group') return;
          event.preventDefault();
          fromCtx(runCtx, CommandBus).dispatch(new UngroupCommand(focus));
        },
      }),
    );

    // ── Select All ─────────────────────────────────────────────────
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.select-all',
        combo: 'Ctrl+A',
        description: 'Select all top-level nodes',
        run(event, runCtx) {
          const state = fromCtx(runCtx, EditorStateService);
          const root = state.document().root;
          if (root.type !== 'group' || root.children.length === 0) return;
          event.preventDefault();
          fromCtx(runCtx, SelectionService).selectMany(root.children.map((c) => c.id));
        },
      }),
    );

    // ── D-073 — Snapshots ──────────────────────────────────────────
    // Ctrl+Shift+S = take a manual snapshot (Photoshop convention).
    // Ctrl+Alt+Z   = restore the most recent snapshot (escape hatch
    //               for when the linear undo is too granular).
    //
    // Both gracefully no-op when SnapshotsService isn't provided in
    // the active scope — keeps headless/no-snapshot apps unaffected.
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.take-snapshot',
        combo: 'Ctrl+Shift+S',
        description: 'Take a snapshot of the current document',
        run(event, runCtx) {
          const injector = runCtx?.injector ?? ctx.injector;
          const snaps = injector.get(SnapshotsService, null, { optional: true });
          if (snaps === null) return;
          event.preventDefault();
          snaps.take(fromCtx(runCtx, EditorStateService).document(), { source: 'manual' });
        },
      }),
    );
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.restore-last-snapshot',
        combo: 'Ctrl+Alt+Z',
        description: 'Restore the most recent snapshot',
        run(event, runCtx) {
          const injector = runCtx?.injector ?? ctx.injector;
          const snaps = injector.get(SnapshotsService, null, { optional: true });
          if (snaps === null) return;
          const list = snaps.snapshots();
          if (list.length === 0) return;
          // Skip `auto-restore` snapshots — they're internal markers,
          // never the "last user-visible snapshot" the user wants.
          const target = list.find((s) => s.source !== 'auto-restore') ?? list[0]!;
          event.preventDefault();
          fromCtx(runCtx, CommandBus).dispatch(new RestoreSnapshotCommand(target.id, snaps));
        },
      }),
    );
  },
};
