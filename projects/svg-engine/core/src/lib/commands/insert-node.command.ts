import type { SvgNode } from '../model/svg-node';
import { insertNode, removeNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Insert `node` as a child of the group identified by `parentId`. The
 * undo step removes the inserted node by its id, restoring referential
 * equality on the path that was affected by the insertion.
 */
export class InsertNodeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  constructor(
    private readonly parentId: NodeId,
    private readonly node: SvgNode,
    private readonly index?: number,
  ) {
    this.label = `Insert ${node.type}`;
  }

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    let nextRoot;
    try {
      nextRoot = insertNode(doc.root, this.parentId, this.node, this.index);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    if (nextRoot === doc.root) {
      return fail(`InsertNodeCommand: parent group "${this.parentId}" not found`);
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
