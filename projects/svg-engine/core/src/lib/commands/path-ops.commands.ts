import {
  cleanUpPathD,
  joinPathDs,
  offsetPathD,
  outlineStrokeToPathD,
  reversePathD,
  simplifyPathD,
  splitPathDAtAnchors,
} from '../geometry';
import { createPath } from '../model/node-factory';
import type { PathNode } from '../model/path-node';
import type { SvgNode } from '../model/svg-node';
import type { SvgStyle } from '../types/style';
import { findNodeById, findParent, insertNode, removeNode, updateNode } from '../tree/tree-ops';
import type { GroupNode } from '../model/group-node';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';
import { bakeTransformIntoPathD } from './compound-path.commands';

/**
 * **D-090 — Path menu commands.** Undoable wrappers around the pure
 * geometry helpers in `geometry/path-ops.ts` / `path-offset.ts` /
 * `stroke-outline.ts`. Each snapshots the document root and restores it
 * verbatim on `undo()` (same pattern as the compound-path / pathfinder
 * commands — one history entry, structural sharing keeps untouched
 * subtrees referentially equal).
 *
 * Single-node ops (Reverse / Clean Up / Simplify / Outline / Offset)
 * rewrite each selected path's `d` IN LOCAL SPACE and leave the node's
 * `transform` untouched — visual placement is preserved. Join (merge)
 * and Split (cut) restructure the tree like compound-path make/release.
 *
 * The companion menu entries live in `builtinRoadmapMenuPlugin`
 * (svg-engine/edit). Convert to Path is already covered by
 * {@link import('./batch-convert-to-path.command').BatchConvertToPathCommand}.
 */

/** Restore a captured root snapshot. Shared undo body. */
function undoSnapshot(ctx: CommandContext, label: string, snap: SvgNode | null): CommandResult {
  if (snap === null) return fail(`${label} undo: nothing captured`);
  if (snap.type !== 'group') return fail(`${label} undo: snapshot root not a group`);
  const doc = ctx.state.document();
  ctx.state.setDocument({ ...doc, root: snap });
  return ok();
}

/**
 * Apply a `d`-rewriting (and optional style-rewriting) updater to every
 * selected path node, returning the new root + whether anything changed.
 * Non-path nodes and updaters returning `null` are skipped.
 */
function rewritePaths(
  root: GroupNode,
  ids: readonly NodeId[],
  updater: (node: PathNode) => PathNode | null,
): { root: GroupNode; changed: boolean } {
  let nextRoot = root;
  let changed = false;
  for (const id of ids) {
    const node = findNodeById(nextRoot, id);
    if (node === null || node.type !== 'path') continue;
    const updated = updater(node);
    if (updated === null || updated === node) continue;
    nextRoot = updateNode<PathNode>(nextRoot, id, () => updated);
    changed = true;
  }
  return { root: nextRoot, changed };
}

// ── Reverse Direction ──────────────────────────────────────────────────

/** Reverse the winding direction of every selected path. */
export class ReversePathCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Reverse Path Direction';
  private snapshot: SvgNode | null = null;

  constructor(private readonly nodeIds: readonly NodeId[]) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const { root, changed } = rewritePaths(doc.root, this.nodeIds, (node) => {
      const d = reversePathD(node.d);
      return d === node.d ? null : { ...node, d };
    });
    if (!changed) return fail(`${this.label}: no path changed`);
    this.snapshot = doc.root;
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    return undoSnapshot(ctx, this.label, this.snapshot);
  }
}

// ── Clean Up ───────────────────────────────────────────────────────────

/** Remove redundant/degenerate anchors from every selected path. */
export class CleanUpPathCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Clean Up Path';
  private snapshot: SvgNode | null = null;

  constructor(private readonly nodeIds: readonly NodeId[]) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const { root, changed } = rewritePaths(doc.root, this.nodeIds, (node) => {
      const d = cleanUpPathD(node.d);
      return d === node.d ? null : { ...node, d };
    });
    if (!changed) return fail(`${this.label}: nothing to clean`);
    this.snapshot = doc.root;
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    return undoSnapshot(ctx, this.label, this.snapshot);
  }
}

