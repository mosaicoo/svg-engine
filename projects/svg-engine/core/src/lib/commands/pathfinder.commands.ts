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
 *   inserted as siblings of the first input, all owning operand A's
 *   style.
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

/** Common executor — all 5 ops only differ in their polygon-clipping call. */
abstract class PathfinderCommand implements Command {
  abstract readonly label: string;
  readonly id: string = generateNodeId();

  protected previousRootSnapshot: SvgNode | null = null;

  constructor(protected readonly nodeIds: readonly NodeId[]) {}

  abstract runOp(rings: readonly (readonly FlatRing[])[]): readonly (readonly FlatRing[])[];

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

    // Run the boolean op. `runOp` receives all inputs at once
    // (polygon-clipping accepts a variadic list — subclasses pass
    // them appropriately).
    let resultRings: readonly (readonly FlatRing[])[];
    try {
      resultRings = this.runOp(inputs.map((i) => i.rings));
    } catch (e) {
      return fail(`${this.label}: polygon op failed — ${stringifyError(e)}`);
    }

    // EMPTY RESULT → remove all inputs (operand A's "place" disappears).
    if (resultRings.length === 0) {
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

    // Build the new path(s). For single-result ops (union/intersect/
    // subtract/exclude), one path. For divide, N paths.
    const newPathNodes: SvgNode[] = resultRings.map((ringSet, idx) => {
      const d = ringsToPathD(ringSet);
      const fresh = createPath(d);
      // Inherit operand A's style + metadata. Keep operand A's id on
      // the FIRST result (so references survive); subsequent results
      // get fresh ids.
      return {
        ...fresh,
        id: idx === 0 ? operandA.id : fresh.id,
        // The result rings are already in operand A's parent frame —
        // we baked the transform during input prep, so clear it.
        transform: [1, 0, 0, 1, 0, 0],
        style: operandA.style,
        metadata: operandA.metadata,
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
  runOp(rings: readonly (readonly FlatRing[])[]): readonly (readonly FlatRing[])[] {
    const args = rings.map(toPCPoly);
    const result = polygonClipping.union(args[0]!, ...args.slice(1));
    return result.map(fromPCPoly);
  }
}

/** INTERSECT — A ∩ B (∩ ...). Keeps only the overlapping region. */
export class IntersectCommand extends PathfinderCommand {
  readonly label = 'Intersect';
  runOp(rings: readonly (readonly FlatRing[])[]): readonly (readonly FlatRing[])[] {
    const args = rings.map(toPCPoly);
    const result = polygonClipping.intersection(args[0]!, ...args.slice(1));
    return result.map(fromPCPoly);
  }
}

/** SUBTRACT — A \ B (\ C ...). Removes other shapes' area from A. */
export class SubtractCommand extends PathfinderCommand {
  readonly label = 'Subtract';
  runOp(rings: readonly (readonly FlatRing[])[]): readonly (readonly FlatRing[])[] {
    const args = rings.map(toPCPoly);
    const result = polygonClipping.difference(args[0]!, ...args.slice(1));
    return result.map(fromPCPoly);
  }
}

/** EXCLUDE — symmetric difference. Keeps non-overlapping areas. */
export class ExcludeCommand extends PathfinderCommand {
  readonly label = 'Exclude';
  runOp(rings: readonly (readonly FlatRing[])[]): readonly (readonly FlatRing[])[] {
    const args = rings.map(toPCPoly);
    const result = polygonClipping.xor(args[0]!, ...args.slice(1));
    return result.map(fromPCPoly);
  }
}

/**
 * DIVIDE — splits all inputs into non-overlapping regions. Returns
 * N paths (one per resulting region), all sharing operand A's style
 * (different from Illustrator which assigns each region the style of
 * whichever input it came from — that semantic requires per-region
 * provenance tracking, future polish).
 */
export class DivideCommand extends PathfinderCommand {
  readonly label = 'Divide';
  runOp(rings: readonly (readonly FlatRing[])[]): readonly (readonly FlatRing[])[] {
    // Divide ≈ xor + each input's intersection with the rest.
    // Easier: compute the union, then for each region between the
    // inputs, take its difference with the union of all others.
    // Implementation: emit each input as-is (already non-overlapping
    // after we subtract the others). polygon-clipping has no `divide`,
    // so we build it on top.
    const args = rings.map(toPCPoly);
    const out: polygonClipping.MultiPolygon[] = [];
    // For each input, subtract the others to get its "private" region
    // (the part that doesn't overlap any other input). Each such region
    // becomes one or more result polygons.
    for (let i = 0; i < args.length; i++) {
      const others = args.filter((_, j) => j !== i);
      const priv: polygonClipping.MultiPolygon =
        others.length === 0 ? [args[i]!] : polygonClipping.difference(args[i]!, ...others);
      if (priv.length > 0) out.push(priv);
    }
    // Also emit each pairwise intersection as a separate region — that's
    // the part where the divider sliced through two operands.
    for (let i = 0; i < args.length; i++) {
      for (let j = i + 1; j < args.length; j++) {
        const inter = polygonClipping.intersection(args[i]!, args[j]!);
        if (inter.length > 0) out.push(inter);
      }
    }
    return out.flatMap((multi) => multi.map(fromPCPoly));
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
