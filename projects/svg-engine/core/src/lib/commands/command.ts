import type { EditorStateService } from '../state/editor-state.service';
import type { NodeId } from '../types/node-id';

/**
 * **PAGES-REFACTOR Fase 1** — contract that lets commands resolve
 * an *implicit* parent ("where do new shapes go right now?") without
 * the caller knowing about pages/active-page/scope.
 *
 * Concrete implementations live in `svg-engine/edit` (e.g.,
 * `ActivePageService.resolveAutoParent()` returns the active page's
 * id, or the document root when no page is active).
 *
 * **Why a token-friendly interface, not a service import**: keeps
 * `svg-engine/core` headless — the resolver is injected by name from
 * higher layers via `INSERT_PARENT_RESOLVER` token and threaded into
 * the command's `CommandContext`. Commands themselves don't `inject()`
 * anything (they are plain classes, per the JSDoc on {@link Command}).
 *
 * When a consumer dispatches an insert with `parentId: 'auto'` and no
 * resolver is wired (headless usage), the command falls back to the
 * document root — preserves the pre-PAGES behaviour for plain
 * `svg-engine/core` usage in Node / SSR / tests.
 */
export interface InsertParentResolver {
  /**
   * Return the effective parent id to use when an InsertNodeCommand
   * receives `parentId === 'auto'`. Implementations typically return
   * `activePage.id ?? doc.root.id`.
   */
  resolveAutoParent(): NodeId;
}

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
 *
 * **PAGES-REFACTOR Fase 1**: optional `parentResolver` lets
 * insert-style commands resolve an `'auto'` parent id to the
 * editor-scope's effective draw target (active page, isolation root,
 * or document root). When the field is `undefined` (headless / plain
 * core consumer), commands fall back to the document root.
 */
export interface CommandContext {
  readonly state: EditorStateService;
  readonly parentResolver?: InsertParentResolver;
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
  /**
   * **D-073** — Opt-in marker letting `CommandBus` auto-take a snapshot
   * **before** dispatching this command, when the editor scope has a
   * `SnapshotsService` AND its `limits.autoOnDestructive` is enabled.
   *
   * Set to `true` for commands that materially restructure the tree
   * in a way the user might want to roll back to (Pathfinder,
   * Optimize, BatchConvertToPath, MakeLiveBoolean, etc.). Leave
   * `undefined` or `false` for routine edits (Translate, SetProperty,
   * Group/Ungroup) — those are cheap enough to roll back via undo.
   *
   * The marker is opt-in (not "every command"); the auto-snapshot is
   * also opt-in at the user level (`autoOnDestructive` defaults to
   * `false`). Both gates must agree for a snapshot to fire — keeps
   * the panel clean for everyone who hasn't opted in.
   */
  readonly isDestructive?: boolean;
  execute(ctx: CommandContext): CommandResult;
  undo(ctx: CommandContext): CommandResult;
}
