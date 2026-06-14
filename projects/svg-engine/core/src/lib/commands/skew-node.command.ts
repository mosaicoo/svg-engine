import type { SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import type { Point } from '../types/point';
import { multiply, skewX, skewY, translate, type Transform } from '../types/transform';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Skew (shear) a node by `skewXRad` / `skewYRad` around an arbitrary
 * `pivot` (in document coordinates). The new transform is composed as:
 *
 *   `newTransform = T(pivot) ⋅ K ⋅ T(-pivot) ⋅ existingTransform`
 *
 * where `K = skewX(skewXRad) ⋅ skewY(skewYRad)` is the combined shear.
 * This is the exact sibling of {@link RotateNodeCommand} — only the
 * middle factor differs (shear instead of rotation), so "skew around a
 * point" keeps the pivot stationary the same way rotation does.
 *
 * Skewing one axis at a time (the common case) leaves the matrix clean:
 * with `skewYRad = 0`, `K` collapses to a pure `skewX`; with
 * `skewXRad = 0`, to a pure `skewY`. Setting both composes them.
 *
 * Undo restores the original transform captured at execute time.
 *
 * Pivot in document coordinates (same system as
 * `EditorStateService.document().viewBox`). The caller converts screen /
 * handle coordinates into document coordinates.
 */
export class SkewNodeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Skew node';

  private previousTransform: Transform | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly skewXRad: number,
    private readonly skewYRad: number,
    private readonly pivot: Point,
  ) {
    if (!Number.isFinite(skewXRad) || !Number.isFinite(skewYRad)) {
      throw new RangeError(
        `SkewNodeCommand: skew angles must be finite (got x=${skewXRad}, y=${skewYRad})`,
      );
    }
  }

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const target = findNodeById(doc.root, this.nodeId);
    if (target === null) {
      return fail(`SkewNodeCommand: node "${this.nodeId}" not found`);
    }
    this.previousTransform = target.transform;

    const newTransform = composePivotSkew(
      target.transform,
      this.skewXRad,
      this.skewYRad,
      this.pivot,
    );
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, (n) => ({
      ...n,
      transform: newTransform,
    }));
    if (nextRoot === doc.root) {
      return fail(`SkewNodeCommand: failed to update node "${this.nodeId}"`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousTransform === null) {
      return fail('SkewNodeCommand undo: nothing captured (was execute called?)');
    }
    const previous = this.previousTransform;
    const doc = ctx.state.document();
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, (n) => ({
      ...n,
      transform: previous,
    }));
    if (nextRoot === doc.root) {
      return fail(`SkewNodeCommand undo: node "${this.nodeId}" not found`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}

/**
 * Compose `T(pivot) ⋅ skewX(skewXRad) ⋅ skewY(skewYRad) ⋅ T(-pivot) ⋅ existingTransform`.
 * Exported separately so consumers (and {@link SkewNodesCommand}) can
 * build the resulting matrix without going through the command bus —
 * mirrors `composePivotRotation` exactly.
 */
export function composePivotSkew(
  existingTransform: Transform,
  skewXRad: number,
  skewYRad: number,
  pivot: Point,
): Transform {
  const tNeg = translate(-pivot.x, -pivot.y);
  const k = multiply(skewX(skewXRad), skewY(skewYRad));
  const tPos = translate(pivot.x, pivot.y);
  return multiply(multiply(multiply(tPos, k), tNeg), existingTransform);
}
