import {
  type AnchorPoint,
  type AnchorSubpath,
  anchorsToPathD,
  parsePathToAnchors,
} from '../geometry/path-anchors';
import { createPath } from '../model/node-factory';
import type { PathNode } from '../model/path-node';
import type { SvgNode } from '../model/svg-node';
import { findNodeById, findParent, insertNode, removeNode } from '../tree/tree-ops';
import type { Point } from '../types/point';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';
import { nodeToPathD } from './convert-to-path.command';

/**
 * **KNIFE-FIX** — real path cut. Replaces the original node with the
 * pieces produced by slicing it at `docPoint`. Behaviour by case:
 *
 * - **Open subpath cut**: produces 2 new open `PathNode`s, replacing
 *   the original at the same parent index. The "left" path keeps the
 *   anchors before the cut + any OTHER subpaths the original had; the
 *   "right" path holds only the anchors after the cut. Both inherit
 *   the original's `style`, `transform`, `metadata`.
 * - **Closed subpath cut**: produces 1 open path that traverses
 *   `cut → next → ... → end → start → ... → previous → cut`. The
 *   path becomes open — single replacement, no z-order shuffle.
 * - **Non-path source** (rect/ellipse/line/polygon/polyline):
 *   synthesises the `d` via {@link nodeToPathD} and operates on it,
 *   so the user doesn't have to Convert-to-Path first. The original
 *   shape is replaced atomically with the cut pieces — single undo.
 *
 * **Snap-to-nodes**: when `snapToNodes` is true and the click lands
 * within `tolerance / 2` of an existing anchor, the cut happens AT
 * that anchor (no new anchor inserted). Mirrors Illustrator's
 * "snap to anchor" behaviour and avoids creating two nearly-overlapping
 * anchors on the open ends.
 *
 * **Tolerance**: hit accepted only when the perpendicular distance
 * from the click to the nearest segment is within `tolerance` doc
 * units. Failing the tolerance returns `fail()` so the tool can
 * silently no-op.
 *
 * **Created ids**: after a successful `execute()`, `createdIds`
 * exposes the new nodes' ids so callers (the Knife tool) can update
 * selection to surface the cut pieces.
 */
