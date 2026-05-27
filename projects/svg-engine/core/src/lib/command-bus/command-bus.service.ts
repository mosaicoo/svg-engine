import { inject, Injectable } from '@angular/core';
import type { Command, CommandContext, CommandResult } from '../commands/command';
import { fail } from '../commands/command';
import { INSERT_PARENT_RESOLVER } from '../commands/insert-parent-resolver.token';
import { HistoryService } from '../history/history.service';
import { SnapshotsService } from '../snapshots/snapshots.service';
import { EditorStateService } from '../state/editor-state.service';

/**
 * Single entry point for **all** mutations to the editor state. Wraps
 * {@link Command#execute} with history bookkeeping; on success the command
 * is pushed onto the undo stack and the redo stack is cleared.
 *
 * Consumers — including UI components and plugins — should never invoke
 * `command.execute()` directly nor mutate {@link EditorStateService}
 * outside of a command. This invariant is what makes undo/redo reliable.
 *
 * **D-073 hook**: before dispatching a {@link Command} marked
 * `isDestructive: true`, asks the optional {@link SnapshotsService}
 * to take an `auto-destructive` snapshot of the pre-mutation state.
 * Both signals must agree for the snapshot to fire:
 *
 * - The command opts in via `isDestructive: true`
 * - The editor opts in via `snapshots.limits().autoOnDestructive`
 *
 * SnapshotsService is injected **optionally** so headless / Node /
 * single-doc consumers that don't bother with the snapshots feature
 * pay zero cost — the hook is a no-op when the service is absent.
 */
@Injectable({ providedIn: 'root' })
export class CommandBus {
  private readonly state = inject(EditorStateService);
  private readonly history = inject(HistoryService);
  // Optional because consumers that don't include `provideSvgEngineEditorScope()`
  // (or its `SnapshotsService` entry) get a clean fallback: dispatch
  // continues to work, just without auto-snapshots.
  private readonly snapshots = inject(SnapshotsService, { optional: true });
  // **PAGES-REFACTOR Fase 1** — optional resolver that turns
  // `InsertNodeCommand` with `parentId: AUTO_PARENT` into the active
  // page's id. Wired by `svg-engine/edit`'s scope provider; absent in
  // headless / Node usage of plain `svg-engine/core` (insert falls
  // back to `doc.root.id` inside the command).
  private readonly parentResolver = inject(INSERT_PARENT_RESOLVER, { optional: true });

  /**
   * Execute `command`. If it returns `ok`, the command is pushed onto
   * history and any pending redo entries are cleared. Failed commands
   * are not pushed and must leave state untouched (the contract on
   * {@link Command#execute}).
   *
   * **D-073** — captures an `auto-destructive` snapshot BEFORE
   * `command.execute` when the command is flagged destructive AND
   * the user has `autoOnDestructive: true` in
   * {@link SnapshotsService}'s limits. The pre-state is captured —
   * not the post-state — so restoring the snapshot returns to where
   * the user was before the destructive op (the "what would I have
   * undone to?" intent).
   */
  dispatch(command: Command): CommandResult {
    this.maybeAutoSnapshot(command);
    const result = command.execute(this.buildContext());
    if (result.ok) {
      this.history.push(command);
    }
    return result;
  }

  /**
   * **PAGES-REFACTOR Fase 1** — one place where the runtime context
   * is assembled; shared by `dispatch`, `undo`, and `redo` so insert-
   * style commands see the same resolver in every code path.
   *
   * The `parentResolver` field is omitted entirely (not `undefined`)
   * when the token isn't provided — keeps the existing
   * `CommandContext: { state }` shape valid for headless callers.
   */
  private buildContext(): CommandContext {
    if (this.parentResolver === null) return { state: this.state };
    return { state: this.state, parentResolver: this.parentResolver };
  }

  private maybeAutoSnapshot(command: Command): void {
    if (command.isDestructive !== true) return;
    const snaps = this.snapshots;
    if (snaps === null) return;
    if (!snaps.limits().autoOnDestructive) return;
    snaps.take(this.state.document(), {
      name: `Before ${command.label}`,
      source: 'auto-destructive',
    });
  }

  /**
   * Undo the most recent command. The command is moved from undo to
   * redo only if its `undo` returns `ok`; otherwise both stacks remain
   * untouched and the failure is reported back to the caller.
   */
  undo(): CommandResult {
    const command = this.history.peekUndo();
    if (command === null) return fail('Nothing to undo');
    const result = command.undo(this.buildContext());
    if (result.ok) {
      this.history.commitUndo();
    }
    return result;
  }

  /**
   * Redo the most recent undone command. Symmetric to {@link undo}.
   */
  redo(): CommandResult {
    const command = this.history.peekRedo();
    if (command === null) return fail('Nothing to redo');
    const result = command.execute(this.buildContext());
    if (result.ok) {
      this.history.commitRedo();
    }
    return result;
  }
}
