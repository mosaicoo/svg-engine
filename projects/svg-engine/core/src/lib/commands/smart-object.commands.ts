import type { GroupNode } from '../model/group-node';
import { createGroup } from '../model/node-factory';
import { isSmartObject, withSmartObjectFlag } from '../model/smart-object';
import type { SvgNode } from '../model/svg-node';
import { findNodeById, findParent, insertNode, removeNode, updateNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * **D-074 — Smart Object commands.** Four operations matching the
 * Photoshop convention:
 *
 * 1. **MakeSmartObjectCommand** — wrap 1+ selected nodes in a
 *    smart-object group. Replaces the originals with the wrapper at
 *    the position of the first node. Inverse: Rasterize.
 *
 * 2. **RasterizeSmartObjectCommand** — drop the smart-object flag
 *    AND unwrap the children into the parent (matches Photoshop's
 *    "Rasterize Smart Object" which dissolves the container). Inverse:
 *    Make again (manual — user reselects + Make).
 *
 * 3. **EditSmartObjectContentsCommand** — replace the children
 *    array with new content (parsed from edited SVG source or
 *    user-supplied node list). Wrapper transform/style/name preserved.
 *
 * 4. **ReplaceSmartObjectContentsCommand** — semantically identical
 *    to Edit (replaces children); separate name to mark intent in
 *    history (e.g., "Replaced from logo-v2.svg" vs "Edited Smart
 *    Object source"). Same internal implementation.
 *
 * All commands carry a `previousRootSnapshot` so `undo()` is a single
 * `setDocument(snap)` — preserves reference equality on the unaffected
 * subtrees (structural sharing keeps memory cost cheap).
 *
 * **Why all four (not just Make + Rasterize)**: professional editors
 * separate "Edit Contents" from "Replace Contents" because the
 * history label tells the user where the change came from. Squashing
 * both into one would lose that intent.
 */

/**
 * Wrap one or more existing nodes in a Smart Object container. The
 * wrapper replaces the input nodes at the position of the first one;
 * the other nodes are pulled in as additional children (preserving
 * their internal transform/style).
 *
 * **Why "1 or more"** (not "always multi"): a single shape that the
 * user "wants to treat as an imported asset" is a valid case (e.g.,
 * a complex path glued together earlier). Photoshop's Convert to
 * Smart Object also accepts a single layer.
 *
 * Rejects:
 * - Empty `nodeIds` (no-op handled at dispatch — fail with descriptive
 *   message rather than silently succeed).
 * - Mismatched parents (selection spans two different parents). The
 *   wrapper would have to pick one to host it; ambiguous. Matches
 *   Photoshop, which requires the layers to be siblings to merge.
 * - Any node id not found in the tree.
 */
export class MakeSmartObjectCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Convert to Smart Object';

  private previousRootSnapshot: SvgNode | null = null;
  /** Id of the wrapper created — exposed so callers (UI) can select it. */
  private createdWrapperId: NodeId | null = null;

  constructor(
    private readonly nodeIds: readonly NodeId[],
    /** Optional human name; defaults to `"Smart Object N"`. */
    private readonly name?: string,
  ) {}

  execute(ctx: CommandContext): CommandResult {
    if (this.nodeIds.length === 0) {
      return fail(`${this.label}: no nodes selected`);
    }
    const doc = ctx.state.document();
    // Validate every id exists + collect references (in input order).
    const targets: SvgNode[] = [];
    for (const id of this.nodeIds) {
      const node = findNodeById(doc.root, id);
      if (node === null) return fail(`${this.label}: node "${id}" not found`);
      targets.push(node);
    }
    // Validate same-parent (caller's UI should have ensured this; we
    // double-check for defensive correctness).
    const firstParent = findParent(doc.root, targets[0]!.id);
    if (firstParent === null) return fail(`${this.label}: first node has no parent`);
    for (let i = 1; i < targets.length; i++) {
      const p = findParent(doc.root, targets[i]!.id);
      if (p === null || p.id !== firstParent.id) {
        return fail(`${this.label}: all selected nodes must share the same parent`);
      }
    }
    // Remember the position of the FIRST node in its parent — the
    // wrapper will land at that index (matches Illustrator/Photoshop
    // convention: "the new wrapper appears where the first item was").
    const firstIdx = firstParent.children.findIndex((c) => c.id === targets[0]!.id);
    if (firstIdx < 0) return fail(`${this.label}: first node index lookup failed`);

    // Default name — counts existing smart objects across the tree
    // for a friendly "Smart Object 3" autonumber.
    const defaultName = this.name ?? this.defaultName(doc.root);

    this.previousRootSnapshot = doc.root;
    const wrapper = withSmartObjectFlag(createGroup(targets, { metadata: { name: defaultName } }));
    this.createdWrapperId = wrapper.id;

    // Remove originals (one by one — removeNode handles tree
    // mutation with structural sharing) then insert the wrapper at
    // the recomputed slot (firstIdx may have shifted if earlier
    // siblings were removed; clamp).
    let nextRoot = doc.root;
    for (const node of targets) {
      nextRoot = removeNode(nextRoot, node.id);
    }
    const newParent = findNodeById(nextRoot, firstParent.id);
    const newParentChildren =
      newParent !== null && newParent.type === 'group' ? newParent.children : [];
    const insertIdx = Math.min(firstIdx, newParentChildren.length);
    nextRoot = insertNode(nextRoot, firstParent.id, wrapper, insertIdx);
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

  /** Id of the wrapper this command created. Available AFTER execute(). */
  getCreatedWrapperId(): NodeId | null {
    return this.createdWrapperId;
  }

  private defaultName(root: GroupNode): string {
    let count = 0;
    const walk = (node: SvgNode): void => {
      if (isSmartObject(node)) count += 1;
      if (node.type === 'group') {
        for (const child of node.children) walk(child);
      }
    };
    walk(root);
    return `Smart Object ${count + 1}`;
  }
}

/**
 * **Rasterize Smart Object**: drop the wrapper, hoist its children
 * back into the parent at the wrapper's slot. Inverse of Make.
 *
 * Same name as Photoshop ("Rasterize Smart Object" / "Convert to
 * Layers" depending on context) — the action is structurally
 * equivalent to `UngroupCommand` PLUS clearing the smart-object
 * flag, but bundled into one labeled history entry. Affinity calls
 * it "Embedded Document ▸ Edit Document" + "Release" — same intent.
 *
 * No-op when target isn't actually a smart object (returns ok
 * without dispatching — keeps menus from accidentally rasterizing
 * a regular group).
 */
export class RasterizeSmartObjectCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Rasterize Smart Object';

  private previousRootSnapshot: SvgNode | null = null;

  constructor(private readonly nodeId: NodeId) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`${this.label}: node "${this.nodeId}" not found`);
    if (!isSmartObject(node)) return ok(); // idempotent — already not a smart object
    const parent = findParent(doc.root, this.nodeId);
    if (parent === null) return fail(`${this.label}: target has no parent`);
    const idx = parent.children.findIndex((c) => c.id === this.nodeId);
    if (idx < 0) return fail(`${this.label}: index lookup failed`);

    this.previousRootSnapshot = doc.root;

    // Remove the wrapper, then insert each child at the wrapper's
    // slot in order. Children keep their own transform/style; the
    // wrapper's transform is DISCARDED (intentional — rasterize is
    // "bake the wrapper away"). If the user wanted to preserve the
    // wrapper transform, they'd use UngroupCommand instead.
    let nextRoot = removeNode(doc.root, this.nodeId);
    for (let i = 0; i < node.children.length; i++) {
      nextRoot = insertNode(nextRoot, parent.id, node.children[i]!, idx + i);
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

/**
 * **Edit Smart Object Contents**: replace the children array of a
 * smart-object wrapper, preserving the wrapper's id / transform /
 * style / metadata. Used by "Edit Contents" UI when the user closes
 * the source editor with new content.
 *
 * The `newChildren` is normally derived from re-parsing user-edited
 * SVG text (importer turns SVG into nodes; the children get
 * splice'd in). Caller is responsible for the parsing — this command
 * just takes the resulting nodes.
 *
 * Fails on non-smart-object target (so an accidental dispatch on a
 * plain group doesn't silently mutate it).
 */
export class EditSmartObjectContentsCommand implements Command {
  readonly id: string = generateNodeId();
  // Typed as `string` (not the literal) so subclasses can narrow it
  // with their own constant label without TS variance errors.
  readonly label: string = 'Edit Smart Object Contents';

  protected previousRootSnapshot: SvgNode | null = null;

  constructor(
    private readonly nodeId: NodeId,
    protected readonly newChildren: readonly SvgNode[],
  ) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`${this.label}: node "${this.nodeId}" not found`);
    if (!isSmartObject(node)) {
      return fail(`${this.label}: target "${this.nodeId}" is not a smart object`);
    }
    this.previousRootSnapshot = doc.root;
    const nextRoot = updateNode<GroupNode>(doc.root, this.nodeId, (g) => ({
      ...g,
      children: this.newChildren,
    }));
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
 * **Replace Smart Object Contents**: same mechanics as
 * {@link EditSmartObjectContentsCommand} but with a label that
 * tells the user the change came from an external file. The history
 * entry "Replace Smart Object Contents" reads differently from
 * "Edit Smart Object Contents" — both convey real intent.
 *
 * The classes are kept distinct (vs adding a `label` constructor
 * arg to EditCommand) so consumers can detect the operation via
 * `instanceof` and run side-effects (e.g., recording the source
 * file path in a future "Linked Smart Objects" extension).
 */
export class ReplaceSmartObjectContentsCommand extends EditSmartObjectContentsCommand {
  override readonly label = 'Replace Smart Object Contents';
}
