import {
  type AnchorKind,
  type AnchorPoint,
  anchorsToPathD,
  parsePathToAnchors,
} from '../geometry/path-anchors';

/**
 * Mutable subpath shape used internally by anchor commands while
 * applying edits. The public `AnchorSubpath` from `path-anchors`
 * is `readonly`; we convert in `withPathAnchors` before handing to
 * mutators, and serialize back via `anchorsToPathD` (which accepts
 * both shapes since the public type is structurally compatible).
 */
interface MutableSubpath {
  anchors: AnchorPoint[];
  closed: boolean;
}
import type { PathNode } from '../model/path-node';
import type { SvgNode } from '../model/svg-node';
import { findNodeById, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import type { Point } from '../types/point';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Reference to a single anchor inside a path: subpath index +
 * anchor index within the subpath. Stable across the lifetime of a
 * gesture (the AnchorSelectionService keeps these). Becomes stale
 * if the path's subpath structure changes (e.g. after an
 * InsertAnchor that shifts indices) — services that hold refs are
 * expected to invalidate or rebase on document change.
 */
export interface AnchorRef {
  readonly nodeId: NodeId;
  readonly subpathIndex: number;
  readonly anchorIndex: number;
}

/**
 * Helper that runs `mutate` on the path's anchor structure and
 * re-serializes back to `d`. Returns `null` when the target isn't
 * a path, isn't found, or the mutation rejects. Shared between
 * all anchor commands so they speak the same data path.
 */
function withPathAnchors(
  ctx: CommandContext,
  nodeId: NodeId,
  mutate: (subpaths: MutableSubpath[]) => boolean,
): { prevD: string; nextD: string } | null {
  const doc = ctx.state.document();
  const target = findNodeById(doc.root, nodeId);
  if (target === null || target.type !== 'path') return null;
  const path = target as PathNode;
  const subpaths: MutableSubpath[] = parsePathToAnchors(path.d).map((s) => ({
    anchors: [...s.anchors],
    closed: s.closed,
  }));
  const ok = mutate(subpaths);
  if (!ok) return null;
  const nextD = anchorsToPathD(subpaths);
  if (nextD === path.d) return null;
  return { prevD: path.d, nextD };
}

function applyNextD(ctx: CommandContext, nodeId: NodeId, nextD: string): CommandResult {
  const doc = ctx.state.document();
  const nextRoot = updateNode<SvgNode>(doc.root, nodeId, (n) => {
    if (n.type !== 'path') return n;
    return { ...n, d: nextD };
  });
  if (nextRoot === doc.root) return fail(`anchor command: failed to update node "${nodeId}"`);
  ctx.state.setDocument({ ...doc, root: nextRoot });
  return ok();
}

/**
 * Move a single anchor's `point` (and, optionally, its handles)
 * to a new absolute position. Smooth/symmetric anchors get their
 * handles auto-adjusted to preserve continuity:
 * - `smooth`: handleOut is reflected from handleIn (180°)
 *   maintaining ORIGINAL length
 * - `symmetric`: handleOut mirrors handleIn (same length)
 * - `cusp`: handles move with the point (free)
 *
 * `which` defaults to `'point'`; pass `'handleIn'` or `'handleOut'`
 * to drag a handle instead of the point. Dragging a handle on a
 * smooth/symmetric anchor enforces the constraint on the opposite
 * handle (the editor matches Affinity/Illustrator behavior).
 */
export class MoveAnchorCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Move anchor';

  private previous: { d: string } | null = null;

  constructor(
    private readonly ref: AnchorRef,
    private readonly newPosition: Point,
    private readonly which: 'point' | 'handleIn' | 'handleOut' = 'point',
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const result = withPathAnchors(ctx, this.ref.nodeId, (subpaths) => {
      const sub = subpaths[this.ref.subpathIndex];
      if (sub === undefined) return false;
      const anchor = sub.anchors[this.ref.anchorIndex];
      if (anchor === undefined) return false;
      sub.anchors[this.ref.anchorIndex] = mutateAnchor(anchor, this.newPosition, this.which);
      return true;
    });
    if (result === null) return fail('MoveAnchorCommand: target not found or mutation rejected');
    this.previous = { d: result.prevD };
    return applyNextD(ctx, this.ref.nodeId, result.nextD);
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previous === null) return fail('MoveAnchorCommand undo: nothing captured');
    return applyNextD(ctx, this.ref.nodeId, this.previous.d);
  }
}

