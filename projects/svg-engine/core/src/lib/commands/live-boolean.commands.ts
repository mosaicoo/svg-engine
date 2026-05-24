import polygonClipping from 'polygon-clipping';
import { flattenPathD, ringsToPathD } from '../geometry/path-flatten';
import { createGroup, createPath } from '../model/node-factory';
import type { GroupNode } from '../model/group-node';
import type { PathNode } from '../model/path-node';
import type { SvgNode } from '../model/svg-node';
import { findNodeById, findParent, insertNode, removeNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';
import { nodeToPathD } from './convert-to-path.command';

/**
 * **D-056 (Item 6.1)** — Boolean Live (non-destructive booleans).
 *
 * The existing {@link UnionCommand} & co. are **destructive**: they
 * replace operand A's geometry with the result and remove the other
 * operands entirely. The original shapes are gone — only undo can
 * bring them back, and even then they're not editable as the operands
 * of a live boolean.
 *
 * **Boolean Live** instead WRAPS the operands in a group with a
 * **derived result path** as the visible output. The original input
 * nodes survive as group children, hidden from rendering but still
 * present in the document tree — editable through the Layer Panel,
 * the Path Editor, etc. When an input changes, the consumer (an
 * editor lifecycle hook or an explicit "Refresh" command) re-runs
 * the boolean and updates the result path.
 *
 * **Group structure** (after `MakeLiveBooleanCommand`):
 *
 * ```
 * <group> metadata.customData.svgeLiveBoolean = 'union' | 'intersect' | ...
 *   ├── <path>  metadata.customData.svgeLiveBooleanRole = 'result' (visible)
 *   ├── <node>  metadata.customData.svgeLiveBooleanRole = 'input' (hidden)
 *   ├── <node>  metadata.customData.svgeLiveBooleanRole = 'input' (hidden)
 *   └── ...
 * ```
 *
 * The inputs carry `metadata.visible = false` so they don't paint;
 * the result path is `metadata.visible = true` and paints normally.
 *
 * **Refreshing**: `RefreshLiveBooleanCommand` accepts the group id,
 * gathers all `role === 'input'` children, re-runs the boolean (same
 * engine as the destructive Pathfinder commands), and updates the
 * `role === 'result'` child's `d`. Same one-undo semantics.
 *
 * **Releasing**: `ReleaseLiveBooleanCommand` removes the result path
 * and restores `metadata.visible = true` on every input — visually
 * identical to "never having booleaned in the first place". Inverse
 * of Make.
 *
 * **Auto-refresh** is OUT of scope for D-056. We deliberately avoid
 * wiring an `effect()` on document changes that auto-recomputes every
 * live-boolean group on every edit — that would be costly at scale
 * (every drag updates the doc). Consumers wanting auto-refresh can
 * subscribe to the document signal themselves and dispatch
 * `RefreshLiveBooleanCommand` on change debounce.
 *
 * **Why a group + metadata, not a new node type**: keeps the tree
 * shape compatible with every existing renderer/exporter/spec —
 * groups are universally understood. The `svgeLiveBoolean` marker
 * makes the semantic visible to UIs that care (Layer Panel could
 * show a special icon, Inspector could expose the operation
 * dropdown) without forcing every consumer to learn a new type.
 */

export type LiveBooleanOp = 'union' | 'intersect' | 'subtract' | 'exclude';

/**
 * `metadata.customData` keys used to mark live-boolean nodes. Exported
 * so UIs (layer panel icon, inspector controls) can detect & display
 * the special grouping without reinventing the string constants.
 */
export const LIVE_BOOLEAN_KEY = 'svgeLiveBoolean' as const;
export const LIVE_BOOLEAN_ROLE_KEY = 'svgeLiveBooleanRole' as const;

/**
 * Detect whether a group is a live-boolean wrapper. Pure read,
 * no allocations.
 */
export function isLiveBooleanGroup(node: SvgNode): node is GroupNode {
  if (node.type !== 'group') return false;
  const cd = node.metadata.customData;
  if (cd === undefined) return false;
  const op = cd[LIVE_BOOLEAN_KEY];
  return op === 'union' || op === 'intersect' || op === 'subtract' || op === 'exclude';
}

/**
 * Read the operation from a live-boolean group, or `null` if not one.
 */
export function getLiveBooleanOp(node: SvgNode): LiveBooleanOp | null {
  if (!isLiveBooleanGroup(node)) return null;
  return node.metadata.customData![LIVE_BOOLEAN_KEY] as LiveBooleanOp;
}

/**
 * Wrap N nodes in a live-boolean group with a derived result path.
 * Inputs survive as hidden children.
 */
export class MakeLiveBooleanCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label: string;

  private previousRootSnapshot: SvgNode | null = null;

  constructor(
    private readonly nodeIds: readonly NodeId[],
    private readonly op: LiveBooleanOp,
  ) {
    this.label = `Make Live ${capitalize(op)}`;
  }

  execute(ctx: CommandContext): CommandResult {
    if (this.nodeIds.length < 2) {
      return fail(`${this.label}: need at least 2 nodes`);
    }
    const doc = ctx.state.document();
    this.previousRootSnapshot = doc.root;

    const inputs: SvgNode[] = [];
    for (const id of this.nodeIds) {
      const node = findNodeById(doc.root, id);
      if (node === null) return fail(`${this.label}: node "${id}" not found`);
      if (node.type === 'group' || node.type === 'text' || node.type === 'image') {
        return fail(`${this.label}: type "${node.type}" not supported`);
      }
      inputs.push(node);
    }

    // Compute the boolean result.
    const resultD = computeBoolean(inputs, this.op);
    if (resultD === null) return fail(`${this.label}: boolean op failed`);

    // Result path inherits operand A's style; identity transform
    // (rings are baked already by computeBoolean).
    const operandA = inputs[0]!;
    const parent = findParent(doc.root, operandA.id);
    if (parent === null) return fail(`${this.label}: operand A has no parent`);
    const aIdx = parent.children.findIndex((c) => c.id === operandA.id);
    if (aIdx < 0) return fail(`${this.label}: operand A index lookup failed`);

    const freshResult = createPath(resultD);
    const resultPath: PathNode = {
      ...freshResult,
      transform: [1, 0, 0, 1, 0, 0],
      style: operandA.style,
      metadata: {
        ...operandA.metadata,
        visible: true,
        customData: {
          ...(operandA.metadata.customData ?? {}),
          [LIVE_BOOLEAN_ROLE_KEY]: 'result',
        },
      },
    };

    // Mark each input as hidden + tag role.
    const hiddenInputs: SvgNode[] = inputs.map((node) => ({
      ...node,
      metadata: {
        ...node.metadata,
        visible: false,
        customData: {
          ...(node.metadata.customData ?? {}),
          [LIVE_BOOLEAN_ROLE_KEY]: 'input',
        },
      },
    }));

    // The wrapper group: result FIRST so it paints below inputs in
    // z-order, but since inputs are hidden the order is purely
    // semantic. Putting result first lets the Layer Panel show
    // "Result" at the top — readable hierarchy.
    const wrapper = createGroup([resultPath, ...hiddenInputs], {
      metadata: {
        name: `Live ${capitalize(this.op)}`,
        customData: { [LIVE_BOOLEAN_KEY]: this.op },
      },
    });

    // Remove the original input nodes from the tree, then insert
    // the wrapper at operand A's slot. Order matters so we walk
    // ids and remove each, then insert the wrapper at the
    // (recomputed) index — operand A's slot may have shifted as
    // earlier siblings were removed.
    let nextRoot = doc.root;
    for (const inp of inputs) {
      nextRoot = removeNode(nextRoot, inp.id);
    }
    // Re-find parent in the modified tree, take the lowest valid
    // index (operand A's original index, clamped to current length).
    const newParent = findNodeById(nextRoot, parent.id);
    const newParentChildren =
      newParent !== null && newParent.type === 'group' ? newParent.children : [];
    const insertIdx = Math.min(aIdx, newParentChildren.length);
    nextRoot = insertNode(nextRoot, parent.id, wrapper, insertIdx);
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousRootSnapshot === null) return fail(`${this.label} undo: nothing captured`);
    const snap = this.previousRootSnapshot;
    if (snap.type !== 'group') return fail(`${this.label} undo: snapshot root not a group`);
    const doc = ctx.state.document();
    ctx.state.setDocument({ ...doc, root: snap });
    return ok();
  }
}

