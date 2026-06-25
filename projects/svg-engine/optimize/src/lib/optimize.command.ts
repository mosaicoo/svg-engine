import {
  type Command,
  type CommandContext,
  type CommandResult,
  generateNodeId,
  ok,
  type SvgDocument,
} from '@mosaicoo/svg-engine/core';
import type { OptimizerRegistry } from './optimizer-registry.service';

/**
 * Run the optimization pipeline as ONE undoable command (Item 3 —
 * débito 5-Optimize).
 *
 * Pre-Item-3, the playground called `OptimizerRegistry.runPipeline()`
 * directly and bypassed the undo stack — Optimize was destructive
 * to history because the user couldn't `Ctrl+Z` back to the pre-
 * optimize state. Now wrapping the pipeline in a Command produces
 * exactly one undo entry covering the whole pass set.
 *
 * **Construction-time dependency injection of the registry**: the
 * command needs access to the live `OptimizerRegistry`. Since
 * `Command` doesn't have an injector (its `CommandContext` only
 * exposes `state`), we pass the registry to the constructor. The
 * playground / consumer injects `OptimizerRegistry` and passes it
 * in.
 *
 * **No-op when pipeline doesn't change the document**: the registry's
 * `runPipeline` returns the same reference when no pass mutated;
 * we detect that and return `ok()` without pushing onto history.
 *
 * **Undo**: restores the pre-optimize document via the captured
 * snapshot (one reference; structural sharing means it's cheap).
 *
 * **`enabledIds`**: forwarded to `runPipeline` so the caller can
 * pick a subset of passes (e.g., from an "advanced settings" UI).
 * When omitted, all `defaultEnabled` passes run.
 */
export class OptimizeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Optimize';
  // D-073 — Optimize touches every node in the document (precision
  // rounding, default stripping, empty-group pruning, etc.). The
  // numeric drift is irreversible without an exact-state restore,
  // and the prune pass deletes structure. A pre-snapshot lets users
  // run Optimize confidently and roll back if the result looks off.
  readonly isDestructive = true;

  private previousDocument: SvgDocument | null = null;

  constructor(
    private readonly registry: OptimizerRegistry,
    private readonly enabledIds?: ReadonlySet<string> | null,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const before = ctx.state.document();
    const after = this.registry.runPipeline(before, this.enabledIds);
    if (after === before) return ok(); // no-op: no pass changed anything
    this.previousDocument = before;
    ctx.state.setDocument(after);
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousDocument === null) {
      // No-op execute (nothing to undo) — symmetric ok.
      return ok();
    }
    ctx.state.setDocument(this.previousDocument);
    return ok();
  }
}
