import type { SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { multiply, translate, type Transform } from '../types/transform';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Translate a node by `(dx, dy)` by composing a translation onto its
 * current {@link SvgNode.transform}. Undo restores the original transform
 * captured at execute time.
 *
 * Translation is applied **after** the node's existing transform
 * (`newTransform = translate(dx, dy) * oldTransform`), matching how SVG
 * applies the rightmost matrix to local coordinates first.
 */
export class MoveNodeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Move node';

  private previousTransform: Transform | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly dx: number,
    private readonly dy: number,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const target = findNodeById(doc.root, this.nodeId);
    if (target === null) {
      return fail(`MoveNodeCommand: node "${this.nodeId}" not found`);
    }
    this.previousTransform = target.transform;
    const newTransform = multiply(translate(this.dx, this.dy), target.transform);
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, (n) => ({
      ...n,
      transform: newTransform,
    }));
    if (nextRoot === doc.root) {
      return fail(`MoveNodeCommand: failed to update node "${this.nodeId}"`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousTransform === null) {
      return fail('MoveNodeCommand undo: nothing captured (was execute called?)');
    }
    const previous = this.previousTransform;
    const doc = ctx.state.document();
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, (n) => ({
      ...n,
      transform: previous,
    }));
    if (nextRoot === doc.root) {
      return fail(`MoveNodeCommand undo: node "${this.nodeId}" not found`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}
