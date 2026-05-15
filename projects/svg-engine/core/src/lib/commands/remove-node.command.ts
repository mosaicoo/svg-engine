import type { SvgNode } from '../model/svg-node';
import { findNodeById, findParent, insertNode, removeNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Remove a node from the tree. To support undo, the command captures the
 * original node and its position (parent id + index) at execute time and
 * re-inserts it at the same location during undo.
 *
 * Removing the root group is rejected.
 */
export class RemoveNodeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  private capturedNode: SvgNode | null = null;
  private capturedParentId: NodeId | null = null;
  private capturedIndex: number | null = null;

  constructor(private readonly nodeId: NodeId) {
    this.label = `Remove node`;
  }

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    if (doc.root.id === this.nodeId) {
      return fail('RemoveNodeCommand: cannot remove the root group');
    }
    const target = findNodeById(doc.root, this.nodeId);
    if (target === null) {
      return fail(`RemoveNodeCommand: node "${this.nodeId}" not found`);
    }
    const parent = findParent(doc.root, this.nodeId);
    if (parent === null) {
      return fail(`RemoveNodeCommand: parent of "${this.nodeId}" not found`);
    }
    const index = parent.children.findIndex((c) => c.id === this.nodeId);
    this.capturedNode = target;
    this.capturedParentId = parent.id;
    this.capturedIndex = index;

    const nextRoot = removeNode(doc.root, this.nodeId);
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (
      this.capturedNode === null ||
      this.capturedParentId === null ||
      this.capturedIndex === null
    ) {
      return fail('RemoveNodeCommand undo: nothing was captured (was execute called?)');
    }
    const doc = ctx.state.document();
    let nextRoot;
    try {
      nextRoot = insertNode(doc.root, this.capturedParentId, this.capturedNode, this.capturedIndex);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    if (nextRoot === doc.root) {
      return fail(`RemoveNodeCommand undo: parent "${this.capturedParentId}" not found`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}
