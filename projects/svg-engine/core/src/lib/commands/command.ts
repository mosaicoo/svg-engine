import type { EditorStateService } from '../state/editor-state.service';

/**
 * Result of executing or undoing a {@link Command}. The bus uses `ok` to
 * decide whether to push the command onto the history stack.
 */
export interface CommandResult {
  readonly ok: boolean;
  readonly error?: string;
}

/** Convenience constructor for a successful result. */
export const ok: () => CommandResult = () => ({ ok: true });

/** Convenience constructor for a failed result with a message. */
export function fail(error: string): CommandResult {
  return { ok: false, error };
}

/**
 * Context handed to a command at execute/undo time. Decoupling commands
 * from `inject()` keeps them trivially constructible in tests and from
 * non-Angular consumers (Node scripts, web workers, future SSR).
 */
export interface CommandContext {
  readonly state: EditorStateService;
}

/**
 * A reversible mutation to the editor state. Commands are plain classes
 * (no `@Injectable`); construct with the data they need, then dispatch
 * through {@link CommandBus}.
 *
 * Implementations must:
 *  - capture, in their constructor or in `execute`, all data required to
 *    {@link undo} the change (snapshots, previous values, etc.);
 *  - be pure with respect to `state` reads — never read from `inject()`
 *    or other ambient sources;
 *  - return {@link fail} (and **not** mutate state) when execution
 *    cannot proceed.
 */
export interface Command {
  /** Unique id of this command instance (for debugging / telemetry). */
  readonly id: string;
  /** Human-readable label suitable for an "Undo X" menu entry. */
  readonly label: string;
  execute(ctx: CommandContext): CommandResult;
  undo(ctx: CommandContext): CommandResult;
}