/**
 * Re-run the boolean on a live-boolean group's inputs and update the
 * result path's `d`. Call after editing an input.
 */
export class RefreshLiveBooleanCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Refresh Live Boolean';

  private previousRootSnapshot: SvgNode | null = null;

  constructor(private readonly groupId: NodeId) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const group = findNodeById(doc.root, this.groupId);
    if (group === null) return fail(`${this.label}: group "${this.groupId}" not found`);
    if (!isLiveBooleanGroup(group)) return fail(`${this.label}: not a live-boolean group`);
    const op = getLiveBooleanOp(group)!;

    // Gather inputs + locate the result child.
    const inputs: SvgNode[] = [];
    let resultIdx = -1;
    for (let i = 0; i < group.children.length; i++) {
      const child = group.children[i]!;
      const role = child.metadata.customData?.[LIVE_BOOLEAN_ROLE_KEY];
      if (role === 'input') inputs.push(child);
      else if (role === 'result') resultIdx = i;
    }
    if (inputs.length < 2) return fail(`${this.label}: not enough inputs`);
    if (resultIdx < 0) return fail(`${this.label}: no result child found`);

    const resultD = computeBoolean(inputs, op);
    if (resultD === null) return fail(`${this.label}: boolean op failed`);

    this.previousRootSnapshot = doc.root;

    const oldResult = group.children[resultIdx] as PathNode;
    const newResult: PathNode = { ...oldResult, d: resultD };
    const newChildren = group.children.map((c, i) => (i === resultIdx ? newResult : c));
    const newGroup: GroupNode = { ...group, children: newChildren };
    // Replace group in tree (single-spot mutation).
    const parent = findParent(doc.root, group.id);
    if (parent === null) return fail(`${this.label}: group has no parent`);
    const gIdx = parent.children.findIndex((c) => c.id === group.id);
    if (gIdx < 0) return fail(`${this.label}: group index lookup failed`);
    let nextRoot = removeNode(doc.root, group.id);
    nextRoot = insertNode(nextRoot, parent.id, newGroup, gIdx);
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousRootSnapshot === null) return fail(`${this.label} undo: nothing captured`);
    const snap = this.previousRootSnapshot;
    if (snap.type !== 'group') return fail(`${this.label} undo: snapshot root not a group`);
    const doc = ctx.state.document();
    ctx.state.setDocument({ ...doc, root: snap });
    return ok();
  }
}

