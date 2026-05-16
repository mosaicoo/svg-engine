import { bakeScaleIntoNode } from '../geometry/scale-bake';
import type { SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import type { Point } from '../types/point';
import { multiply, scale, translate, type Transform } from '../types/transform';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Resize a node by `(sx, sy)` around an arbitrary fixed `anchor` (in
 * document coordinates). The anchor is the **opposite** handle of the
 * one being dragged — e.g., dragging the top-right handle resizes with
 * the bottom-left fixed (Figma / Illustrator default behaviour).
 *
 * ## Two execution paths (Bloco 4-Resize-Proper)
 *
 * The command picks one of two strategies based on the target node's
 * current `transform`:
 *
 * 1. **Geometry bake** (preferred) — when `transform` is identity or a
 *    pure translation, `bakeScaleIntoNode` rewrites the node's native
 *    geometry fields (rect's `width`/`height`/`x`/`y`, ellipse's
 *    `cx`/`cy`/`rx`/`ry`, path's `d`, etc.) so the visual result is
 *    achieved without composing a scale matrix. **This is the market-
 *    standard behavior** — stroke width stays declared, inspector
 *    reflects truth, corner radii preserve shape.
 *
 * 2. **Scale-transform composition** (fallback) — when the node has a
 *    rotation in its transform, baking a document-space scale into
 *    native geometry would produce a non-axis-aligned result that
 *    can't be expressed by the node type's fields (rotated rect ≠
 *    rect). In that case the legacy composition runs:
 *      `newTransform = T(anchor) · S(sx, sy) · T(-anchor) · existing`
 *    Stroke distortion is mitigated by `vector-effect="non-scaling-stroke"`
 *    applied globally in the renderer directives — the practical effect
 *    is identical to the bake path for the most-noticed property (stroke
 *    width), with the caveat that the inspector still shows pre-scale
 *    geometry. Documented limitation; future "convert to path" capability
 *    would let users bake rotated shapes too.
 *
 * ## Undo
 *
 * Captures the **full previous node** (geometry + transform) on
 * execute, restores it on undo. This works for both paths: bake
 * mutates fields, fallback mutates transform, undo replays the snapshot.
 */
export class ResizeNodeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Resize node';

  private previousNode: SvgNode | null = null;

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
    this.previousNode = target;

    // Try the bake path first. Returns null for rotated/skewed nodes —
    // fall back to scale-transform composition (legacy behavior).
    const baked = bakeScaleIntoNode(target, this.sx, this.sy, this.anchor);
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, () => {
      if (baked !== null) return baked;
      // Fallback path: compose scale matrix; geometry unchanged.
      return {
        ...target,
        transform: composeAnchoredScale(target.transform, this.sx, this.sy, this.anchor),
      };
    });
    if (nextRoot === doc.root) {
      return fail(`ResizeNodeCommand: failed to update node "${this.nodeId}"`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousNode === null) {
      return fail('ResizeNodeCommand undo: nothing captured (was execute called?)');
    }
    const previous = this.previousNode;
    const doc = ctx.state.document();
    const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, () => previous);
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
 *
 * **Note**: this is the **legacy resize math**, kept exported because:
 * 1. `TransformService.updateResize` uses it for **preview** (cheap,
 *    no parse per frame). The commit path (`endResize` → `ResizeNodeCommand`)
 *    swaps to the proper geometry bake.
 * 2. The {@link ResizeNodeCommand} itself falls back to it for rotated
 *    nodes that can't be baked.
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
