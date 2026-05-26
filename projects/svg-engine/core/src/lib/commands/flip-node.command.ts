import type { SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import type { Point } from '../types/point';
import { multiply, scale, translate, type Transform } from '../types/transform';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * **D-078** — flip a node horizontally or vertically around an
 * arbitrary `pivot` (in document coordinates).
 *
 * Composes:
 *
 *   `newTransform = T(pivot) ⋅ S(flip) ⋅ T(-pivot) ⋅ existingTransform`
 *
 * where `S(flip)` is:
 *
 * - `'horizontal'` → `scale(-1, 1)` (mirror left↔right across vertical axis through pivot)
 * - `'vertical'`   → `scale(1, -1)` (mirror top↔bottom across horizontal axis through pivot)
 *
 * Symmetric semantics with {@link RotateNodeCommand}: the flip is
 * applied **after** any existing transform, then the pivot translation
 * sandwiches it so the shape mirrors in place around the pivot point.
 * Photoshop "Flip Horizontal" / Illustrator "Reflect" follow the same
 * pivot-in-place convention.
 *
 * **Why not a `transform.scale = -1` on the node directly**: that
 * would mirror around the local origin (0,0), which is rarely the
 * intuitive pivot. Pivoting around the node's bbox centre (the
 * default used by the Inspector) makes the flip happen "around the
 * shape" — the user expectation.
 *
 * Undo restores the original transform captured at execute time.
 *
 * **Multi-selection**: dispatch one command per id (the bus's
 * single-undo grouping is the consumer's responsibility — same
 * convention as RotateNodeCommand).
 */
export type FlipAxis = 'horizontal' | 'vertical';

export class FlipNodeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Flip node';

  private previousTransform: Transform | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly axis: FlipAxis,
    private readonly pivot: Point,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const target = findNodeById(doc.root, this.nodeId);
    if (target === null) {
      return fail(`FlipNodeCommand: node "${this.nodeId}" not found`);
    }
    this.previousTransform = target.transform;

    const newTransform = composePivotFlip(target.transform, this.axis, this.pivot);
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, (n) => ({
      ...n,
      transform: newTransform,
    }));
    if (nextRoot === doc.root) {
      return fail(`FlipNodeCommand: failed to update node "${this.nodeId}"`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousTransform === null) {
      return fail('FlipNodeCommand undo: nothing captured (was execute called?)');
    }
    const previous = this.previousTransform;
    const doc = ctx.state.document();
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, (n) => ({
      ...n,
      transform: previous,
    }));
    if (nextRoot === doc.root) {
      return fail(`FlipNodeCommand undo: node "${this.nodeId}" not found`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}

/**
 * Compose `T(pivot) ⋅ S(flip) ⋅ T(-pivot) ⋅ existingTransform`.
 * Exported so consumers can preview the resulting matrix without
 * going through the bus (useful for interactive previews — though
 * Flip is typically a one-click operation, the symmetry with
 * {@link composePivotRotation} keeps the API consistent).
 */
export function composePivotFlip(
  existingTransform: Transform,
  axis: FlipAxis,
  pivot: Point,
): Transform {
  const tNeg = translate(-pivot.x, -pivot.y);
  const s = axis === 'horizontal' ? scale(-1, 1) : scale(1, -1);
  const tPos = translate(pivot.x, pivot.y);
  return multiply(multiply(multiply(tPos, s), tNeg), existingTransform);
}