/**
 * Apply the move to a single anchor, enforcing kind constraints
 * on handle/point edits. Pure (returns new anchor; doesn't mutate).
 */
function mutateAnchor(
  anchor: AnchorPoint,
  newPos: Point,
  which: 'point' | 'handleIn' | 'handleOut',
): AnchorPoint {
  if (which === 'point') {
    const dx = newPos.x - anchor.point.x;
    const dy = newPos.y - anchor.point.y;
    return {
      ...anchor,
      point: newPos,
      handleIn: { x: anchor.handleIn.x + dx, y: anchor.handleIn.y + dy },
      handleOut: { x: anchor.handleOut.x + dx, y: anchor.handleOut.y + dy },
    };
  }
  // Handle drag — enforce kind constraints on the opposite handle.
  if (which === 'handleIn') {
    if (anchor.kind === 'cusp') {
      return { ...anchor, handleIn: newPos };
    }
    // smooth/symmetric: opposite handle reflects.
    const inDx = newPos.x - anchor.point.x;
    const inDy = newPos.y - anchor.point.y;
    const inLen = Math.hypot(inDx, inDy);
    let outDx = -inDx;
    let outDy = -inDy;
    if (anchor.kind === 'smooth' && inLen > 1e-6) {
      // Preserve current handleOut length, only reflect direction.
      const outLen = Math.hypot(
        anchor.handleOut.x - anchor.point.x,
        anchor.handleOut.y - anchor.point.y,
      );
      const k = outLen / inLen;
      outDx = -inDx * k;
      outDy = -inDy * k;
    }
    return {
      ...anchor,
      handleIn: newPos,
      handleOut: { x: anchor.point.x + outDx, y: anchor.point.y + outDy },
    };
  }
  // which === 'handleOut' — mirror logic.
  if (anchor.kind === 'cusp') {
    return { ...anchor, handleOut: newPos };
  }
  const outDx = newPos.x - anchor.point.x;
  const outDy = newPos.y - anchor.point.y;
  const outLen = Math.hypot(outDx, outDy);
  let inDx = -outDx;
  let inDy = -outDy;
  if (anchor.kind === 'smooth' && outLen > 1e-6) {
    const inLen = Math.hypot(
      anchor.handleIn.x - anchor.point.x,
      anchor.handleIn.y - anchor.point.y,
    );
    const k = inLen / outLen;
    inDx = -outDx * k;
    inDy = -outDy * k;
  }
  return {
    ...anchor,
    handleOut: newPos,
    handleIn: { x: anchor.point.x + inDx, y: anchor.point.y + inDy },
  };
}

/**
 * Insert a new anchor at fractional position `t ∈ [0, 1]` along
 * the bezier segment between `ref` and its NEXT anchor. The new
 * anchor is created as `smooth`, carrying the handles produced by the
 * split so the curve is preserved continuously. (On a STRAIGHT
 * segment the split handles collapse onto the point, so the anchor
 * reads back as a `cusp` once re-classified from its geometry.)
 *
 * Uses de Casteljau subdivision so the visual curve is preserved
 * exactly — splitting at `t=0.5` of a cubic gives two cubics
 * whose union has identical sampling.
 */
export class InsertAnchorCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Insert anchor';

  private previous: { d: string } | null = null;

  constructor(
    private readonly ref: AnchorRef,
    private readonly t: number,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    if (!Number.isFinite(this.t) || this.t <= 0 || this.t >= 1) {
      return fail(`InsertAnchorCommand: t must be in (0, 1), got ${this.t}`);
    }
    const result = withPathAnchors(ctx, this.ref.nodeId, (subpaths) => {
      const sub = subpaths[this.ref.subpathIndex];
      if (sub === undefined) return false;
      const i = this.ref.anchorIndex;
      const next = sub.closed && i === sub.anchors.length - 1 ? 0 : i + 1;
      const a = sub.anchors[i];
      const b = sub.anchors[next];
      if (a === undefined || b === undefined) return false;
      const [aNew, midNew, bNew] = subdivideCubic(a, b, this.t);
      sub.anchors[i] = aNew;
      if (next === 0) {
        // Closed: insert at end before the wrap.
        sub.anchors.push(midNew);
        sub.anchors[0] = bNew;
      } else {
        sub.anchors.splice(next, 0, midNew);
        sub.anchors[next + 1] = bNew;
      }
      return true;
    });
    if (result === null) return fail('InsertAnchorCommand: target not found');
    this.previous = { d: result.prevD };
    return applyNextD(ctx, this.ref.nodeId, result.nextD);
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previous === null) return fail('InsertAnchorCommand undo: nothing captured');
    return applyNextD(ctx, this.ref.nodeId, this.previous.d);
  }
}

