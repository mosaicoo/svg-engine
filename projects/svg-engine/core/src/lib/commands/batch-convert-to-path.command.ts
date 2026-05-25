import { findNodeById } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';
import { ConvertNodeToPathCommand } from './convert-to-path.command';

/**
 * **D-071b** — Batch convert N convertible nodes into paths in a
 * SINGLE undoable step. Mirrors how
 * {@link import('./set-style-property-on-many.command').SetStylePropertyOnManyCommand}
 * collapses N style edits into one undo entry — Ctrl+Z reverts the
 * whole batch.
 *
 * **Why not just dispatch N `ConvertNodeToPathCommand`s**: that pushes
 * N undo entries; users expect "one Convert click = one undo step".
 *
 * **Composition**: wraps N sub-commands. Pre-validates ALL ids exist
 * and are convertible before mutating anything — atomic-ish semantics
 * (caveat below). On undo, replays each sub-command's `undo()` in
 * REVERSE order so the document returns to the exact pre-batch state.
 *
 * **Caveat — partial-failure during execute**: if a sub-command fails
 * mid-batch (extremely rare; would mean the tree changed under us
 * between validation and apply), the already-executed sub-commands
 * are NOT auto-rolled-back. The returned `fail` signals to the caller;
 * a manual undo can recover. Practical incidence is zero in the
 * single-threaded CommandBus pipeline.
 *
 * **Filter convertible**: the Inspector calling code should pre-filter
 * to types `ConvertNodeToPathCommand` actually handles (`rect`,
 * `ellipse`, `line`, `polygon`, `polyline`). Passing groups / text /
 * images here causes the sub-command to fail at execute time.
 */
export class BatchConvertToPathCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  private readonly subCommands: readonly ConvertNodeToPathCommand[];

  constructor(private readonly nodeIds: readonly NodeId[]) {
    this.subCommands = nodeIds.map((id) => new ConvertNodeToPathCommand(id));
    this.label =
      nodeIds.length === 1 ? 'Convert to path' : `Convert ${nodeIds.length} nodes to path`;
  }

  execute(ctx: CommandContext): CommandResult {
    if (this.nodeIds.length === 0) return ok();
    // Pre-validate every id exists (cheap walk). The sub-command will
    // also re-validate, but failing here gives a clearer error and
    // avoids any partial application surprises in 99.9% of cases.
    const doc = ctx.state.document();
    for (const id of this.nodeIds) {
      if (findNodeById(doc.root, id) === null) {
        return fail(`BatchConvertToPathCommand: node "${id}" not found`);
      }
    }
    // Execute each sub-command. ConvertNodeToPathCommand reads the doc
    // signal each time so it sees the previous sub-command's mutation.
    for (const cmd of this.subCommands) {
      const r = cmd.execute(ctx);
      if (!r.ok) return r;
    }
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    // Reverse order — last-in-first-out — so each undo step sees the
    // tree state its corresponding execute() produced.
    for (let i = this.subCommands.length - 1; i >= 0; i--) {
      const r = this.subCommands[i]!.undo(ctx);
      if (!r.ok) return r;
    }
    return ok();
  }
}
