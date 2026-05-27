import type { SvgNode } from '../model/svg-node';
import { insertNode, removeNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Sentinel value used in place of a concrete parent id to ask the
 * editor scope ("where should new shapes go right now?") for the
 * effective parent — usually the active page id, falling back to the
 * document root when no page is active. Resolved at `execute()` time
 * via the optional {@link CommandContext.parentResolver}.
 *
 * **Why a string sentinel and not `null`/`undefined`**: makes the
 * intent explicit at the call site ("auto") and keeps the type
 * narrow — TypeScript exhaustive checking on `'auto' | NodeId` flags
 * any callsite that forgets to handle either branch.
 */
export const AUTO_PARENT = 'auto' as const;

/**
 * Parent argument accepted by insert-style commands. Either an
 * explicit `NodeId` (e.g., "insert into this specific group") OR the
 * sentinel {@link AUTO_PARENT} which delegates the decision to the
 * editor scope at execute time.
 */
export type ParentRef = NodeId | typeof AUTO_PARENT;

/**
 * Insert `node` as a child of the group identified by `parentId`. The
 * undo step removes the inserted node by its id, restoring referential
 * equality on the path that was affected by the insertion.
 *
 * **PAGES-REFACTOR Fase 1** — `parentId` accepts {@link AUTO_PARENT}
 * (default). When 'auto':
 * 1. `ctx.parentResolver?.resolveAutoParent()` is queried (provided
 *    by `svg-engine/edit` via the `INSERT_PARENT_RESOLVER` token).
 *    Returns the active page id when one is active.
 * 2. Falls back to `ctx.state.document().root.id` when no resolver
 *    is wired (headless / Node consumers).
 *
 * The resolution happens **inside** `execute` (not at construction)
 * so the command captures the actual parent id used in the closure
 * for `undo` to remove cleanly — the parent might change between
 * dispatch and execute in theory, but practical dispatch is sync.
 */
export class InsertNodeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  /**
   * Captured at `execute` time so `undo` can verify which parent was
   * actually used. Used for telemetry / debugging — undo itself only
   * needs the node id, not the parent.
   */
  private resolvedParentId: NodeId | null = null;

  constructor(
    private readonly parentId: ParentRef,
    private readonly node: SvgNode,
    private readonly index?: number,
  ) {
    this.label = `Insert ${node.type}`;
  }

  /** Parent id captured at execute time (or `null` pre-execute). */
  getResolvedParentId(): NodeId | null {
    return this.resolvedParentId;
  }

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const effectiveParent: NodeId =
      this.parentId === AUTO_PARENT
        ? (ctx.parentResolver?.resolveAutoParent() ?? doc.root.id)
        : this.parentId;
    this.resolvedParentId = effectiveParent;
    let nextRoot;
    try {
      nextRoot = insertNode(doc.root, effectiveParent, this.node, this.index);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    if (nextRoot === doc.root) {
      return fail(`InsertNodeCommand: parent group "${effectiveParent}" not found`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const nextRoot = removeNode(doc.root, this.node.id);
    if (nextRoot === doc.root) {
      return fail(`InsertNodeCommand undo: node "${this.node.id}" not found`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}
