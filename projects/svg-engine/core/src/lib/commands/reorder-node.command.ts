import type { SvgNode } from '../model/svg-node';
import { findParent, insertNode, removeNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Z-order operation requested by the user. SVG draws children in
 * document order: **first child = back, last child = front**. So
 * `forward`/`toFront` move the node toward the END of `parent.children`
 * and `backward`/`toBack` move it toward the START.
 */
export type ReorderDirection = 'forward' | 'backward' | 'toFront' | 'toBack';

/**
 * Reorder a node within its parent group (Fase 4 — z-order). Single
 * undoable command for any of the 4 standard stacking operations:
 *
 * - `forward`: swap with the next sibling (1 step toward front).
 * - `backward`: swap with the previous sibling (1 step toward back).
 * - `toFront`: move to the end (= topmost in z-order).
 * - `toBack`: move to the start (= bottommost in z-order).
 *
 * **No-op cases** (return `ok` without mutating state):
 * - Already at the target edge (e.g., `forward` when last child).
 * - Single-child parent.
 *
 * **Fail cases**:
 * - Node id not found.
 * - Node has no parent (= it IS the document root).
 *
 * **Undo**: re-inserts the node at its original index. Captured at
 * execute time; tolerates index shifts from intervening commands by
 * binding to id (not raw index).
 */
export class ReorderNodeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  private parentId: NodeId | null = null;
  private originalIndex = -1;
  private nodeRef: SvgNode | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly direction: ReorderDirection,
  ) {
    this.label = `Reorder (${direction})`;
  }

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const parent = findParent(doc.root, this.nodeId);
    if (parent === null) {
      return fail(`ReorderNodeCommand: node "${this.nodeId}" has no parent (root or missing)`);
    }
    const oldIndex = parent.children.findIndex((c) => c.id === this.nodeId);
    if (oldIndex < 0) {
      return fail(`ReorderNodeCommand: failed to locate node in its parent`);
    }
    const node = parent.children[oldIndex]!;
    const lastIndex = parent.children.length - 1;
    const newIndex = computeNewIndex(oldIndex, lastIndex, this.direction);

    // Snapshot for undo BEFORE any mutation.
    this.parentId = parent.id;
    this.originalIndex = oldIndex;
    this.nodeRef = node;

    if (newIndex === oldIndex) return ok(); // no-op: already at target edge

    // Mutate: remove then re-insert at `newIndex`. `newIndex` is the
    // FINAL position we want in the post-removal array, and that is
    // exactly the index to pass to `insertNode` — NO off-by-one
    // adjustment is needed in either direction:
    // - moving toward the back (newIndex < oldIndex): the removed slot is
    //   after newIndex, so positions up to newIndex are unaffected.
    // - moving toward the front (newIndex > oldIndex): inserting at the
    //   original newIndex into the one-shorter array lands the node after
    //   the sibling it should follow (verified for all four directions;
    //   `insertNode` also clamps, covering the toFront/end case).
    // The ternary is therefore a deliberate no-op (both arms = newIndex).
    const adjusted = newIndex > oldIndex ? newIndex : newIndex;
    let root = removeNode(doc.root, this.nodeId);
    if (root === doc.root) {
      return fail(`ReorderNodeCommand: failed to detach node`);
    }
    try {
      root = insertNode(root, parent.id, node, adjusted);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.parentId === null || this.nodeRef === null) {
      return fail('ReorderNodeCommand undo: nothing captured');
    }
    const doc = ctx.state.document();
    let root = removeNode(doc.root, this.nodeId);
    if (root === doc.root) {
      return fail(`ReorderNodeCommand undo: node "${this.nodeId}" not found`);
    }
    try {
      root = insertNode(root, this.parentId, this.nodeRef, this.originalIndex);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }
}

function computeNewIndex(oldIndex: number, lastIndex: number, direction: ReorderDirection): number {
  switch (direction) {
    case 'forward':
      return Math.min(lastIndex, oldIndex + 1);
    case 'backward':
      return Math.max(0, oldIndex - 1);
    case 'toFront':
      return lastIndex;
    case 'toBack':
      return 0;
  }
}
