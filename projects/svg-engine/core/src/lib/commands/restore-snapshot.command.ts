import type { SvgDocument } from '../document/svg-document';
import type { SnapshotsService } from '../snapshots/snapshots.service';
import { generateNodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * **D-073 — RestoreSnapshotCommand**. Restore the document to a
 * previously-taken {@link Snapshot} as a single undoable step.
 *
 * **Why a Command (vs a service method)**:
 *
 * - Restore IS a tree mutation (replaces `state.document()`), so it
 *   belongs on the undo stack — `Ctrl+Z` after a restore should put
 *   the user back where they were, not no-op. Service methods that
 *   bypass the bus are the source of "lost work via undo" bugs.
 * - Single undo entry per restore — consistent with every other
 *   bulk-mutation command (Optimize, Pathfinder, BatchConvert).
 *
 * **Why we don't auto-snapshot inside execute()**: would create an
 * `auto-restore` snapshot in the user-visible panel every time they
 * navigate snapshots, polluting the UI. The undo-stack capture below
 * (`previousDocument`) is enough to roll back via Ctrl+Z without
 * creating a panel entry. (Photoshop also doesn't create a snapshot
 * for "restore from snapshot" — that action goes only to history.)
 *
 * **Idempotency**: re-executing the same instance is safe because
 * `previousDocument` captures whatever state was current at the time
 * of first execute(), and re-execute() replaces back to the snapshot's
 * document (which is immutable). Redo therefore restores the same
 * document.
 */
export class RestoreSnapshotCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Restore Snapshot';
  // D-073 — marker for auto-snapshot interceptor: restoring a
  // snapshot is intentional navigation, NOT a destructive
  // structural mutation. Keep `isDestructive` falsy so the auto-
  // snapshot hook doesn't fire (would double-capture state).
  readonly isDestructive = false;

  private previousDocument: SvgDocument | null = null;

  constructor(
    private readonly snapshotId: string,
    private readonly snapshots: SnapshotsService,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const snap = this.snapshots.getById(this.snapshotId);
    if (snap === null) {
      return fail(`${this.label}: snapshot "${this.snapshotId}" not found`);
    }
    this.previousDocument = ctx.state.document();
    ctx.state.setDocument(snap.document);
    // Flag the panel so the restored snapshot lights up as
    // "currently viewing" — natural visual feedback.
    this.snapshots.setCurrent(snap.id);
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousDocument === null) {
      return fail(`${this.label} undo: nothing captured`);
    }
    ctx.state.setDocument(this.previousDocument);
    // Clear the current-snapshot marker — the user manually rolled
    // back, doc no longer matches any snapshot.
    this.snapshots.setCurrent(null);
    return ok();
  }
}
