import { type SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import type { Point } from '../types/point';
import { invert, multiply, type Transform } from '../types/transform';
import { type Command, type CommandContext, type CommandResult, ok } from './command';
import { composePivotSkew } from './skew-node.command';

/**
 * One node participating in a {@link SkewNodesCommand} batch. Carries the
 * node id plus the composed matrix of its ANCESTORS (excluding self) —
 * `null` for a node directly under the SVG root. The caller captures this
 * via `getRenderedParentMatrix(svgRoot, id)` so the shared doc-space skew
 * lands correctly even when nodes live inside different translated/rotated
 * groups. Same shape as `RotateNodesEntry` / `ResizeNodesEntry` — kept as a
 * distinct type so the batch commands stay independent.
 */
export interface SkewNodesEntry {
  readonly id: NodeId;
  readonly parentMatrix: Transform | null;
}

/** Identity matrix literal (avoids depending on a core constant export). */
const IDENTITY: Transform = [1, 0, 0, 1, 0, 0];

/**
 * **Group skew** — shear MULTIPLE nodes about a single shared `pivot`
 * (document coords) by the same `(skewXRad, skewYRad)` angles, as one
 * undoable step. Exact sibling of {@link RotateNodesCommand} /
 * `ResizeNodesCommand` — only the shared matrix differs (shear instead of
 * rotation / anchored scale).
 *
 * Build the doc-space pivot skew `M = T(pivot)·K·T(-pivot)` ONCE (via the
 * SAME `composePivotSkew` helper the single {@link SkewNodeCommand} uses,
 * so the group case can never drift from the single case), then for each
 * node set `newTransform = parentMatrix⁻¹ · M · parentMatrix · oldTransform`.
 * The conjugation re-expresses the doc-space skew in each node's PARENT
 * frame. For a top-level node (`parentMatrix === null`) this collapses to
 * `M · oldTransform`. Non-invertible parents fall back to the top-level form.
 *
 * **Atomicity** (mirrors the rotate/resize batches): captures each node's
 * previous transform keyed by id at execute time; undo restores all. Ids
 * absent from the tree are skipped (partial batch still applies).
 *
 * **No-op** when `entries` is empty.
 */
export class SkewNodesCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  private readonly previous = new Map<NodeId, Transform>();

  constructor(
    private readonly entries: readonly SkewNodesEntry[],
    private readonly pivot: Point,
    private readonly skewXRad: number,
    private readonly skewYRad: number,
  ) {
    this.label = `Skew ${this.entries.length} nodes`;
  }

  execute(ctx: CommandContext): CommandResult {
    if (this.entries.length === 0) return ok();
    const doc = ctx.state.document();
    // Doc-space pivot skew, built once: M = T(pivot)·K·T(-pivot).
    const m = composePivotSkew(IDENTITY, this.skewXRad, this.skewYRad, this.pivot);
    let root = doc.root;
    this.previous.clear();
    for (const entry of this.entries) {
      const node = findNodeById(root, entry.id);
      if (node === null) continue; // skip missing — partial batch still applies
      const prev = node.transform;
      this.previous.set(entry.id, prev);
      const next = applyGroupSkew(m, prev, entry.parentMatrix);
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
 * Apply the shared doc-space pivot-skew matrix `m` to a node whose own
 * transform `prev` lives in its parent frame. Conjugates by `parentMatrix`
 * so the skew acts in document space; collapses to `m · prev` for top-level
 * nodes and on non-invertible parents. Identical structure to the
 * rotate/resize batch helpers — only the matrix `m` differs.
 */
function applyGroupSkew(m: Transform, prev: Transform, parentMatrix: Transform | null): Transform {
  if (parentMatrix === null) return multiply(m, prev);
  try {
    const inv = invert(parentMatrix);
    return multiply(inv, multiply(m, multiply(parentMatrix, prev)));
  } catch {
    return multiply(m, prev);
  }
}
