import type { SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import type { Point } from '../types/point';
import { multiply, scale, translate, type Transform } from '../types/transform';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Scale a node by `(sx, sy)` around an arbitrary fixed `anchor` (in
 * document coordinates). The anchor is the **opposite** handle of the
 * one being dragged — e.g., dragging the top-right handle resizes with
 * the bottom-left fixed (Figma / Illustrator default behaviour).
 *
 * The new transform is composed as:
 *
 *   `newTransform = T(anchor) ⋅ S(sx, sy) ⋅ T(-anchor) ⋅ existingTransform`
 *
 * Per the Fase 3 scope (D-022), resize **does not** use the editable
 * rotation pivot — only the opposite handle. Pivot-affecting-scale is
 * tracked as the future D-022b decision (Affinity-complete behaviour).
 *
 * Undo restores the original transform captured at execute time.
 */
export class ResizeNodeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Resize node';

  private previousTransform: Transform | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly anchor: Point,
    private readonly sx: number,
    private readonly sy: number,
  ) {
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) {
      throw new RangeError(
        `ResizeNodeCommand: scale factors must be finite (got sx=${sx}, sy=${sy})`,
      );
    }
  }

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const target = findNodeById(doc.root, this.nodeId);
    if (target === null) {
      return fail(`ResizeNodeCommand: node "${this.nodeId}" not found`);
    }
    this.previousTransform = target.transform;

    const newTransform = composeAnchoredScale(target.transform, this.sx, this.sy, this.anchor);
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, (n) => ({
      ...n,
      transform: newTransform,
    }));
    if (nextRoot === doc.root) {
      return fail(`ResizeNodeCommand: failed to update node "${this.nodeId}"`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousTransform === null) {
      return fail('ResizeNodeCommand undo: nothing captured (was execute called?)');
    }
    const previous = this.previousTransform;
    const doc = ctx.state.document();
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, (n) => ({
      ...n,
      transform: previous,
    }));
    if (nextRoot === doc.root) {
      return fail(`ResizeNodeCommand undo: node "${this.nodeId}" not found`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}

/**
 * Compose `T(anchor) ⋅ S(sx, sy) ⋅ T(-anchor) ⋅ existingTransform`.
 * Exported for interactive previews (during drag) that want the same
 * matrix without dispatching through the command bus.
 */
export function composeAnchoredScale(
  existingTransform: Transform,
  sx: number,
  sy: number,
  anchor: Point,
): Transform {
  const tNeg = translate(-anchor.x, -anchor.y);
  const s = scale(sx, sy);
  const tPos = translate(anchor.x, anchor.y);
  return multiply(multiply(multiply(tPos, s), tNeg), existingTransform);
}
