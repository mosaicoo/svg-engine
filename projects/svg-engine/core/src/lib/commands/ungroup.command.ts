import type { GroupNode } from '../model/group-node';
import { createGroup } from '../model/node-factory';
import { isGroupNode, type SvgNode } from '../model/svg-node';
import { findNodeById, findParent, insertNode, removeNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Dissolve a `GroupNode` by promoting its children to its own parent
 * (categoria de edição padrão de mercado — Figma/Affinity Cmd+Shift+G).
 *
 * **Position semantics**: the promoted children land at the index the
 * group occupied — preserving visual stacking. Order among promoted
 * children matches the group's `children` array (top child stays on
 * top after ungrouping).
 *
 * **Group transform/style are dropped**: the children's local
 * geometry + transforms continue to apply, and the group itself
 * carried no visual content of its own beyond composition. If the
 * group had a meaningful transform (e.g., a rotated group), that
 * transform is LOST by ungrouping. This matches Figma's "Ungroup"
 * (which warns the user) and Affinity's "Ungroup". A future
 * `BakeGroupTransformCommand` could be added to compose the group
 * transform into each child before ungrouping; for now we document
 * the limitation.
 *
 * **Cannot ungroup the root**: the document root is itself a
 * `GroupNode` but has no parent — ungrouping it would orphan all
 * top-level shapes. Attempt → `fail()`.
 *
 * **Undo**: re-creates the group with the SAME id (so any external
 * references survive), re-attaches the children in their original
 * order, and re-inserts the group at its original index.
 */
export class UngroupCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Ungroup';

  private parentId: NodeId | null = null;
  private originalIndex = -1;
  private originalGroup: GroupNode | null = null;

  constructor(private readonly groupId: NodeId) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    if (this.groupId === doc.root.id) {
      return fail('UngroupCommand: cannot ungroup the document root');
    }
    const target = findNodeById(doc.root, this.groupId);
    if (target === null) {
      return fail(`UngroupCommand: group "${this.groupId}" not found`);
    }
    if (!isGroupNode(target)) {
      return fail(`UngroupCommand: node "${this.groupId}" is not a group`);
    }
    const parent = findParent(doc.root, this.groupId);
    if (parent === null) {
      return fail(`UngroupCommand: group "${this.groupId}" has no parent`);
    }
    const indexInParent = parent.children.findIndex((c) => c.id === this.groupId);
    if (indexInParent < 0) {
      return fail(`UngroupCommand: failed to locate group within parent`);
    }

    // Snapshot for undo BEFORE any mutation.
    this.parentId = parent.id;
    this.originalIndex = indexInParent;
    this.originalGroup = target;

    // Remove the group, then re-insert each child at the captured index
    // in order (each subsequent child goes to index + 1 to keep them
    // contiguous and ordered).
    let root = removeNode(doc.root, this.groupId);
    if (root === doc.root) {
      return fail(`UngroupCommand: failed to detach group "${this.groupId}"`);
    }
    const children: readonly SvgNode[] = (target as GroupNode).children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      try {
        root = insertNode(root, parent.id, child, indexInParent + i);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.parentId === null || this.originalGroup === null) {
      return fail('UngroupCommand undo: nothing captured (was execute called?)');
    }
    const doc = ctx.state.document();
    // Detach each child (they're currently siblings under parentId)
    let root = doc.root;
    for (const child of this.originalGroup.children) {
      const after = removeNode(root, child.id);
      if (after === root) {
        return fail(`UngroupCommand undo: child "${child.id}" not found`);
      }
      root = after;
    }
    // Re-create the group with original id + transform + style; reuse
    // the captured children array so byref-equality survives.
    const restored = createGroup(this.originalGroup.children, {
      id: this.originalGroup.id,
      transform: this.originalGroup.transform,
      style: this.originalGroup.style,
      metadata: this.originalGroup.metadata,
    });
    try {
      root = insertNode(root, this.parentId, restored, this.originalIndex);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }
}
