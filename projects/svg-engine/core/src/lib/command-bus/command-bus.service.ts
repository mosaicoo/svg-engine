import { inject, Injectable } from '@angular/core';
import type { Command, CommandResult } from '../commands/command';
import { fail } from '../commands/command';
import { HistoryService } from '../history/history.service';
import { EditorStateService } from '../state/editor-state.service';

/**
 * Single entry point for **all** mutations to the editor state. Wraps
 * {@link Command#execute} with history bookkeeping; on success the command
 * is pushed onto the undo stack and the redo stack is cleared.
 *
 * Consumers — including UI components and plugins — should never invoke
 * `command.execute()` directly nor mutate {@link EditorStateService}
 * outside of a command. This invariant is what makes undo/redo reliable.
 */
@Injectable({ providedIn: 'root' })
export class CommandBus {
  private readonly state = inject(EditorStateService);
  private readonly history = inject(HistoryService);

  /**
   * Execute `command`. If it returns `ok`, the command is pushed onto
   * history and any pending redo entries are cleared. Failed commands
   * are not pushed and must leave state untouched (the contract on
   * {@link Command#execute}).
   */
  dispatch(command: Command): CommandResult {
    const result = command.execute({ state: this.state });
    if (result.ok) {
      this.history.push(command);
    }
    return result;
  }

  /**
   * Undo the most recent command. The command is moved from undo to
   * redo only if its `undo` returns `ok`; otherwise both stacks remain
   * untouched and the failure is reported back to the caller.
   */
  undo(): CommandResult {
    const command = this.history.peekUndo();
    if (command === null) return fail('Nothing to undo');
    const result = command.undo({ state: this.state });
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
    const result = command.execute({ state: this.state });
    if (result.ok) {
      this.history.commitRedo();
    }
    return result;
  }
}