/**
 * De Casteljau subdivision of the cubic from `a → b` at parameter `t`.
 * Returns `[a', midpoint, b']` — `a'` and `b'` have their adjacent
 * handles trimmed so concatenation reproduces the original curve.
 */
function subdivideCubic(
  a: AnchorPoint,
  b: AnchorPoint,
  t: number,
): [AnchorPoint, AnchorPoint, AnchorPoint] {
  const p0 = a.point;
  const p1 = a.handleOut;
  const p2 = b.handleIn;
  const p3 = b.point;
  const lerp = (u: Point, v: Point): Point => ({
    x: u.x + (v.x - u.x) * t,
    y: u.y + (v.y - u.y) * t,
  });
  const q0 = lerp(p0, p1);
  const q1 = lerp(p1, p2);
  const q2 = lerp(p2, p3);
  const r0 = lerp(q0, q1);
  const r1 = lerp(q1, q2);
  const s = lerp(r0, r1);
  return [
    { ...a, handleOut: q0 },
    { point: s, handleIn: r0, handleOut: r1, kind: 'smooth' },
    { ...b, handleIn: q2 },
  ];
}

/**
 * Remove a single anchor from the subpath. When fewer than 2 anchors
 * would remain, the entire subpath is removed (path may end up
 * empty — caller's responsibility to RemoveNodeCommand the whole
 * node when that happens).
 */
export class RemoveAnchorCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Remove anchor';

  private previous: { d: string } | null = null;

  constructor(private readonly ref: AnchorRef) {}

  execute(ctx: CommandContext): CommandResult {
    const result = withPathAnchors(ctx, this.ref.nodeId, (subpaths) => {
      const sub = subpaths[this.ref.subpathIndex];
      if (sub === undefined) return false;
      if (this.ref.anchorIndex < 0 || this.ref.anchorIndex >= sub.anchors.length) return false;
      sub.anchors.splice(this.ref.anchorIndex, 1);
      // Drop subpath if it became degenerate (0 or 1 anchor).
      if (sub.anchors.length < 2) {
        subpaths.splice(this.ref.subpathIndex, 1);
      }
      return true;
    });
    if (result === null) return fail('RemoveAnchorCommand: target not found');
    this.previous = { d: result.prevD };
    return applyNextD(ctx, this.ref.nodeId, result.nextD);
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previous === null) return fail('RemoveAnchorCommand undo: nothing captured');
    return applyNextD(ctx, this.ref.nodeId, this.previous.d);
  }
}

/**
 * Change an anchor's `kind` (cusp ↔ smooth ↔ symmetric). Visual
 * effect: handles snap to the new constraint.
 * - `cusp`: handles stay where they are (no auto-adjust)
 * - `smooth`: handleOut reflects handleIn's direction, preserving
 *   handleOut's current length
 * - `symmetric`: handleOut mirrors handleIn (same length too)
 */
export class ConvertAnchorTypeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Convert anchor type';

  private previous: { d: string } | null = null;

  constructor(
    private readonly ref: AnchorRef,
    private readonly nextKind: AnchorKind,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const nextKind = this.nextKind;
    const ref = this.ref;
    const result = withPathAnchors(ctx, this.ref.nodeId, (subpaths) => {
      const sub = subpaths[ref.subpathIndex];
      if (sub === undefined) return false;
      const anchor = sub.anchors[ref.anchorIndex];
      if (anchor === undefined) return false;
      const n = sub.anchors.length;
      // Resolve neighbours so `enforceKind` can fabricate default
      // handles for anchors that arrived with both handles collapsed
      // (e.g. a path that was just converted from a rect/line). Without
      // a neighbour to point at, smooth/symmetric would be a visual
      // no-op and the cycle would appear "broken" on straight-edge
      // shapes — the most common user-facing case.
      const prev =
        ref.anchorIndex > 0
          ? sub.anchors[ref.anchorIndex - 1]
          : sub.closed
            ? sub.anchors[n - 1]
            : undefined;
      const next =
        ref.anchorIndex < n - 1
          ? sub.anchors[ref.anchorIndex + 1]
          : sub.closed
            ? sub.anchors[0]
            : undefined;
      sub.anchors[ref.anchorIndex] = enforceKind(anchor, nextKind, prev, next);
      return true;
    });
    if (result === null) return fail('ConvertAnchorTypeCommand: target not found');
    this.previous = { d: result.prevD };
    return applyNextD(ctx, this.ref.nodeId, result.nextD);
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previous === null) return fail('ConvertAnchorTypeCommand undo: nothing captured');
    return applyNextD(ctx, this.ref.nodeId, this.previous.d);
  }
}