/**
 * Unwrap a live-boolean group: remove the result path and the wrapper
 * group, restore inputs as siblings at the wrapper's slot, and reset
 * their `metadata.visible` to true. Visually equivalent to "Undo Make
 * Live Boolean" but at a fresh history step — so it survives a chain
 * of unrelated commits between Make and Release.
 */
export class ReleaseLiveBooleanCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Release Live Boolean';

  private previousRootSnapshot: SvgNode | null = null;

  constructor(private readonly groupId: NodeId) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const group = findNodeById(doc.root, this.groupId);
    if (group === null) return fail(`${this.label}: group "${this.groupId}" not found`);
    if (!isLiveBooleanGroup(group)) return fail(`${this.label}: not a live-boolean group`);

    this.previousRootSnapshot = doc.root;

    const parent = findParent(doc.root, group.id);
    if (parent === null) return fail(`${this.label}: group has no parent`);
    const gIdx = parent.children.findIndex((c) => c.id === group.id);
    if (gIdx < 0) return fail(`${this.label}: group index lookup failed`);

    // Filter out the result; keep only inputs (restore visibility).
    const restored: SvgNode[] = [];
    for (const child of group.children) {
      const role = child.metadata.customData?.[LIVE_BOOLEAN_ROLE_KEY];
      if (role === 'input') {
        const cd = { ...(child.metadata.customData ?? {}) };
        delete cd[LIVE_BOOLEAN_ROLE_KEY];
        const cleanedCD = Object.keys(cd).length > 0 ? cd : undefined;
        restored.push({
          ...child,
          metadata: {
            ...child.metadata,
            visible: true,
            customData: cleanedCD,
          },
        });
      }
      // Skip result + any unknown roles (defensive).
    }

    let nextRoot = removeNode(doc.root, group.id);
    for (let i = 0; i < restored.length; i++) {
      nextRoot = insertNode(nextRoot, parent.id, restored[i]!, gIdx + i);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousRootSnapshot === null) return fail(`${this.label} undo: nothing captured`);
    const snap = this.previousRootSnapshot;
    if (snap.type !== 'group') return fail(`${this.label} undo: snapshot root not a group`);
    const doc = ctx.state.document();
    ctx.state.setDocument({ ...doc, root: snap });
    return ok();
  }
}

