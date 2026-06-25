import {
  AUTO_PARENT,
  type Command,
  type CommandContext,
  type CommandResult,
  createSymbolUse,
  fail,
  generateNodeId,
  insertNode,
  type NodeId,
  ok,
  type ParentRef,
  removeNode,
} from '@mosaicoo/svg-engine/core';

/** Position + dimensions for a single spray drop. */
export interface SprayDrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * **D-062a** — Insert N symbol instances in a single atomic command
 * (one undo entry rolls back the whole spray). Used by the Symbol
 * Sprayer tool: a single drag generates dozens of drops; emitting one
 * `InsertSymbolInstanceCommand` per drop would clog the undo stack
 * with as many entries.
 *
 * **Pattern**: batch insertion + reverse-order removal on undo.
 * Matches the contract of {@link InsertSymbolInstanceCommand} but
 * walks an array of positions instead of a single (x, y, w, h).
 *
 * **No-op guard**: empty `drops` array succeeds silently (the
 * sprayer's `onPointerUp` calls this even when a drag accumulated
 * zero drops — e.g. a click without any movement).
 */
export class InsertSymbolInstancesBatchCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  private insertedIds: NodeId[] = [];

  constructor(
    private readonly symbolId: string,
    private readonly drops: readonly SprayDrop[],
    /**
     * **PAGES-REFACTOR Fase 1** — parent target. Defaults to
     * {@link AUTO_PARENT} so the spray lands inside the active page
     * via the `INSERT_PARENT_RESOLVER` editor scope. **This default
     * fixes the P0 reported in the audit**: before the refactor the
     * batch hard-coded `doc.root.id` and the spray vanished as a
     * sibling of the page (page-filter renderer hid the instances).
     */
    private readonly parentId: ParentRef = AUTO_PARENT,
  ) {
    this.label = `Spray ${drops.length} symbol${drops.length === 1 ? '' : 's'} "${symbolId}"`;
  }

  /** Ids inserted by this batch — read after `execute()` for selection. */
  getInsertedIds(): readonly NodeId[] {
    return this.insertedIds;
  }

  execute(ctx: CommandContext): CommandResult {
    if (this.drops.length === 0) {
      return ok();
    }
    const doc = ctx.state.document();
    let nextRoot = doc.root;
    const ids: NodeId[] = [];
    for (const drop of this.drops) {
      const instance = createSymbolUse({
        symbolId: this.symbolId,
        x: drop.x,
        y: drop.y,
        width: drop.width,
        height: drop.height,
      });
      const effectiveParent: NodeId =
        this.parentId === AUTO_PARENT
          ? (ctx.parentResolver?.resolveAutoParent() ?? doc.root.id)
          : this.parentId;
      try {
        nextRoot = insertNode(nextRoot, effectiveParent, instance);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
      ids.push(instance.id);
    }
    this.insertedIds = ids;
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.insertedIds.length === 0) {
      return ok();
    }
    const doc = ctx.state.document();
    let nextRoot = doc.root;
    // Remove in reverse insertion order — preserves consistency with
    // sibling structures that depend on creation order (z-index).
    for (let i = this.insertedIds.length - 1; i >= 0; i--) {
      const id = this.insertedIds[i]!;
      const removed = removeNode(nextRoot, id);
      if (removed === nextRoot) {
        return fail(`${this.label} undo: instance "${id}" not found`);
      }
      nextRoot = removed;
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}
