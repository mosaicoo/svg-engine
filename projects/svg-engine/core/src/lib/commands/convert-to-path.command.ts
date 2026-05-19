import { createPath } from '../model/node-factory';
import type { PathNode } from '../model/path-node';
import type { SvgNode } from '../model/svg-node';
import { findNodeById, findParent, insertNode, removeNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Convert a non-path leaf node (rect, ellipse, line, polygon,
 * polyline) into an equivalent `<path>` so that downstream tools
 * (anchor editor, Pathfinder boolean ops) can operate uniformly on
 * curves regardless of the authored type.
 *
 * **Conversion math** (each shape → exact `d` string):
 * - `rect(x, y, w, h)` → `M x y L (x+w) y L (x+w) (y+h) L x (y+h) Z`
 *   (`rx`/`ry` rounded corners NOT supported in v1 — a future polish
 *   would emit 4 cubic beziers at each corner)
 * - `ellipse(cx, cy, rx, ry)` → 4 cubic beziers using the Kappa
 *   constant (0.5522847) for visually-perfect approximation
 * - `line(x1, y1, x2, y2)` → `M x1 y1 L x2 y2` (open, not closed)
 * - `polygon(points)` → `M p0 L p1 ... L pn Z`
 * - `polyline(points)` → `M p0 L p1 ... L pn` (open)
 *
 * **Preserved across conversion**: `transform`, `style`, `metadata`.
 * **Lost**: type-specific authored fields (rect width vs path d) —
 * obvious from the model change.
 *
 * **No-op for group / text / image / path**: those types aren't
 * convertible to a geometric path equivalent here. Group conversion
 * (flatten subtree to compound path) is a future Pathfinder extension.
 *
 * **Undo**: snapshots the previous node and restores it on undo.
 */
export class ConvertNodeToPathCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Convert to path';

  private previousNode: SvgNode | null = null;
  private previousParentId: NodeId | null = null;
  private previousIndex = -1;

  constructor(private readonly nodeId: NodeId) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const target = findNodeById(doc.root, this.nodeId);
    if (target === null) {
      return fail(`ConvertNodeToPathCommand: node "${this.nodeId}" not found`);
    }
    if (
      target.type === 'path' ||
      target.type === 'group' ||
      target.type === 'text' ||
      target.type === 'image'
    ) {
      return fail(`ConvertNodeToPathCommand: type "${target.type}" not convertible to path`);
    }
    const parent = findParent(doc.root, this.nodeId);
    if (parent === null) {
      return fail(`ConvertNodeToPathCommand: node "${this.nodeId}" has no parent (root?)`);
    }
    const index = parent.children.findIndex((c) => c.id === this.nodeId);
    if (index < 0) {
      return fail(`ConvertNodeToPathCommand: index lookup failed for "${this.nodeId}"`);
    }
    const d = nodeToPathD(target);
    if (d === null) {
      return fail(`ConvertNodeToPathCommand: failed to compute "d" for type "${target.type}"`);
    }
    // Snapshot BEFORE mutation so undo restores the exact predecessor
    // node + its z-order slot.
    this.previousNode = target;
    this.previousParentId = parent.id;
    this.previousIndex = index;

    // Build the replacement path. **Keep the same id** so external
    // references (selection, layer panel expansion, animation pointers)
    // survive the conversion.
    const fresh = createPath(d);
    const next: PathNode = {
      ...fresh,
      id: target.id,
      transform: target.transform,
      style: target.style,
      metadata: target.metadata,
    };

    // **Why remove+insert instead of updateNode**: `updateNode`
    // explicitly forbids changing `type` (asserts to prevent
    // accidental type swaps in mutation closures). The
    // pair-replace is the canonical "change type" surgery and lets
    // us put the new node back at the exact index so z-order stays
    // intact.
    const afterRemove = removeNode(doc.root, this.nodeId);
    if (afterRemove === doc.root) {
      return fail(`ConvertNodeToPathCommand: remove failed for "${this.nodeId}"`);
    }
    const nextRoot = insertNode(afterRemove, parent.id, next, index);
    if (nextRoot === afterRemove) {
      return fail(`ConvertNodeToPathCommand: insert failed for "${this.nodeId}"`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousNode === null || this.previousParentId === null || this.previousIndex < 0) {
      return fail('ConvertNodeToPathCommand undo: nothing captured');
    }
    const doc = ctx.state.document();
    // Remove the path we put in, then re-insert the original node
    // at its captured index — z-order restored exactly.
    const afterRemove = removeNode(doc.root, this.nodeId);
    if (afterRemove === doc.root) {
      return fail(`ConvertNodeToPathCommand undo: remove failed for "${this.nodeId}"`);
    }
    const nextRoot = insertNode(
      afterRemove,
      this.previousParentId,
      this.previousNode,
      this.previousIndex,
    );
    if (nextRoot === afterRemove) {
      return fail(`ConvertNodeToPathCommand undo: insert failed for "${this.nodeId}"`);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }
}

/**
 * Build a path `d` string equivalent to the given shape node.
 * Exported for tests + reuse by Pathfinder commands which need to
 * "virtually" convert without dispatching a real command.
 */
export function nodeToPathD(node: SvgNode): string | null {
  switch (node.type) {
    case 'rect': {
      const { x, y, width, height } = node;
      // Note: rx/ry rounded corners ignored in v1.
      const x2 = x + width;
      const y2 = y + height;
      return `M${fmt(x)} ${fmt(y)} L${fmt(x2)} ${fmt(y)} L${fmt(x2)} ${fmt(y2)} L${fmt(x)} ${fmt(y2)} Z`;
    }
    case 'ellipse': {
      const { cx, cy, rx, ry } = node;
      // 4 cubic beziers approximating an ellipse. The Kappa constant
      // (4/3 · (sqrt(2) − 1)) gives the offset of control points
      // from the cardinal axes for a near-perfect circle approximation
      // (max error ≈ 0.027% of radius).
      const k = 0.5522847498307933;
      const ox = rx * k;
      const oy = ry * k;
      const x0 = cx - rx;
      const x1 = cx + rx;
      const y0 = cy - ry;
      const y1 = cy + ry;
      return (
        `M${fmt(x0)} ${fmt(cy)}` +
        ` C${fmt(x0)} ${fmt(cy - oy)} ${fmt(cx - ox)} ${fmt(y0)} ${fmt(cx)} ${fmt(y0)}` +
        ` C${fmt(cx + ox)} ${fmt(y0)} ${fmt(x1)} ${fmt(cy - oy)} ${fmt(x1)} ${fmt(cy)}` +
        ` C${fmt(x1)} ${fmt(cy + oy)} ${fmt(cx + ox)} ${fmt(y1)} ${fmt(cx)} ${fmt(y1)}` +
        ` C${fmt(cx - ox)} ${fmt(y1)} ${fmt(x0)} ${fmt(cy + oy)} ${fmt(x0)} ${fmt(cy)}` +
        ` Z`
      );
    }
    case 'line': {
      const { x1, y1, x2, y2 } = node;
      return `M${fmt(x1)} ${fmt(y1)} L${fmt(x2)} ${fmt(y2)}`;
    }
    case 'polygon':
    case 'polyline': {
      const pts = node.points;
      if (pts.length === 0) return null;
      const parts = [`M${fmt(pts[0]!.x)} ${fmt(pts[0]!.y)}`];
      for (let i = 1; i < pts.length; i++) {
        parts.push(`L${fmt(pts[i]!.x)} ${fmt(pts[i]!.y)}`);
      }
      if (node.type === 'polygon') parts.push('Z');
      return parts.join(' ');
    }
    default:
      return null;
  }
}

function fmt(n: number): string {
  return Number.isInteger(n) ? `${n}` : Number(n.toFixed(4)).toString();
}
