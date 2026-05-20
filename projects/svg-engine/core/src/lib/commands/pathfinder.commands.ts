import polygonClipping from 'polygon-clipping';
import type { FlatRing } from '../geometry/path-flatten';
import { flattenPathD, ringsToPathD } from '../geometry/path-flatten';
import { createPath } from '../model/node-factory';
import type { SvgNode } from '../model/svg-node';
import { findNodeById, findParent, insertNode, removeNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';
import { nodeToPathD } from './convert-to-path.command';

/**
 * Pathfinder (boolean) operations on SVG paths — Illustrator's
 * Pathfinder panel equivalent. All 5 ops accept N node ids (≥ 2),
 * flatten each node's geometry to polygon rings, run the requested
 * boolean op via `polygon-clipping` (Martinez algorithm), and
 * replace the input nodes with the result(s).
 *
 * **Common pre-processing**:
 * - Every input is converted to its path `d` (rect/ellipse/line/
 *   polygon/polyline use the same {@link nodeToPathD} helper as
 *   `ConvertNodeToPathCommand`; existing paths use their own `d`).
 * - The path's `transform` is applied to its rings before booleaning,
 *   so two visually-overlapping nodes with different transforms still
 *   intersect correctly (the engine doesn't know about transforms).
 * - Groups and text are SKIPPED — booleans don't make sense for them
 *   in v1. A future polish could flatten groups to compound paths.
 *
 * **Result placement**:
 * - The result(s) replace the first selected node's geometry; the
 *   other inputs are removed. Result inherits the first node's
 *   style + metadata (Affinity convention: "operand A wins").
 * - DIVIDE returns N results (one per resulting region); they're
 *   inserted as siblings of the first input. Each "private" region
 *   keeps the style of the input that originated it (Illustrator
 *   semantic); pairwise-intersection slivers fall back to operand A.
 *
 * **Undo**: each command snapshots all affected nodes (whole subtree
 * snapshot is simplest + safe) and restores on undo.
 *
 * **Edge cases**:
 * - Disjoint inputs in UNION → returns 1 path with multiple subpaths
 * - Empty result (e.g., subtract A from B where A ⊆ B) → the
 *   operand A node is REMOVED entirely (no orphan)
 * - 1 or 0 inputs → fail (need ≥ 2 to combine)
 */

/**
 * Per-region result emitted by `runOp`. Carries the polygon rings
 * plus an optional `styleSourceIdx` pointing to the input whose
 * style should be inherited. When omitted (or out of range), the
 * region inherits operand A's style — the default for ops that
 * don't track per-region provenance (Union, Intersect, Subtract,
 * Exclude). Divide uses it to give each "private" region the style
 * of the input that originated it (Illustrator behavior).
 */
export interface PathfinderRegion {
  readonly rings: readonly FlatRing[];
  readonly styleSourceIdx?: number;
}

/** Common executor — all 5 ops only differ in their polygon-clipping call. */
abstract class PathfinderCommand implements Command {
  abstract readonly label: string;
  readonly id: string = generateNodeId();

  protected previousRootSnapshot: SvgNode | null = null;

  constructor(protected readonly nodeIds: readonly NodeId[]) {}

  abstract runOp(rings: readonly (readonly FlatRing[])[]): readonly PathfinderRegion[];

  execute(ctx: CommandContext): CommandResult {
    if (this.nodeIds.length < 2) {
      return fail(`${this.label}: need at least 2 nodes (got ${this.nodeIds.length})`);
    }
    const doc = ctx.state.document();
    // Snapshot whole root for undo (simple + correct).
    this.previousRootSnapshot = doc.root;

    // Gather inputs as flattened rings (in DOC-LOCAL coords — transform
    // applied because polygon-clipping doesn't know about transforms).
    const inputs: { id: NodeId; rings: FlatRing[] }[] = [];
    for (const id of this.nodeIds) {
      const node = findNodeById(doc.root, id);
      if (node === null) {
        return fail(`${this.label}: node "${id}" not found`);
      }
      if (node.type === 'group' || node.type === 'text' || node.type === 'image') {
        return fail(`${this.label}: type "${node.type}" not supported (skip groups/text/image)`);
      }
      const d = node.type === 'path' ? node.d : nodeToPathD(node);
      if (d === null) {
        return fail(`${this.label}: cannot compute path "d" for "${node.type}" node`);
      }
      const rings = flattenPathD(d).map((ring) => applyTransform2D(ring, node.transform));
      inputs.push({ id, rings });
    }

    // Run the boolean op. `runOp` receives all inputs at once and
    // returns per-region results — each region carrying an optional
    // `styleSourceIdx` so Divide can give each piece the style of
    // its originating input.
    let regions: readonly PathfinderRegion[];
    try {
      regions = this.runOp(inputs.map((i) => i.rings));
    } catch (e) {
      return fail(`${this.label}: polygon op failed — ${stringifyError(e)}`);
    }

    // EMPTY RESULT → remove all inputs (operand A's "place" disappears).
    if (regions.length === 0) {
      let nextRoot = doc.root;
      for (const input of inputs) {
        nextRoot = removeNode(nextRoot, input.id);
      }
      ctx.state.setDocument({ ...doc, root: nextRoot });
      return ok();
    }

    // The first input becomes the result holder; others are removed.
    const operandA = findNodeById(doc.root, inputs[0]!.id);
    if (operandA === null) return fail(`${this.label}: operand A vanished`);

    // Resolve each input's style/metadata (cached for the loop below).
    const inputStyles: { style: SvgNode['style']; metadata: SvgNode['metadata'] }[] = [];
    for (const inp of inputs) {
      const node = findNodeById(doc.root, inp.id);
      if (node === null) {
        // Shouldn't happen — we resolved all ids in the gather pass —
        // but be defensive (and fall back to operand A's style).
        inputStyles.push({ style: operandA.style, metadata: operandA.metadata });
      } else {
        inputStyles.push({ style: node.style, metadata: node.metadata });
      }
    }

    // Build the new path(s). For single-result ops (union/intersect/
    // subtract/exclude), one path. For divide, N paths each potentially
    // styled like a different input (Illustrator-style provenance).
    const newPathNodes: SvgNode[] = regions.map((region, idx) => {
      const d = ringsToPathD(region.rings);
      const fresh = createPath(d);
      // Style source: explicit `styleSourceIdx` from runOp wins; falls
      // back to operand A. Out-of-range indices defensively snap to A.
      const srcIdx =
        typeof region.styleSourceIdx === 'number' &&
        region.styleSourceIdx >= 0 &&
        region.styleSourceIdx < inputStyles.length
          ? region.styleSourceIdx
          : 0;
      const src = inputStyles[srcIdx]!;
      // Keep operand A's id on the FIRST result (so refs survive);
      // subsequent results get fresh ids.
      return {
        ...fresh,
        id: idx === 0 ? operandA.id : fresh.id,
        // The result rings are already in operand A's parent frame —
        // we baked the transform during input prep, so clear it.
        transform: [1, 0, 0, 1, 0, 0],
        style: src.style,
        metadata: idx === 0 ? operandA.metadata : src.metadata,
      };
    });

    // Build the next tree: replace operand A's geometry, remove other
    // operands, then insert any extra result nodes as siblings.
    //
    // **Why remove+insert for operand A** (instead of updateNode):
    // operand A may be a non-path leaf (rect/ellipse/etc) and
    // `updateNode` rejects type changes by design. Pair-replace at
    // the same index keeps z-order intact regardless of source type.
    const parentA = findParent(doc.root, operandA.id);
    if (parentA === null) return fail(`${this.label}: operand A has no parent`);
    const aIdx = parentA.children.findIndex((c) => c.id === operandA.id);
    if (aIdx < 0) return fail(`${this.label}: operand A index lookup failed`);
    let nextRoot = removeNode(doc.root, operandA.id);
    nextRoot = insertNode(nextRoot, parentA.id, newPathNodes[0]!, aIdx);
    for (let i = 1; i < inputs.length; i++) {
      nextRoot = removeNode(nextRoot, inputs[i]!.id);
    }
    if (newPathNodes.length > 1) {
      // After the removes, operand A's index may have shifted; re-scan.
      const parent = findParent(nextRoot, operandA.id);
      if (parent !== null) {
        const newAIdx = parent.children.findIndex((c) => c.id === operandA.id);
        for (let i = newPathNodes.length - 1; i >= 1; i--) {
          nextRoot = insertNode(nextRoot, parent.id, newPathNodes[i]!, newAIdx + i);
        }
      }
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousRootSnapshot === null) {
      return fail(`${this.label} undo: nothing captured`);
    }
    const snap = this.previousRootSnapshot;
    if (snap.type !== 'group') {
      return fail(`${this.label} undo: snapshot root not a group`);
    }
    const doc = ctx.state.document();
    ctx.state.setDocument({ ...doc, root: snap });
    return ok();
  }
}

/** UNION — A ∪ B (∪ ...). Merges overlapping shapes into one. */
export class UnionCommand extends PathfinderCommand {
  readonly label = 'Union';
  runOp(rings: readonly (readonly FlatRing[])[]): readonly PathfinderRegion[] {
    const args = rings.map(toPCPoly);
    const result = polygonClipping.union(args[0]!, ...args.slice(1));
    // Single-op: all result polygons share operand A's style (default).
    return result.map((poly) => ({ rings: fromPCPoly(poly) }));
  }
}

/** INTERSECT — A ∩ B (∩ ...). Keeps only the overlapping region. */
export class IntersectCommand extends PathfinderCommand {
  readonly label = 'Intersect';
  runOp(rings: readonly (readonly FlatRing[])[]): readonly PathfinderRegion[] {
    const args = rings.map(toPCPoly);
    const result = polygonClipping.intersection(args[0]!, ...args.slice(1));
    return result.map((poly) => ({ rings: fromPCPoly(poly) }));
  }
}

/** SUBTRACT — A \ B (\ C ...). Removes other shapes' area from A. */
export class SubtractCommand extends PathfinderCommand {
  readonly label = 'Subtract';
  runOp(rings: readonly (readonly FlatRing[])[]): readonly PathfinderRegion[] {
    const args = rings.map(toPCPoly);
    const result = polygonClipping.difference(args[0]!, ...args.slice(1));
    return result.map((poly) => ({ rings: fromPCPoly(poly) }));
  }
}

/** EXCLUDE — symmetric difference. Keeps non-overlapping areas. */
export class ExcludeCommand extends PathfinderCommand {
  readonly label = 'Exclude';
  runOp(rings: readonly (readonly FlatRing[])[]): readonly PathfinderRegion[] {
    const args = rings.map(toPCPoly);
    const result = polygonClipping.xor(args[0]!, ...args.slice(1));
    return result.map((poly) => ({ rings: fromPCPoly(poly) }));
  }
}

/**
 * DIVIDE — splits all inputs into non-overlapping regions. Returns
 * N paths (one per resulting region). Each "private" region (the
 * part of input `i` that no other input overlaps) inherits input
 * `i`'s style — Illustrator's behaviour. Pairwise intersection
 * regions (where the divider sliced through two operands) fall
 * back to operand A's style: there's no single "winner" so the
 * canvas-anchor convention applies.
 */
export class DivideCommand extends PathfinderCommand {
  readonly label = 'Divide';
  runOp(rings: readonly (readonly FlatRing[])[]): readonly PathfinderRegion[] {
    // Divide ≈ xor + each input's intersection with the rest.
    // Easier: compute the union, then for each region between the
    // inputs, take its difference with the union of all others.
    // Implementation: emit each input as-is (already non-overlapping
    // after we subtract the others). polygon-clipping has no `divide`,
    // so we build it on top.
    const args = rings.map(toPCPoly);
    const out: PathfinderRegion[] = [];
    // For each input, subtract the others to get its "private" region
    // (the part that doesn't overlap any other input). Each such region
    // becomes one or more result polygons. Tag with `styleSourceIdx: i`
    // so the executor applies input `i`'s style — that's the Illustrator
    // "each piece keeps its origin colour" semantic.
    for (let i = 0; i < args.length; i++) {
      const others = args.filter((_, j) => j !== i);
      const priv: polygonClipping.MultiPolygon =
        others.length === 0 ? [args[i]!] : polygonClipping.difference(args[i]!, ...others);
      for (const poly of priv) {
        out.push({ rings: fromPCPoly(poly), styleSourceIdx: i });
      }
    }
    // Also emit each pairwise intersection as a separate region — that's
    // the part where the divider sliced through two operands. No
    // `styleSourceIdx`: the executor defaults to operand A's style for
    // these shared slivers (Illustrator gives the top operand's fill).
    for (let i = 0; i < args.length; i++) {
      for (let j = i + 1; j < args.length; j++) {
        const inter = polygonClipping.intersection(args[i]!, args[j]!);
        for (const poly of inter) {
          out.push({ rings: fromPCPoly(poly) });
        }
      }
    }
    return out;
  }
}

// ── Conversion helpers (PC = polygon-clipping types) ────────────────

/** Convert our FlatRing[] → polygon-clipping's `Polygon` (rings of [x,y]). */
function toPCPoly(rings: readonly FlatRing[]): polygonClipping.Polygon {
  return rings.map((ring) => ring.map((p) => [p.x, p.y] as polygonClipping.Pair));
}

/** Convert polygon-clipping's `Polygon` → our FlatRing[]. */
function fromPCPoly(poly: polygonClipping.Polygon): FlatRing[] {
  return poly.map((ring) => ring.map(([x, y]) => ({ x, y })));
}

/** Apply a 2D affine transform to every point in a ring. */
function applyTransform2D(ring: FlatRing, t: import('../types/transform').Transform): FlatRing {
  const [a, b, c, d, e, f] = t;
  return ring.map((p) => ({ x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f }));
}

function stringifyError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
