import type { GroupNode } from '../model/group-node';
import { isLayer } from '../model/layer';
import { isPage } from '../model/page';
import { isGroupNode, type SvgNode } from '../model/svg-node';
import { findNodeById, findParent, insertNode, removeNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Move a node to a new position in the tree — same parent (reorder) OR
 * different parent (reparent). Atomic with single undo entry. Powers
 * drag-drop reorder in the layers panel (Bloco 4b-DnD).
 *
 * **Semantics**
 *
 * - `nodeId`: node to move (cannot be the document root)
 * - `newParentId`: target group's id (same OR different from current parent)
 * - `newIndex`: index inside `newParentId.children` AFTER the move (so
 *   target indices are computed against the FINAL state of the array)
 *
 * **Validations** (all return `fail`, no mutation):
 *
 * - `nodeId` doesn't exist or is the root
 * - `newParentId` doesn't exist or isn't a group
 * - `newParentId` is `nodeId` itself (can't be its own parent)
 * - `newParentId` is a DESCENDANT of `nodeId` (would create a cycle)
 *
 * **No-op** when source position equals target (same parent, same index
 * adjusted for self-removal): returns `ok` without mutating state.
 *
 * **Undo**: restores the node to its original parent + index. Captures
 * snapshot at execute time pre-mutation.
 *
 * **Why a single command (not Remove + Insert)**: keeps the undo stack
 * at exactly ONE entry per drag — Figma/Affinity convention. Also lets
 * us validate cycle detection BEFORE any state change.
 */
export class MoveNodeInTreeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Move in tree';

  private originalParentId: NodeId | null = null;
  private originalIndex = -1;
  private nodeRef: SvgNode | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly newParentId: NodeId,
    private readonly newIndex: number,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();

    // 1) Node must exist and not be the root.
    if (this.nodeId === doc.root.id) {
      return fail('MoveNodeInTreeCommand: cannot move the document root');
    }
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) {
      return fail(`MoveNodeInTreeCommand: node "${this.nodeId}" not found`);
    }

    // 2) Target parent must exist and be a group.
    const targetParent = findNodeById(doc.root, this.newParentId);
    if (targetParent === null) {
      return fail(`MoveNodeInTreeCommand: new parent "${this.newParentId}" not found`);
    }
    if (!isGroupNode(targetParent)) {
      return fail(`MoveNodeInTreeCommand: new parent "${this.newParentId}" is not a group`);
    }

    // 2b) Top-level invariant: Layers and Pages are organizational
    // containers and can only live in a "layer container" — a layer at the
    // document root OR inside a page (D-079); a page only at the document
    // root. They must NEVER be moved into a group. The layers-panel
    // drag-drop already blocks this in the UI; this is the last line of
    // defense for any other caller (matches MakeLayerCommand's guard).
    if (isPage(node) && this.newParentId !== doc.root.id) {
      return fail(`MoveNodeInTreeCommand: a page can only live at the document root`);
    }
    if (isLayer(node)) {
      const intoContainer = this.newParentId === doc.root.id || isPage(targetParent);
      if (!intoContainer) {
        return fail(
          `MoveNodeInTreeCommand: a layer can only live at the document root or inside a page (not "${this.newParentId}")`,
        );
      }
    }

    // 3) Cycle detection: target parent cannot BE the node, nor be a
    // descendant of the node.
    if (this.newParentId === this.nodeId) {
      return fail('MoveNodeInTreeCommand: cannot move a node into itself');
    }
    if (isGroupNode(node) && isDescendantOf(node, this.newParentId)) {
      return fail(
        `MoveNodeInTreeCommand: cannot move "${this.nodeId}" into its own descendant "${this.newParentId}" (cycle)`,
      );
    }

    // 4) Capture origin for undo + compute target index against current state.
    const currentParent = findParent(doc.root, this.nodeId);
    if (currentParent === null) {
      return fail(`MoveNodeInTreeCommand: node "${this.nodeId}" has no parent`);
    }
    const currentIndex = currentParent.children.findIndex((c) => c.id === this.nodeId);
    if (currentIndex < 0) {
      return fail('MoveNodeInTreeCommand: failed to locate node in current parent');
    }

    // Semantic of `newIndex`: the POSITION THE NODE SHOULD END UP AT in
    // the final (post-move) `newParent.children` array. With this
    // semantic, "remove then insert at newIndex" is correct in BOTH
    // same-parent AND different-parent cases — no -1 fudging needed.
    //
    // Same-parent: final length = original length (one removed, one
    //   inserted). Valid range: [0, length - 1].
    // Different-parent: target gains 1 child. Valid range: [0, length].
    const sameParent = currentParent.id === this.newParentId;
    const targetChildren = (targetParent as GroupNode).children;
    const targetMax = sameParent ? targetChildren.length - 1 : targetChildren.length;
    const clampedIndex = Math.max(0, Math.min(targetMax, this.newIndex));

    // No-op detection: same parent + target index equals current index.
    if (sameParent && clampedIndex === currentIndex) {
      this.originalParentId = currentParent.id;
      this.originalIndex = currentIndex;
      this.nodeRef = node;
      return ok();
    }

    // Snapshot for undo BEFORE mutation.
    this.originalParentId = currentParent.id;
    this.originalIndex = currentIndex;
    this.nodeRef = node;

    // Apply: remove then insert at the final-target index.
    let root = removeNode(doc.root, this.nodeId);
    if (root === doc.root) {
      return fail('MoveNodeInTreeCommand: failed to detach node');
    }
    try {
      root = insertNode(root, this.newParentId, node, clampedIndex);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.originalParentId === null || this.nodeRef === null) {
      return fail('MoveNodeInTreeCommand undo: nothing captured');
    }
    const doc = ctx.state.document();
    // Remove from current position
    let root = removeNode(doc.root, this.nodeId);
    if (root === doc.root) {
      return fail(`MoveNodeInTreeCommand undo: node "${this.nodeId}" not found`);
    }
    // Re-insert at original parent + original index
    try {
      root = insertNode(root, this.originalParentId, this.nodeRef, this.originalIndex);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }
}

/**
 * True when `candidateId` lives anywhere inside `group`'s sub-tree
 * (including the group itself). Used for cycle detection.
 */
function isDescendantOf(group: SvgNode, candidateId: NodeId): boolean {
  if (!isGroupNode(group)) return false;
  for (const child of (group as GroupNode).children) {
    if (child.id === candidateId) return true;
    if (isGroupNode(child) && isDescendantOf(child, candidateId)) return true;
  }
  return false;
}
