import { type SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import type { Point } from '../types/point';
import { invert, multiply, type Transform } from '../types/transform';
import { type Command, type CommandContext, type CommandResult, ok } from './command';
import { composeAnchoredScale } from './resize-node.command';

/**
 * One node participating in a {@link ResizeNodesCommand} batch. Carries
 * the node id plus the composed matrix of its ANCESTORS (excluding self)
 * — `null` for a node directly under the SVG root. The caller (the
 * selection overlay, which has the SVG element) captures this via
 * `getRenderedParentMatrix(svgRoot, id)` so the shared doc-space scale
 * lands correctly even when nodes live inside different translated/
 * rotated groups.
 */
export interface ResizeNodesEntry {
  readonly id: NodeId;
  readonly parentMatrix: Transform | null;
}

/** Identity matrix literal (avoids depending on a core constant export). */
const IDENTITY: Transform = [1, 0, 0, 1, 0, 0];

/**
 * **Group resize** — scale MULTIPLE nodes about a single shared `anchor`
 * (document coords) by the same `(sx, sy)` factors, as one undoable step.
 *
 * Powers the multi-selection resize handles (drag any handle on the
 * combined bounding box → the whole selection scales as a unit about the
 * opposite corner — Illustrator/Figma/Affinity/Inkscape convention).
 *
 * **Matrix approach (not geometry bake)**: build the doc-space anchored
 * scale `M = T(anchor)·S(sx,sy)·T(-anchor)` once, then for each node set
 * `newTransform = parentMatrix⁻¹ · M · parentMatrix · oldTransform`. The
 * conjugation by `parentMatrix` re-expresses the doc-space scale in the
 * node's PARENT frame (where its transform lives), so a shared doc-space
 * scale about a shared doc-space anchor scales the selection as a rigid
 * group regardless of which group each node sits in. For a top-level node
 * (`parentMatrix === null`) this collapses to `M · oldTransform`
 * (identical to {@link composeAnchoredScale}). Non-invertible parents
 * fall back to the top-level form.
 *
 * Stroke width is preserved visually because the renderer marks geometry
 * `vector-effect: non-scaling-stroke`. This deliberately does NOT bake
 * width/height into node geometry (unlike single-node
 * {@link ResizeNodeCommand}'s inspector-friendly bake) — for a
 * multi-selection the inspector shows the multi-edit panel, not per-node
 * geometry, so the cheaper always-correct matrix path is the right trade.
 *
 * **Atomicity** (mirrors `TranslateManyCommand`): captures each node's
 * previous transform keyed by id at execute time; undo restores all. Ids
 * absent from the tree are skipped (partial batch still applies).
 *
 * **No-op** when `entries` is empty.
 */
export class ResizeNodesCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  private readonly previous = new Map<NodeId, Transform>();

  constructor(
    private readonly entries: readonly ResizeNodesEntry[],
    private readonly anchor: Point,
    private readonly sx: number,
    private readonly sy: number,
  ) {
    this.label = `Resize ${this.entries.length} nodes`;
  }

  execute(ctx: CommandContext): CommandResult {
    if (this.entries.length === 0) return ok();
    const doc = ctx.state.document();
    // Doc-space anchored scale, built once: M = T(anchor)·S·T(-anchor).
    const m = composeAnchoredScale(IDENTITY, this.sx, this.sy, this.anchor);
    let root = doc.root;
    this.previous.clear();
    for (const entry of this.entries) {
      const node = findNodeById(root, entry.id);
      if (node === null) continue; // skip missing — partial batch still applies
      const prev = node.transform;
      this.previous.set(entry.id, prev);
      const next = applyGroupScale(m, prev, entry.parentMatrix);
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
 * Apply the shared doc-space anchored-scale matrix `m` to a node whose
 * own transform `prev` lives in its parent frame. Conjugates by
 * `parentMatrix` so the scale acts in document space; collapses to
 * `m · prev` for top-level nodes and on non-invertible parents.
 */
function applyGroupScale(m: Transform, prev: Transform, parentMatrix: Transform | null): Transform {
  if (parentMatrix === null) return multiply(m, prev);
  try {
    const inv = invert(parentMatrix);
    return multiply(inv, multiply(m, multiply(parentMatrix, prev)));
  } catch {
    return multiply(m, prev);
  }
}
