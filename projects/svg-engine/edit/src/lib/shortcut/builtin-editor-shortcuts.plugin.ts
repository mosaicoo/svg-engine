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
import { MenuContributionRegistry } from '../menu/menu-contribution-registry.service';
import { runContribution } from '../menu/menu-context';
import { ActivePageService } from '../pages/active-page.service';
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
 * | `Ctrl+X`        | Cut selection (D-111, delegates to Edit ▸ Cut)           |
 * | `Ctrl+C`        | Copy selection (D-111, delegates to Edit ▸ Copy)         |
 * | `Ctrl+V`        | Paste (D-111, delegates to Edit ▸ Paste)                 |
 * | `Ctrl+Shift+V` | Paste in place (D-111, delegates to Edit ▸ Paste In Place) |
 * | `Ctrl+D`        | Duplicate selection (D-111, delegates to Edit ▸ Duplicate) |
 * | `Ctrl+S`        | Save Workspace (.svge) — delegates to File ▸ Save (D-138) |
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
 * **Clipboard + Duplicate (D-111)**: `Ctrl+X` / `Ctrl+C` / `Ctrl+V` /
 * `Ctrl+Shift+V` / `Ctrl+D` are now wired here (see the table above) —
 * each delegates to its Edit-menu contribution (`ClipboardService` +
 * `DuplicateNodeCommand`, both from D-044). They were intentionally left
 * out until D-111 so consumers could opt in/out per editor.
 *
 * **NOT included** (intentional scope):
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
        category: 'Edit',
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
        category: 'Edit',
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
        category: 'Edit',
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
        category: 'Object',
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
        category: 'Object',
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
        description: 'Select all objects on the active page',
        category: 'Selection',
        run(event, runCtx) {
          // **D-103** — select within the ACTIVE PAGE (the rendered subtree),
          // not the document root. Selecting `root.children` post-PAGES-REFACTOR
          // grabbed the page node (no selection overlay). Mirrors the menu's
          // Select All handler.
          const container = fromCtx(runCtx, ActivePageService).treeForRendering();
          if (container.type !== 'group' || container.children.length === 0) return;
          event.preventDefault();
          fromCtx(runCtx, SelectionService).selectMany(container.children.map((c) => c.id));
        },
      }),
    );

    // ── D-111 — Clipboard + Duplicate ──────────────────────────────
    //
    // Ctrl+X / Ctrl+C / Ctrl+V / Ctrl+Shift+V / Ctrl+D. The handlers ALREADY
    // exist as Edit-menu contributions (D-044/D-102, `builtinMenuContributions
    // Plugin`); these shortcuts **delegate** to those exact contributions via
    // `runContribution` (the same pattern Ctrl+S uses for Save). This keeps a
    // single source of truth — including the D-111 system-clipboard upgrade to
    // Paste, which the keystroke inherits for free — and surfaces each binding
    // in the **Keyboard Shortcuts** dialog (category drives the grouping).
    //
    // Safe by construction: the `ShortcutService` skips events from editable
    // targets (`isEditableTarget`), so Ctrl+C/V/X inside a text field / input
    // still do native text copy-paste, not node copy-paste. The handlers also
    // no-op gracefully (empty selection / empty clipboard), so binding them
    // unconditionally is harmless. A missing menu item (consumer didn't install
    // the menu plugin) → no `preventDefault`, native behavior preserved.
    const bindMenuShortcut = (
      id: string,
      combo: string,
      description: string,
      category: string,
      menuId: string,
    ): void => {
      ctx.track(
        shortcuts.register({
          id,
          combo,
          description,
          category,
          run(event, runCtx) {
            const injector = runCtx?.injector ?? ctx.injector;
            const item = injector.get(MenuContributionRegistry).get(menuId);
            if (item === null) return;
            event.preventDefault();
            runContribution(item, injector);
          },
        }),
      );
    };
    bindMenuShortcut(
      'svge.builtin.shortcut.cut',
      'Ctrl+X',
      'Cut selection',
      'Edit',
      'svge.builtin.edit.cut',
    );
    bindMenuShortcut(
      'svge.builtin.shortcut.copy',
      'Ctrl+C',
      'Copy selection',
      'Edit',
      'svge.builtin.edit.copy',
    );
    bindMenuShortcut(
      'svge.builtin.shortcut.paste',
      'Ctrl+V',
      'Paste',
      'Edit',
      'svge.builtin.edit.paste',
    );
    bindMenuShortcut(
      'svge.builtin.shortcut.paste-in-place',
      'Ctrl+Shift+V',
      'Paste in place',
      'Edit',
      'svge.builtin.edit.paste-in-place',
    );
    bindMenuShortcut(
      'svge.builtin.shortcut.duplicate',
      'Ctrl+D',
      'Duplicate selection',
      'Edit',
      'svge.builtin.edit.duplicate',
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
        category: 'Snapshots',
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
        category: 'Snapshots',
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

    // ── D-138 — File: Save Workspace ───────────────────────────────
    // Ctrl+S saves the workspace (.svge). Delegates to the File ▸ Save
    // menu contribution so the shortcut reuses the EXACT save code path
    // (`saveWorkspace`) and per-editor scope — no duplicate logic.
    //
    // `Ctrl+Shift+S` is deliberately NOT bound here — it already drives
    // Take Snapshot (D-073). The compressed `.svgez` variant stays
    // click-only (File ▸ Save As…).
    //
    // Graceful no-op when the menu plugin isn't installed: we DON'T
    // `preventDefault`, so the browser's native Save dialog still works
    // instead of silently swallowing the keystroke.
    ctx.track(
      shortcuts.register({
        id: 'svge.builtin.shortcut.save-workspace',
        combo: 'Ctrl+S',
        description: 'Save workspace (.svge)',
        category: 'File',
        run(event, runCtx) {
          const injector = runCtx?.injector ?? ctx.injector;
          const item = injector.get(MenuContributionRegistry).get('svge.builtin.file.save');
          if (item === null) return;
          event.preventDefault();
          runContribution(item, injector);
        },
      }),
    );
  },
};
