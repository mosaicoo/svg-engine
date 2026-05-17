import type { GroupNode } from '../model/group-node';
import { createGroup } from '../model/node-factory';
import { isGroupNode, type SvgNode } from '../model/svg-node';
import { findNodeById, findParent, insertNode, removeNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Wrap a set of selected nodes in a new `GroupNode` (categoria de
 * edição padrão de mercado — Figma/Affinity Cmd+G). Behaviour:
 *
 * - **Common parent required**: all `selectedIds` must share the same
 *   immediate parent group. Cross-parent grouping is a deeper edit
 *   (reparenting + reordering) that belongs to a future
 *   `MoveNodesInTreeCommand`. Mixed-parent input → `fail()`.
 * - **Insertion position**: the new group is inserted at the index of
 *   the **topmost** selected child within the common parent. This
 *   preserves visual stacking order (top child stays on top after
 *   wrapping).
 * - **Children order**: the wrapped children appear inside the new
 *   group in their **original parent-order** (not selection order).
 *   Visually consistent with how the user already sees them stacked.
 * - **No transform/style on the new group**: it carries IDENTITY +
 *   default style. Children's transforms/styles are preserved
 *   verbatim, so the visual result is identical to pre-grouping.
 * - **Undo**: restores the original parent's children in their exact
 *   original order. Each previously-selected child is reattached at
 *   the index it occupied before grouping (captured at execute time).
 *
 * Empty selection or single-node selection are technically allowed
 * (single-node grouping wraps that one node in a group — a real
 * editor use case for "frame this shape"). Zero-node selection
 * however fails — there's nothing to wrap.
 *
 * **Why not just dispatch N InsertNode/RemoveNode**: keeps the undo
 * stack at exactly ONE entry per UI action (Ctrl+G = one undo) — the
 * established gesture-as-single-command pattern.
 */
export class GroupSelectionCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Group selection';

  private newGroupId: NodeId | null = null;
  private parentId: NodeId | null = null;
  /** `{id, index}` for each wrapped child — used to restore on undo. */
  private snapshot: readonly { readonly id: NodeId; readonly index: number }[] = [];
  /**
   * Reference to each wrapped child as it existed at execute time
   * (for undo to restore byref instead of refetching from the post-
   * execute state where they live INSIDE the group).
   */
  private wrappedNodes: readonly SvgNode[] = [];

  constructor(
    private readonly selectedIds: readonly NodeId[],
    /** Optional explicit group id (defaults to a generated NodeId). */
    private readonly groupId?: NodeId,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    if (this.selectedIds.length === 0) {
      return fail('GroupSelectionCommand: selection is empty');
    }

    const doc = ctx.state.document();

    // Validate: every id exists and they share a single immediate parent.
    let commonParent: GroupNode | null = null;
    const nodes: SvgNode[] = [];
    for (const id of this.selectedIds) {
      const node = findNodeById(doc.root, id);
      if (node === null) {
        return fail(`GroupSelectionCommand: node "${id}" not found`);
      }
      const parent = findParent(doc.root, id);
      if (parent === null) {
        return fail(`GroupSelectionCommand: node "${id}" has no parent`);
      }
      if (commonParent === null) commonParent = parent;
      else if (commonParent.id !== parent.id) {
        return fail(
          `GroupSelectionCommand: nodes must share the same immediate parent (found "${commonParent.id}" and "${parent.id}")`,
        );
      }
      nodes.push(node);
    }
    if (commonParent === null) {
      return fail('GroupSelectionCommand: could not resolve common parent');
    }

    // Capture each child's original index in the parent — used for both
    // the new group's insertion position and the undo restoration.
    const selectedSet = new Set(this.selectedIds);
    const snapshot: { id: NodeId; index: number }[] = [];
    commonParent.children.forEach((child: SvgNode, idx: number) => {
      if (selectedSet.has(child.id)) snapshot.push({ id: child.id, index: idx });
    });

    // Ordered children: parent-order, not selection-order
    const orderedChildren = snapshot.map((s) => nodes.find((n) => n.id === s.id)!);
    // Insertion index = topmost selected child's original position
    const insertAt = snapshot[0]!.index;

    // Snapshot for undo BEFORE any tree mutation
    this.snapshot = snapshot;
    this.wrappedNodes = orderedChildren;
    this.parentId = commonParent.id;

    const newGroup = createGroup(orderedChildren, { id: this.groupId });
    this.newGroupId = newGroup.id;

    // Mutation: remove each wrapped child, then insert the new group
    // at the captured position.
    let root = doc.root;
    for (const id of this.selectedIds) {
      const after = removeNode(root, id);
      if (after === root) {
        return fail(`GroupSelectionCommand: failed to detach child "${id}"`);
      }
      root = after;
    }
    let withGroup;
    try {
      withGroup = insertNode(root, commonParent.id, newGroup, insertAt);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    if (withGroup === root) {
      return fail(`GroupSelectionCommand: failed to insert new group under "${commonParent.id}"`);
    }
    ctx.state.setDocument({ ...doc, root: withGroup });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.newGroupId === null || this.parentId === null) {
      return fail('GroupSelectionCommand undo: nothing captured (was execute called?)');
    }
    const doc = ctx.state.document();
    // Step 1: remove the new group from the tree.
    let root = removeNode(doc.root, this.newGroupId);
    if (root === doc.root) {
      return fail(`GroupSelectionCommand undo: group "${this.newGroupId}" not found`);
    }
    // Step 2: re-attach each wrapped child at its original index.
    // The snapshot order matches parent-order; inserting in that order
    // preserves the original layout exactly.
    for (let i = 0; i < this.snapshot.length; i++) {
      const { index } = this.snapshot[i]!;
      const node = this.wrappedNodes[i]!;
      try {
        root = insertNode(root, this.parentId, node, index);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    }
    // Sanity: the parent should now contain exactly the original children
    // in their original positions. (Trust-but-verify: a stray group
    // would mean execute captured wrong indices — surface as a clean
    // failure rather than letting the undo silently corrupt the tree.)
    const restored = findNodeById(root, this.parentId);
    if (restored === null || !isGroupNode(restored)) {
      return fail(`GroupSelectionCommand undo: parent "${this.parentId}" lost`);
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }
}
