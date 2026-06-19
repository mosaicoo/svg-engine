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
    /**
     * Composed transform of the node's ANCESTORS (not including the
     * node itself). When the node lives inside one or more groups
     * carrying transforms, this matrix maps the node's parent-local
     * frame → document space. Passed to `bakeScaleIntoNode` so the
     * doc-space `anchor` is translated into the parent frame before
     * being applied to the node's geometry — otherwise resize of a
     * shape inside a moved group "drifts" (becomes a translate).
     *
     * `null` (default) ≡ no ancestor transforms / node lives at the
     * document root. Backward compatible.
     */
    private readonly parentMatrix: Transform | null = null,
    /**
     * **D-141 — OBB resize.** When `true`, `anchor` is interpreted in the
     * node's **own LOCAL geometry frame** (NOT document space), and the
     * resize is applied by composing the anchored scale onto the RIGHT of
     * the node's existing transform — `T' = T · T(a)·S(sx,sy)·T(-a)` — so a
     * **rotated** node scales along ITS OWN axes and keeps the rotation.
     * Geometry fields are left untouched (the scale rides in the transform,
     * stroke stays declared via the renderer's non-scaling-stroke). Used by
     * the oriented selection overlay; `parentMatrix` is ignored in this
     * mode (the caller already projected the anchor into the local frame).
     *
     * `false` (default) keeps the document-space geometry-bake / legacy
     * behaviour for axis-aligned (non-rotated) selections — unchanged.
     */
    private readonly localFrame = false,
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

    // **D-141** — OBB (local-frame) resize: scale along the node's own
    // axes by composing the anchored scale onto the RIGHT of its
    // transform. Keeps geometry + rotation; bypasses the doc-space bake.
    if (this.localFrame) {
      const nextRoot = updateNode<SvgNode>(doc.root, this.nodeId, () => ({
        ...target,
        transform: multiply(
          target.transform,
          composeAnchoredScale(translate(0, 0), this.sx, this.sy, this.anchor),
        ),
      }));
      if (nextRoot === doc.root) {
        return fail(`ResizeNodeCommand: failed to update node "${this.nodeId}"`);
      }
      ctx.state.setDocument({ ...doc, root: nextRoot });
      return ok();
    }

    // Try the bake path first. Returns null for rotated/skewed nodes
    // OR rotated ancestor matrices — fall back to scale-transform
    // composition (legacy behavior).
    const baked = bakeScaleIntoNode(target, this.sx, this.sy, this.anchor, this.parentMatrix);
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