/**
 * Default handle-length ratios used when synthesising fresh handles
 * for a corner-to-curve conversion. INTENTIONALLY asymmetric (0.4
 * vs 0.3 of the neighbour distance) so the synthesised pair is
 * `smooth` rather than `symmetric` — that way the **next** dblclick
 * (smooth → symmetric) produces a visible change instead of being
 * a silent no-op.
 *
 * The "1/3 of the neighbour distance" baseline is Illustrator's Smooth
 * tool default — long enough to be visibly grabbable, short enough that
 * the curve doesn't overshoot.
 */
const HANDLE_IN_RATIO = 0.4;
const HANDLE_OUT_RATIO = 0.3;
/** Used by the existing-handle fallback when synthesising one side only. */
const DEFAULT_HANDLE_RATIO = 1 / 3;

/**
 * Pure: produce a new anchor with handles snapped to the requested
 * kind constraint.
 *
 * **cusp**: collapses both handles into the anchor point (Illustrator
 * "Convert Anchor Point" semantic). Destructive — the curve flattens
 * at this anchor — but it's the only way to make the dblclick cycle
 * symmetric→cusp produce a visible change, since the `d` string
 * doesn't carry kind metadata and would otherwise re-classify the
 * same handles as symmetric on every re-parse.
 *
 * **smooth**: reflects handleOut along handleIn's direction while
 * preserving handleOut's CURRENT length (asymmetric on purpose).
 * Falls back to synthesised handles when both sides are collapsed.
 *
 * **symmetric**: handleOut mirrors handleIn exactly (same length,
 * opposite direction). Falls back to synthesised handles when both
 * sides are collapsed.
 *
 * `prev`/`next` are the adjacent anchors in the subpath (wrap-around
 * for closed subpaths); either may be `undefined` for endpoint
 * anchors of open subpaths.
 */
function enforceKind(
  anchor: AnchorPoint,
  kind: AnchorKind,
  prev: AnchorPoint | undefined,
  next: AnchorPoint | undefined,
): AnchorPoint {
  const inDx0 = anchor.handleIn.x - anchor.point.x;
  const inDy0 = anchor.handleIn.y - anchor.point.y;
  const outDx0 = anchor.handleOut.x - anchor.point.x;
  const outDy0 = anchor.handleOut.y - anchor.point.y;
  const inLen0 = Math.hypot(inDx0, inDy0);
  const outLen0 = Math.hypot(outDx0, outDy0);

  if (kind === 'cusp') {
    // Collapse handles into the anchor point — destructive but the
    // only way to make symmetric→cusp produce a visible change (the
    // d-string doesn't carry kind metadata, so otherwise the parser
    // would keep classifying the same handles as symmetric and the
    // cycle would never advance).
    //
    // If handles were already collapsed, the d stays identical and
    // the command no-ops via the `nextD === path.d` guard — fine,
    // a cusp with no handles can't be made "more cusp".
    return { ...anchor, kind, handleIn: anchor.point, handleOut: anchor.point };
  }

  // smooth/symmetric path: need at least one handle direction.
  // If both handles are collapsed (raw corner from rect/polygon),
  // synthesize defaults pointing toward the neighbouring anchors.
  if (inLen0 < 1e-6 && outLen0 < 1e-6) {
    const synth = synthesizeHandles(anchor, prev, next, kind);
    if (synth === null) {
      // Isolated anchor (no neighbours) — there's no direction to
      // pick. Leave it as-is + flag the requested kind for callers
      // that may render the constraint metadata.
      return { ...anchor, kind };
    }
    return { ...anchor, kind, handleIn: synth.handleIn, handleOut: synth.handleOut };
  }

  // At least one handle exists. Use handleIn as reference direction
  // when available, else mirror from handleOut.
  if (inLen0 < 1e-6) {
    const inLenTarget =
      kind === 'symmetric' ? outLen0 : DEFAULT_HANDLE_RATIO * neighbourDist(anchor, prev);
    const k = inLenTarget / outLen0;
    return {
      ...anchor,
      kind,
      handleIn: { x: anchor.point.x - outDx0 * k, y: anchor.point.y - outDy0 * k },
    };
  }
  const targetOutLen =
    kind === 'symmetric'
      ? inLen0
      : outLen0 > 1e-6
        ? outLen0
        : DEFAULT_HANDLE_RATIO * neighbourDist(anchor, next);
  const k = targetOutLen / inLen0;
  return {
    ...anchor,
    kind,
    handleOut: { x: anchor.point.x - inDx0 * k, y: anchor.point.y - inDy0 * k },
  };
}

