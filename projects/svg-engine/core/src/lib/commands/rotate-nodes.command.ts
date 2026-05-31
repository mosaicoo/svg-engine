import { type SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import type { Point } from '../types/point';
import { invert, multiply, type Transform } from '../types/transform';
import { type Command, type CommandContext, type CommandResult, ok } from './command';
import { composePivotRotation } from './rotate-node.command';

/**
 * One node participating in a {@link RotateNodesCommand} batch. Carries
 * the node id plus the composed matrix of its ANCESTORS (excluding self)
 * — `null` for a node directly under the SVG root. The caller (the
 * selection overlay, which has the SVG element) captures this via
 * `getRenderedParentMatrix(svgRoot, id)` so the shared doc-space rotation
 * lands correctly even when nodes live inside different translated/
 * rotated groups.
 *
 * Same shape as `ResizeNodesEntry` — kept as a distinct type so the two
 * batch commands stay independent.
 */
export interface RotateNodesEntry {
  readonly id: NodeId;
  readonly parentMatrix: Transform | null;
}

/** Identity matrix literal (avoids depending on a core constant export). */
const IDENTITY: Transform = [1, 0, 0, 1, 0, 0];

/**
 * **Group rotation** — rotate MULTIPLE nodes about a single shared
 * `pivot` (document coords) by the same `angleRad`, as one undoable step.
 *
 * Powers multi-selection rotation: dragging the rotation handle rotates
 * the whole selection rigidly about the combined-bbox centre — the same
 * way a single GROUP rotates about its own centre (Illustrator/Figma/
 * Affinity convention). The visual result is indistinguishable from
 * grouping the shapes, rotating the group, then ungrouping.
 *
 * **Matrix approach — exact sibling of `ResizeNodesCommand`**: build the
 * doc-space pivot rotation `M = T(pivot)·R(θ)·T(-pivot)` ONCE (via the
 * SAME `composePivotRotation` helper the single {@link RotateNodeCommand}
 * uses, so the math is identical and the group case can never drift from
 * the single case), then for each node set
 * `newTransform = parentMatrix⁻¹ · M · parentMatrix · oldTransform`. The
 * conjugation by `parentMatrix` re-expresses the doc-space rotation in the
 * node's PARENT frame (where its transform lives). For a top-level node
 * (`parentMatrix === null`) this collapses to `M · oldTransform` —
 * identical to what `RotateNodeCommand` would produce for that node.
 * Non-invertible parents fall back to the top-level form.
 *
 * **Atomicity** (mirrors `ResizeNodesCommand` / `TranslateManyCommand`):
 * captures each node's previous transform keyed by id at execute time;
 * undo restores all. Ids absent from the tree are skipped (partial batch
 * still applies).
 *
 * **No-op** when `entries` is empty.
 */
export class RotateNodesCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  private readonly previous = new Map<NodeId, Transform>();

  constructor(
    private readonly entries: readonly RotateNodesEntry[],
    private readonly pivot: Point,
    private readonly angleRad: number,
  ) {
    this.label = `Rotate ${this.entries.length} nodes`;
  }

  execute(ctx: CommandContext): CommandResult {
    if (this.entries.length === 0) return ok();
    const doc = ctx.state.document();
    // Doc-space pivot rotation, built once: M = T(pivot)·R(θ)·T(-pivot).
    const m = composePivotRotation(IDENTITY, this.angleRad, this.pivot);
    let root = doc.root;
    this.previous.clear();
    for (const entry of this.entries) {
      const node = findNodeById(root, entry.id);
      if (node === null) continue; // skip missing — partial batch still applies
      const prev = node.transform;
      this.previous.set(entry.id, prev);
      const next = applyGroupRotation(m, prev, entry.parentMatrix);
      root = updateNode<SvgNode>(root, entry.id, (n) => ({ ...n, transform: next }));
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    let root = doc.root;
    for (const [id, prev] of this.previous) {
      root = updateNode<SvgNode>(root, id, (n) => ({ ...n, transform: prev }));
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }
}

/**
 * Apply the shared doc-space pivot-rotation matrix `m` to a node whose
 * own transform `prev` lives in its parent frame. Conjugates by
 * `parentMatrix` so the rotation acts in document space; collapses to
 * `m · prev` for top-level nodes and on non-invertible parents.
 *
 * Identical structure to `ResizeNodesCommand`'s helper — the only
 * difference is the matrix `m` passed in (rotation vs. anchored scale).
 */
function applyGroupRotation(
  m: Transform,
  prev: Transform,
  parentMatrix: Transform | null,
): Transform {
  if (parentMatrix === null) return multiply(m, prev);
  try {
    const inv = invert(parentMatrix);
    return multiply(inv, multiply(m, multiply(parentMatrix, prev)));
  } catch {
    return multiply(m, prev);
  }
}