export class KnifeCutPathCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Cut path';
  /**
   * Marked destructive (D-073 marker). The operation REPLACES the
   * original node with its cut pieces — for path sources, the
   * original `d` is gone (split into 2+ paths); for non-path
   * sources (rect/ellipse/etc), the operation EMBEDS a
   * Convert-to-Path transform that loses the original semantic
   * shape type. Both effects are structurally invasive enough to
   * justify an auto-snapshot before execute (when
   * `SnapshotsLimits.autoOnDestructive` is enabled by the consumer).
   */
  readonly isDestructive = true;

  /** Captured for undo — the node we replaced + its position. */
  private previousNode: SvgNode | null = null;
  private previousParentId: NodeId | null = null;
  private previousIndex = -1;
  /** Captured for undo — the ids of the nodes we inserted. */
  private insertedIds: NodeId[] = [];

  /** Populated after a successful execute(). Empty before. */
  get createdIds(): readonly NodeId[] {
    return this.insertedIds;
  }

  constructor(
    private readonly nodeId: NodeId,
    private readonly docPoint: Point,
    private readonly tolerance: number,
    private readonly snapToNodes: boolean,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const target = findNodeById(doc.root, this.nodeId);
    if (target === null) {
      return fail(`KnifeCutPathCommand: node "${this.nodeId}" not found`);
    }
    // Derive a path-equivalent `d`. For paths use as-is; for shapes
    // synthesise via nodeToPathD (no separate Convert-to-Path step).
    const sourceD = target.type === 'path' ? target.d : nodeToPathD(target);
    if (sourceD === null) {
      return fail(`KnifeCutPathCommand: type "${target.type}" not cuttable`);
    }
    const subpaths = parsePathToAnchors(sourceD);
    if (subpaths.length === 0) {
      return fail('KnifeCutPathCommand: path has no subpaths');
    }
    const parent = findParent(doc.root, this.nodeId);
    if (parent === null) {
      return fail(`KnifeCutPathCommand: node "${this.nodeId}" has no parent (root?)`);
    }
    const index = parent.children.findIndex((c) => c.id === this.nodeId);
    if (index < 0) {
      return fail(`KnifeCutPathCommand: index lookup failed`);
    }

    // ── Find the closest segment + (optional) snap to an existing anchor ──
    const hit = findClosestSegment(subpaths, this.docPoint);
    if (hit === null || hit.dist > this.tolerance) {
      return fail(`KnifeCutPathCommand: no segment within ${this.tolerance}px of click`);
    }

    // Resolve the split point. Snap-to-nodes uses HALF the tolerance
    // for a tighter snap zone (avoids accidentally collapsing the cut
    // onto a far anchor when the user clearly clicked between them).
    let cutAt: { sp: number; segIdx: number; t: number; anchor: AnchorPoint };
    const snapHit = this.snapToNodes
      ? findClosestAnchor(subpaths, this.docPoint, this.tolerance / 2)
      : null;
    if (snapHit !== null) {
      // Snap: cut AT the anchor — no new anchor inserted. The split
      // happens BEFORE the anchor (open) or by reopening the close
      // (closed). We model this as t=0 at the snapped anchor's index.
      cutAt = {
        sp: snapHit.sp,
        segIdx: snapHit.anchorIdx === 0 ? 0 : snapHit.anchorIdx - 1,
        t: snapHit.anchorIdx === 0 ? 0 : 1,
        anchor: subpaths[snapHit.sp]!.anchors[snapHit.anchorIdx]!,
      };
    } else {
      // Insert a new cusp anchor at the projected point.
      cutAt = {
        sp: hit.sp,
        segIdx: hit.segIdx,
        t: hit.t,
        anchor: {
          point: hit.proj,
          handleIn: hit.proj,
          handleOut: hit.proj,
          kind: 'cusp',
        },
      };
    }

    // ── Build the resulting path nodes ───────────────────────────────
    const cutSubpath = subpaths[cutAt.sp]!;
    const otherSubpaths = subpaths.filter((_, i) => i !== cutAt.sp);
    const pieces = cutSubpath.closed
      ? [openClosedSubpathAt(cutSubpath, cutAt.segIdx, cutAt.anchor, snapHit !== null)]
      : splitOpenSubpathAt(cutSubpath, cutAt.segIdx, cutAt.anchor, snapHit !== null);

    if (pieces.length === 0) {
      return fail('KnifeCutPathCommand: cut produced no pieces');
    }

    // **Distribution of OTHER subpaths**: if the original had multiple
    // subpaths and only one was cut, the others ride along with the
    // FIRST resulting piece. Reasonable default — keeps "compound
    // path" relationships intact on at least one side. Users wanting
    // strict separation can release the compound path first (D-054).
    const finalPieces: AnchorSubpath[][] = pieces.map((p, i) =>
      i === 0 ? [p, ...otherSubpaths] : [p],
    );

    // Convert each anchor-list back to `d` and build PathNodes that
    // inherit the original's style/transform/metadata.
    const baseStyle = (target as PathNode).style;
    const baseTransform = (target as PathNode).transform;
    const baseMetadata = (target as PathNode).metadata;
    const newNodes: PathNode[] = finalPieces.map((sps) => {
      const d = anchorsToPathD(sps);
      const fresh = createPath(d);
      return {
        ...fresh,
        transform: baseTransform,
        style: baseStyle,
        metadata: baseMetadata,
      };
    });

    // ── Apply the surgery: remove original, insert pieces at same index ──
    let next = removeNode(doc.root, this.nodeId);
    if (next === doc.root) {
      return fail(`KnifeCutPathCommand: remove failed for "${this.nodeId}"`);
    }
    // Insert pieces in REVERSE so each goes to the original index and
    // the next one slides in before it (preserving order in the parent).
    for (let i = newNodes.length - 1; i >= 0; i--) {
      const afterInsert = insertNode(next, parent.id, newNodes[i]!, index);
      if (afterInsert === next) {
        return fail(`KnifeCutPathCommand: insert failed`);
      }
      next = afterInsert;
    }

    // Capture undo state AFTER everything succeeded.
    this.previousNode = target;
    this.previousParentId = parent.id;
    this.previousIndex = index;
    this.insertedIds = newNodes.map((n) => n.id);

    ctx.state.setDocument({ ...doc, root: next });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousNode === null || this.previousParentId === null || this.previousIndex < 0) {
      return fail('KnifeCutPathCommand undo: nothing captured');
    }
    const doc = ctx.state.document();
    let next = doc.root;
    // Remove every piece we inserted.
    for (const id of this.insertedIds) {
      const after = removeNode(next, id);
      if (after === next) {
        return fail(`KnifeCutPathCommand undo: remove failed for piece "${id}"`);
      }
      next = after;
    }
    // Re-insert the original at its captured index.
    const restored = insertNode(next, this.previousParentId, this.previousNode, this.previousIndex);
    if (restored === next) {
      return fail(`KnifeCutPathCommand undo: re-insert failed`);
    }
    ctx.state.setDocument({ ...doc, root: restored });
    return ok();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

interface SegmentHit {
  readonly sp: number;
  readonly segIdx: number;
  readonly t: number;
  readonly dist: number;
  readonly proj: Point;
}

interface AnchorHit {
  readonly sp: number;
  readonly anchorIdx: number;
  readonly dist: number;
}