/** Distance from `anchor.point` to a neighbour, or 0 if neighbour absent. */
function neighbourDist(anchor: AnchorPoint, neighbour: AnchorPoint | undefined): number {
  if (neighbour === undefined) return 0;
  return Math.hypot(neighbour.point.x - anchor.point.x, neighbour.point.y - anchor.point.y);
}

/**
 * Build default handles for an anchor whose existing handles are
 * collapsed (cusp with no tangent info). Direction is the chord from
 * `prev` to `next` (or just toward whichever neighbour exists).
 *
 * **Length policy** — controlled by `kind`:
 * - `symmetric`: both sides 1/3 · min(distPrev, distNext) → mirrors.
 * - `smooth`: in-side 0.4 · distPrev, out-side 0.3 · distNext →
 *   intentionally asymmetric so the classifier reads `smooth`, not
 *   `symmetric`. Lets the cycle smooth → symmetric still produce a
 *   visible change on shapes that started as corners.
 */
function synthesizeHandles(
  anchor: AnchorPoint,
  prev: AnchorPoint | undefined,
  next: AnchorPoint | undefined,
  kind: AnchorKind,
): { handleIn: Point; handleOut: Point } | null {
  if (prev === undefined && next === undefined) return null;
  // Choose a tangent direction: chord from prev → next if both exist,
  // else simply along the segment toward the existing neighbour.
  let dirX: number;
  let dirY: number;
  if (prev !== undefined && next !== undefined) {
    dirX = next.point.x - prev.point.x;
    dirY = next.point.y - prev.point.y;
  } else if (next !== undefined) {
    dirX = next.point.x - anchor.point.x;
    dirY = next.point.y - anchor.point.y;
  } else {
    // prev only
    dirX = anchor.point.x - prev!.point.x;
    dirY = anchor.point.y - prev!.point.y;
  }
  const dirLen = Math.hypot(dirX, dirY);
  if (dirLen < 1e-6) return null;
  const ux = dirX / dirLen;
  const uy = dirY / dirLen;
  const distPrev = neighbourDist(anchor, prev);
  const distNext = neighbourDist(anchor, next);

  if (kind === 'symmetric') {
    // Mirrored: both sides use the SHORTER neighbour distance so the
    // handles don't overshoot an adjacent anchor on a degenerate
    // (one-side-much-shorter) corner.
    const refDist =
      distPrev > 0 && distNext > 0 ? Math.min(distPrev, distNext) : Math.max(distPrev, distNext);
    const len = refDist * DEFAULT_HANDLE_RATIO;
    return {
      handleIn: { x: anchor.point.x - ux * len, y: anchor.point.y - uy * len },
      handleOut: { x: anchor.point.x + ux * len, y: anchor.point.y + uy * len },
    };
  }

  // smooth: deliberately asymmetric so the next cycle step (→symmetric)
  // is detectable. Fall back to whichever neighbour distance is known
  // when the other is missing.
  const lenIn = (distPrev > 0 ? distPrev : distNext) * HANDLE_IN_RATIO;
  const lenOut = (distNext > 0 ? distNext : distPrev) * HANDLE_OUT_RATIO;
  return {
    handleIn: { x: anchor.point.x - ux * lenIn, y: anchor.point.y - uy * lenIn },
    handleOut: { x: anchor.point.x + ux * lenOut, y: anchor.point.y + uy * lenOut },
  };
}
