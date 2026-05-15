import type { SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import type { Point } from '../types/point';
import { multiply, rotate, translate, type Transform } from '../types/transform';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Rotate a node by `angleRad` around an arbitrary `pivot` (in document
 * coordinates). The new transform is composed as:
 *
 *   `newTransform = T(pivot) ⋅ R(θ) ⋅ T(-pivot) ⋅ existingTransform`
 *
 * This is the standard "rotate around point" composition: translate the
 * pivot to the origin, rotate, translate back. Pre-multiplying the
 * existing transform means the rotation is applied **after** any
 * existing transform — i.e., to the already-transformed shape.
 *
 * Undo restores the original transform captured at execute time.
 *
 * Pivot in document coordinates (the same coordinate system as
 * `EditorStateService.document().viewBox`). The caller is responsible
 * for converting screen / handle coordinates into document coordinates
 * (e.g., via `svg.getScreenCTM().inverse()`).
 */
export class RotateNodeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Rotate node';

  private previousTransform: Transform | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly angleRad: number,
    private readonly pivot: Point,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const target = findNodeById(doc.root, this.nodeId);
    if (target === null) {
      return fail(`RotateNodeCommand: node "${this.nodeId}" not found`);
    }
    this.previousTransform = target.transform;

    const newTransform = composePivotRotation(target.transform, this.angleRad, this.pivot);
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, (n) => ({
      ...n,
      transform: newTransform,
    }));
    if (nextRoot === doc.root) {
      return fail(`RotateNodeCommand: failed to update node "${this.nodeId}"`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousTransform === null) {
      return fail('RotateNodeCommand undo: nothing captured (was execute called?)');
    }
    const previous = this.previousTransform;
    const doc = ctx.state.document();
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, (n) => ({
      ...n,
      transform: previous,
    }));
    if (nextRoot === doc.root) {
      return fail(`RotateNodeCommand undo: node "${this.nodeId}" not found`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}

/**
 * Compose `T(pivot) ⋅ R(angleRad) ⋅ T(-pivot) ⋅ existingTransform`.
 * Exported separately so consumers can preview the resulting matrix
 * without going through the command bus (useful during interactive drag).
 */
export function composePivotRotation(
  existingTransform: Transform,
  angleRad: number,
  pivot: Point,
): Transform {
  const tNeg = translate(-pivot.x, -pivot.y);
  const r = rotate(angleRad);
  const tPos = translate(pivot.x, pivot.y);
  return multiply(multiply(multiply(tPos, r), tNeg), existingTransform);
}
