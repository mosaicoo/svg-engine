import { type SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import type { Point } from '../types/point';
import type { Transform } from '../types/transform';
import { type Command, type CommandContext, type CommandResult, ok } from './command';
import { composeAnchoredScale } from './resize-node.command';

/**
 * One node participating in a {@link ResizeNodesCommand} batch. Carries
 * the node id plus the composed matrix of its ANCESTORS (excluding self)
 * — `null` for a node directly under the SVG root. The caller (the
 * selection overlay, which has the SVG element) captures this via
 * `getRenderedParentMatrix(svgRoot, id)` so the anchored scale lands in
 * each node's own parent-local frame even when nodes live inside
 * different translated/rotated groups.
 */
export interface ResizeNodesEntry {
  readonly id: NodeId;
  readonly parentMatrix: Transform | null;
}

/**
 * **Group resize** — scale MULTIPLE nodes about a single shared `anchor`
 * (document coords) by the same `(sx, sy)` factors, as one undoable step.
 *
 * Powers the multi-selection resize handles (drag any handle on the
 * combined bounding box → the whole selection scales as a unit about the
 * opposite corner — Illustrator/Figma/Affinity/Inkscape convention).
 *
 * **Matrix approach (not geometry bake)**: each node gets
 * `composeAnchoredScale(node.transform, sx, sy, anchor, parentMatrix)` —
 * the SAME doc-space anchored scale, mapped into each node's parent frame.
 * Applying one shared scale-about-anchor matrix to every node's transform
 * scales the selection as a rigid group. Stroke width is preserved
 * visually because the renderer marks geometry `vector-effect:
 * non-scaling-stroke`. This deliberately does NOT bake width/height into
 * the node geometry (unlike single-node {@link ResizeNodeCommand}'s
 * inspector-friendly bake) — for a multi-selection the inspector shows
 * the multi-edit panel, not per-node geometry, so the cheaper, always-
 * correct matrix path is the right trade-off.
 *
 * **Atomicity** (mirrors `TranslateManyCommand`): captures each node's
 * previous transform keyed by id at execute time; undo restores all.
 * Ids absent from the tree are skipped (partial batch still applies) —
 * the same defensive contract the other on-many commands use.
 *
 * **No-op** when `entries` is empty OR both scale factors are ~1.
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
    let root = doc.root;
    this.previous.clear();
    for (const entry of this.entries) {
      const node = findNodeById(root, entry.id);
      if (node === null) continue; // skip missing — partial batch still applies
      const prev = node.transform;
      this.previous.set(entry.id, prev);
      const next = composeAnchoredScale(prev, this.sx, this.sy, this.anchor, entry.parentMatrix);
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