// ── Simplify ───────────────────────────────────────────────────────────

/** Default RDP tolerance (doc units) when the caller doesn't override. */
export const DEFAULT_SIMPLIFY_TOLERANCE = 1.5;

/** Reduce anchor count of every selected path via RDP simplification. */
export class SimplifyPathCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Simplify Path';
  private snapshot: SvgNode | null = null;

  constructor(
    private readonly nodeIds: readonly NodeId[],
    private readonly tolerance: number = DEFAULT_SIMPLIFY_TOLERANCE,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const { root, changed } = rewritePaths(doc.root, this.nodeIds, (node) => {
      const d = simplifyPathD(node.d, this.tolerance);
      return d === node.d ? null : { ...node, d };
    });
    if (!changed) return fail(`${this.label}: nothing to simplify`);
    this.snapshot = doc.root;
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    return undoSnapshot(ctx, this.label, this.snapshot);
  }
}

// ── Offset Path ────────────────────────────────────────────────────────

/** Default offset distance (doc units) for a menu invocation. */
export const DEFAULT_OFFSET_DISTANCE = 10;

/** Offset every selected path by `distance` (positive = outward). */
export class OffsetPathCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Offset Path';
  private snapshot: SvgNode | null = null;

  constructor(
    private readonly nodeIds: readonly NodeId[],
    private readonly distance: number = DEFAULT_OFFSET_DISTANCE,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const { root, changed } = rewritePaths(doc.root, this.nodeIds, (node) => {
      const d = offsetPathD(node.d, this.distance);
      return d === node.d ? null : { ...node, d };
    });
    if (!changed) return fail(`${this.label}: nothing to offset`);
    this.snapshot = doc.root;
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    return undoSnapshot(ctx, this.label, this.snapshot);
  }
}

// ── Outline Stroke ─────────────────────────────────────────────────────

/**
 * Convert every selected path's stroke into a filled outline shape: the
 * new `d` is the region the stroke painted, the fill becomes the former
 * stroke colour, and stroke styling is dropped. Paths with no stroke
 * (or `stroke: none` / zero width) are skipped.
 */
export class OutlineStrokeCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Outline Stroke';
  private snapshot: SvgNode | null = null;

  constructor(private readonly nodeIds: readonly NodeId[]) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const { root, changed } = rewritePaths(doc.root, this.nodeIds, (node) => {
      const stroke = node.style.stroke;
      const width = node.style.strokeWidth ?? 1;
      if (typeof stroke !== 'string' || stroke === 'none' || stroke.trim() === '' || width <= 0) {
        return null;
      }
      const d = outlineStrokeToPathD(node.d, width);
      if (d.length === 0) return null;
      // Build the outlined style: former stroke colour becomes the fill;
      // drop every stroke-related field so the shape paints as a solid.
      const nextStyle: SvgStyle = { ...node.style };
      const mutable = nextStyle as { -readonly [K in keyof SvgStyle]: SvgStyle[K] };
      mutable.fill = stroke;
      if (node.style.strokeOpacity !== undefined) mutable.fillOpacity = node.style.strokeOpacity;
      delete mutable.stroke;
      delete mutable.strokeWidth;
      delete mutable.strokeOpacity;
      delete mutable.strokeDasharray;
      delete mutable.strokeLinecap;
      delete mutable.strokeLinejoin;
      return { ...node, d, style: nextStyle };
    });
    if (!changed) return fail(`${this.label}: no strokable path in selection`);
    this.snapshot = doc.root;
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    return undoSnapshot(ctx, this.label, this.snapshot);
  }
}

// ── Join ───────────────────────────────────────────────────────────────

/**
 * Join the selected paths. A single open path is **closed**; two or
 * more open paths are **welded** end-to-end into one path (transforms
 * baked, result carries the first path's id/style at its z-slot).
 * Closed-only selections fail (nothing to join).
 */