/** Find the segment closest to `p` across all subpaths. */
function findClosestSegment(subpaths: readonly AnchorSubpath[], p: Point): SegmentHit | null {
  let best: SegmentHit | null = null;
  for (let s = 0; s < subpaths.length; s++) {
    const anchors = subpaths[s]!.anchors;
    const lastIdx = subpaths[s]!.closed ? anchors.length : anchors.length - 1;
    for (let i = 0; i < lastIdx; i++) {
      const a = anchors[i]!.point;
      const b = anchors[(i + 1) % anchors.length]!.point;
      const proj = projectPointOnSegment(p, a, b);
      const d = distance(p, proj.point);
      if (best === null || d < best.dist) {
        best = { sp: s, segIdx: i, t: proj.t, dist: d, proj: proj.point };
      }
    }
  }
  return best;
}

/** Find the existing anchor closest to `p`, within `maxDist`. */
function findClosestAnchor(
  subpaths: readonly AnchorSubpath[],
  p: Point,
  maxDist: number,
): AnchorHit | null {
  let best: AnchorHit | null = null;
  for (let s = 0; s < subpaths.length; s++) {
    const anchors = subpaths[s]!.anchors;
    for (let i = 0; i < anchors.length; i++) {
      const d = distance(p, anchors[i]!.point);
      if (d <= maxDist && (best === null || d < best.dist)) {
        best = { sp: s, anchorIdx: i, dist: d };
      }
    }
  }
  return best;
}

/**
 * Split an OPEN subpath into 2 anchor lists. Both keep the same
 * stylistic continuity — the cut anchor is duplicated (left piece
 * ends with it; right piece begins with a clone) so each side is a
 * proper open path that starts/ends at the cut.
 *
 * When `snapped` is true, the cut is AT an existing anchor and we
 * don't duplicate it (left ends with the anchor, right begins with
 * the next anchor — clean break).
 */
function splitOpenSubpathAt(
  sp: AnchorSubpath,
  segIdx: number,
  cutAnchor: AnchorPoint,
  snapped: boolean,
): AnchorSubpath[] {
  const anchors = sp.anchors;
  if (snapped) {
    // Cut AT anchor (segIdx is the index of the anchor that becomes
    // the endpoint of the LEFT piece; right starts at segIdx + 1).
    const splitAt = segIdx; // when t=0 we passed segIdx = anchorIdx - 1 (so split at this index + 1)
    const left = anchors.slice(0, splitAt + 1);
    const right = anchors.slice(splitAt + 1);
    if (left.length < 2 || right.length < 2) {
      // Cutting at the very first or last anchor produces a
      // degenerate 1-anchor piece — caller should drop it.
      return [left, right].filter((p) => p.length >= 2).map((p) => ({ anchors: p, closed: false }));
    }
    return [
      { anchors: left, closed: false },
      { anchors: right, closed: false },
    ];
  }
  // Cut on a segment: insert the cut anchor into both pieces.
  const left: AnchorPoint[] = [...anchors.slice(0, segIdx + 1), cutAnchor];
  const rightCut: AnchorPoint = {
    point: cutAnchor.point,
    handleIn: cutAnchor.handleIn,
    handleOut: cutAnchor.handleOut,
    kind: cutAnchor.kind,
  };
  const right: AnchorPoint[] = [rightCut, ...anchors.slice(segIdx + 1)];
  return [
    { anchors: left, closed: false },
    { anchors: right, closed: false },
  ];
}

/**
 * Open a CLOSED subpath by cutting it. The result is ONE open
 * subpath that traverses the original in order, starting and ending
 * at the cut point.
 */
function openClosedSubpathAt(
  sp: AnchorSubpath,
  segIdx: number,
  cutAnchor: AnchorPoint,
  snapped: boolean,
): AnchorSubpath {
  const anchors = sp.anchors;
  if (snapped) {
    // Cut at an existing anchor: rotate the list so that anchor is
    // the start. Optionally also append it at the end so the visual
    // begins+ends at the same spot (lifelike for a cut).
    const startIdx = segIdx === anchors.length - 1 ? 0 : segIdx + 1;
    const rotated = [...anchors.slice(startIdx), ...anchors.slice(0, startIdx)];
    return { anchors: rotated, closed: false };
  }
  // Cut on a segment: insert the cut anchor as both the start AND
  // the end of the resulting open path.
  const rightCut: AnchorPoint = {
    point: cutAnchor.point,
    handleIn: cutAnchor.handleIn,
    handleOut: cutAnchor.handleOut,
    kind: cutAnchor.kind,
  };
  return {
    anchors: [cutAnchor, ...anchors.slice(segIdx + 1), ...anchors.slice(0, segIdx + 1), rightCut],
    closed: false,
  };
}

/** Project `p` onto the segment from `a` to `b`. Returns the foot
 *  point and parametric `t` in `[0, 1]`. */
function projectPointOnSegment(p: Point, a: Point, b: Point): { point: Point; t: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { point: a, t: 0 };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return { point: { x: a.x + t * dx, y: a.y + t * dy }, t };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
