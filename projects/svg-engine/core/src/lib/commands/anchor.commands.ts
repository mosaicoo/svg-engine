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
 * anchor lands as `cusp` by default (Affinity convention: user
 * promotes to smooth after).
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
    const result = withPathAnchors(ctx, this.ref.nodeId, (subpaths) => {
      const sub = subpaths[this.ref.subpathIndex];
      if (sub === undefined) return false;
      const anchor = sub.anchors[this.ref.anchorIndex];
      if (anchor === undefined) return false;
      sub.anchors[this.ref.anchorIndex] = enforceKind(anchor, nextKind);
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

/** Pure: produce a new anchor with handles snapped to the requested kind constraint. */
function enforceKind(anchor: AnchorPoint, kind: AnchorKind): AnchorPoint {
  if (kind === 'cusp') return { ...anchor, kind };
  // smooth/symmetric: handles colinear opposite. Use handleIn as the
  // reference direction.
  const inDx = anchor.handleIn.x - anchor.point.x;
  const inDy = anchor.handleIn.y - anchor.point.y;
  const inLen = Math.hypot(inDx, inDy);
  if (inLen < 1e-6) {
    // No in handle — fall back to using out handle as reference.
    const outDx = anchor.handleOut.x - anchor.point.x;
    const outDy = anchor.handleOut.y - anchor.point.y;
    const outLen = Math.hypot(outDx, outDy);
    if (outLen < 1e-6) return { ...anchor, kind };
    const inLenTarget = kind === 'symmetric' ? outLen : 0;
    return {
      ...anchor,
      kind,
      handleIn: {
        x: anchor.point.x - outDx * (inLenTarget / outLen || 0),
        y: anchor.point.y - outDy * (inLenTarget / outLen || 0),
      },
    };
  }
  const outLen = Math.hypot(
    anchor.handleOut.x - anchor.point.x,
    anchor.handleOut.y - anchor.point.y,
  );
  const targetOutLen = kind === 'symmetric' ? inLen : outLen;
  const k = targetOutLen / inLen;
  return {
    ...anchor,
    kind,
    handleOut: { x: anchor.point.x - inDx * k, y: anchor.point.y - inDy * k },
  };
}