// ── Internals ─────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/**
 * Run the boolean op on the given inputs and return the resulting
 * path `d`. Returns `null` on failure (malformed inputs, polygon-
 * clipping crash, unsupported type).
 *
 * Same engine the destructive Pathfinder commands use — we share the
 * flatten + polygon-clipping pipeline to guarantee the live result
 * matches the destructive one bit-for-bit.
 */
function computeBoolean(inputs: readonly SvgNode[], op: LiveBooleanOp): string | null {
  const rings: (readonly (readonly { readonly x: number; readonly y: number }[])[])[] = [];
  for (const node of inputs) {
    const d = node.type === 'path' ? node.d : nodeToPathD(node);
    if (d === null) return null;
    const flat = flattenPathD(d).map((ring) => applyTransform2D(ring, node.transform));
    rings.push(flat);
  }
  try {
    let result;
    const args = rings.map(toPCPoly);
    switch (op) {
      case 'union':
        result = polygonClipping.union(args[0]!, ...args.slice(1));
        break;
      case 'intersect':
        result = polygonClipping.intersection(args[0]!, ...args.slice(1));
        break;
      case 'subtract':
        result = polygonClipping.difference(args[0]!, ...args.slice(1));
        break;
      case 'exclude':
        result = polygonClipping.xor(args[0]!, ...args.slice(1));
        break;
    }
    // Concatenate every polygon's rings into one big `d`.
    const allRings: { readonly x: number; readonly y: number }[][] = [];
    for (const poly of result) {
      for (const ring of poly) {
        // polygon-clipping returns first/last duplicated; drop dup.
        const pts = ring.slice(0, -1).map((pt) => ({ x: pt[0]!, y: pt[1]! }));
        if (pts.length >= 3) allRings.push(pts);
      }
    }
    if (allRings.length === 0) return ''; // empty result → empty d
    return ringsToPathD(allRings);
  } catch {
    return null;
  }
}

function applyTransform2D(
  ring: readonly { readonly x: number; readonly y: number }[],
  t: readonly [number, number, number, number, number, number],
): { x: number; y: number }[] {
  const [a, b, c, dd, e, f] = t;
  return ring.map((pt) => ({ x: a * pt.x + c * pt.y + e, y: b * pt.x + dd * pt.y + f }));
}

function toPCPoly(
  rings: readonly (readonly { readonly x: number; readonly y: number }[])[],
): [number, number][][] {
  return rings.map((ring) => {
    const out: [number, number][] = ring.map((p) => [p.x, p.y]);
    // polygon-clipping wants closed (first === last).
    if (out.length > 0 && (out[0]![0] !== out.at(-1)![0] || out[0]![1] !== out.at(-1)![1])) {
      out.push([out[0]![0], out[0]![1]]);
    }
    return out;
  });
}
