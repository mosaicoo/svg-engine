import type { SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Generic set-a-single-property command. The property must be a key of the
 * concrete node type — type-safety is preserved via the `K` parameter.
 *
 * Cannot change `id` or `type`; for type changes use a remove + insert
 * pair and let undo replay both.
 */
export class SetPropertyCommand<TNode extends SvgNode, K extends keyof TNode> implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  private previousValue: TNode[K] | undefined;
  private valueWasPresent = false;

  constructor(
    private readonly nodeId: NodeId,
    private readonly property: K,
    private readonly value: TNode[K],
  ) {
    if (property === 'id' || property === 'type') {
      throw new Error(`SetPropertyCommand: cannot mutate reserved property "${String(property)}"`);
    }
    this.label = `Set ${String(property)}`;
  }

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const target = findNodeById(doc.root, this.nodeId) as TNode | null;
    if (target === null) {
      return fail(`SetPropertyCommand: node "${this.nodeId}" not found`);
    }
    this.valueWasPresent = Object.prototype.hasOwnProperty.call(target, this.property);
    this.previousValue = target[this.property];

    const value = this.value;
    const property = this.property;
    const nextRoot = updateNode<TNode>(doc.root, this.nodeId, (n) => ({
      ...n,
      [property]: value,
    }));
    if (nextRoot === doc.root) {
      return fail(`SetPropertyCommand: failed to update node "${this.nodeId}"`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (!this.valueWasPresent && this.previousValue === undefined) {
      // Property did not exist before; restoring it to undefined keeps
      // shape stable (previousValue is undefined).
    }
    const doc = ctx.state.document();
    const previousValue = this.previousValue;
    const property = this.property;
    const nextRoot = updateNode<TNode>(doc.root, this.nodeId, (n) => ({
      ...n,
      [property]: previousValue,
    }));
    if (nextRoot === doc.root) {
      return fail(`SetPropertyCommand undo: node "${this.nodeId}" not found`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}