export class JoinPathsCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Join Path';
  private snapshot: SvgNode | null = null;

  constructor(private readonly nodeIds: readonly NodeId[]) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const paths: PathNode[] = [];
    for (const id of this.nodeIds) {
      const node = findNodeById(doc.root, id);
      if (node !== null && node.type === 'path') paths.push(node);
    }
    if (paths.length === 0) return fail(`${this.label}: no path selected`);

    // Single path → close it in local space (transform preserved).
    if (paths.length === 1) {
      const only = paths[0]!;
      const merged = joinPathDs([only.d]);
      if (merged === null || merged === only.d) return fail(`${this.label}: nothing to join`);
      this.snapshot = doc.root;
      const root = updateNode<PathNode>(doc.root, only.id, (n) => ({ ...n, d: merged }));
      ctx.state.setDocument({ ...doc, root });
      return ok();
    }

    // Multiple → bake transforms, weld, collapse onto operand A's slot.
    const bakedDs = paths.map((p) => bakeTransformIntoPathD(p.d, p.transform));
    const merged = joinPathDs(bakedDs);
    if (merged === null) return fail(`${this.label}: nothing to join`);
    const operandA = paths[0]!;
    const parent = findParent(doc.root, operandA.id);
    if (parent === null) return fail(`${this.label}: operand A has no parent`);
    const aIdx = parent.children.findIndex((c) => c.id === operandA.id);
    if (aIdx < 0) return fail(`${this.label}: operand A index lookup failed`);

    this.snapshot = doc.root;
    const fresh = createPath(merged);
    const result: PathNode = {
      ...fresh,
      id: operandA.id,
      transform: [1, 0, 0, 1, 0, 0],
      style: operandA.style,
      metadata: operandA.metadata,
    };
    let root = removeNode(doc.root, operandA.id);
    root = insertNode(root, parent.id, result, aIdx);
    for (let i = 1; i < paths.length; i++) {
      root = removeNode(root, paths[i]!.id);
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    return undoSnapshot(ctx, this.label, this.snapshot);
  }
}

// ── Split ──────────────────────────────────────────────────────────────

/** A cut point: an anchor within a subpath of the target path. */
export interface PathSplitCut {
  readonly subpathIndex: number;
  readonly anchorIndex: number;
}

/**
 * Split a single path at the given anchor cut points into separate path
 * nodes (the first keeps the original id; all inherit transform / style
 * / metadata, placed in order at the original z-slot). Distinct from
 * Release Compound Path (which splits at `M` subpath boundaries) and the
 * Knife tool (which cuts at an arbitrary clicked point).
 */
export class SplitPathCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Split Path';
  private snapshot: SvgNode | null = null;

  constructor(
    private readonly nodeId: NodeId,
    private readonly cuts: readonly PathSplitCut[],
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`${this.label}: node "${this.nodeId}" not found`);
    if (node.type !== 'path') return fail(`${this.label}: only paths can be split`);
    if (this.cuts.length === 0) return fail(`${this.label}: no cut points`);

    const pieces = splitPathDAtAnchors(node.d, this.cuts);
    if (pieces === null || pieces.length < 2) return fail(`${this.label}: nothing to split`);

    const parent = findParent(doc.root, this.nodeId);
    if (parent === null) return fail(`${this.label}: node has no parent`);
    const idx = parent.children.findIndex((c) => c.id === this.nodeId);
    if (idx < 0) return fail(`${this.label}: index lookup failed`);

    this.snapshot = doc.root;
    const nodes: PathNode[] = pieces.map((d, i) => {
      const fresh = createPath(d);
      return {
        ...fresh,
        id: i === 0 ? node.id : fresh.id,
        transform: node.transform,
        style: node.style,
        metadata: node.metadata,
      };
    });
    let root = removeNode(doc.root, this.nodeId);
    for (let i = 0; i < nodes.length; i++) {
      root = insertNode(root, parent.id, nodes[i]!, idx + i);
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    return undoSnapshot(ctx, this.label, this.snapshot);
  }
}
