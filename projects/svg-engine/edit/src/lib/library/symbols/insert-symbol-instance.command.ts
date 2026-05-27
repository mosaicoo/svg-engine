import {
  type Command,
  type CommandContext,
  type CommandResult,
  createSymbolUse,
  fail,
  generateNodeId,
  insertNode,
  type NodeId,
  ok,
  removeNode,
} from 'svg-engine/core';

/**
 * **D-059** — Insert a symbol instance (`SymbolUseNode`) at the
 * given position. The instance references the master via its
 * `symbolId`; the browser paints the master's content automatically
 * once `ActiveSymbolsService` contributes the `<symbol>` definition
 * to `<defs>`.
 *
 * **Why a dedicated command** (vs. plain `InsertNodeCommand`): the
 * factory + parent resolution + post-insert selection are common
 * enough that consumers (libraries panel, future Symbol tool) would
 * duplicate the same boilerplate. This command captures the
 * "spawn a working instance" intent in one place.
 *
 * **Position**: `(x, y)` is the top-left of the symbol's content box
 * in document coords (before any transform on the instance). When
 * `width`/`height` are omitted, the browser uses the master's
 * natural size.
 *
 * **Insertion target**: top-level of the document root (matches the
 * Insert menu / library panel UX — newly-inserted items go on top of
 * the z-stack at the document root, not nested inside groups).
 * Future enhancement: accept a `parentId` arg to drop into the
 * current isolation root or a specific group.
 *
 * **Undo**: removes the inserted instance by id. Standard pattern
 * shared with `InsertNodeCommand`.
 */
export class InsertSymbolInstanceCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  private insertedId: NodeId | null = null;

  constructor(
    private readonly symbolId: string,
    private readonly x: number,
    private readonly y: number,
    private readonly width?: number,
    private readonly height?: number,
    /**
     * **PAGES-FIX-4** — optional parent id. When omitted (or null), the
     * instance is inserted at the document root (back-compat). Callers
     * with a pages workflow (`<svge-shell-pro>` library panel) pass
     * `ActivePageService.effectiveDrawTargetId()` so the instance lands
     * inside the active page rather than as a sibling of the page.
     */
    private readonly parentId: NodeId | null = null,
  ) {
    this.label = `Insert symbol "${symbolId}"`;
  }

  /** Id of the inserted instance — read after execute() for selection. */
  getInsertedId(): NodeId | null {
    return this.insertedId;
  }

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const instance = createSymbolUse({
      symbolId: this.symbolId,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    });
    const effectiveParent = this.parentId ?? doc.root.id;
    let nextRoot;
    try {
      nextRoot = insertNode(doc.root, effectiveParent, instance);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    this.insertedId = instance.id;
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.insertedId === null) {
      return fail(`${this.label}: nothing to undo`);
    }
    const doc = ctx.state.document();
    const nextRoot = removeNode(doc.root, this.insertedId);
    if (nextRoot === doc.root) {
      return fail(`${this.label} undo: instance "${this.insertedId}" not found`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}
