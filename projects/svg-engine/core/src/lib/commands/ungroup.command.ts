import type { GroupNode } from '../model/group-node';
import { createGroup } from '../model/node-factory';
import { isGroupNode, type SvgNode } from '../model/svg-node';
import { findNodeById, findParent, insertNode, removeNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { IDENTITY_TRANSFORM, multiply } from '../types/transform';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';

/**
 * Dissolve a `GroupNode` by promoting its children to its own parent
 * (categoria de edição padrão de mercado — Figma/Affinity Cmd+Shift+G).
 *
 * **Position semantics**: the promoted children land at the index the
 * group occupied — preserving visual stacking. Order among promoted
 * children matches the group's `children` array (top child stays on
 * top after ungrouping).
 *
 * **Group transform IS BAKED into children** (Item 4 — débito 4h).
 * Previously the group's transform was dropped, breaking visual
 * fidelity for any non-identity group. Now each child's transform
 * is replaced with `multiply(group.transform, child.transform)` so
 * the post-ungroup render is byte-identical to the pre-ungroup render.
 * Identity group → bake is a no-op (`multiply(I, X) === X`).
 *
 * Group `style` is still dropped (children that didn't have explicit
 * style inherited from the group via CSS — we don't currently model
 * cascading inheritance, so dropping is the lesser evil). Affects
 * very few real cases since style on a `<g>` is uncommon.
 *
 * **Cannot ungroup the root**: the document root is itself a
 * `GroupNode` but has no parent — ungrouping it would orphan all
 * top-level shapes. Attempt → `fail()`.
 *
 * **Undo**: re-creates the group with the SAME id (so any external
 * references survive), re-attaches the children with their ORIGINAL
 * (pre-bake) transforms, and re-inserts the group at its original index.
 */
export class UngroupCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Ungroup';

  private parentId: NodeId | null = null;
  private originalIndex = -1;
  private originalGroup: GroupNode | null = null;

  constructor(private readonly groupId: NodeId) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    if (this.groupId === doc.root.id) {
      return fail('UngroupCommand: cannot ungroup the document root');
    }
    const target = findNodeById(doc.root, this.groupId);
    if (target === null) {
      return fail(`UngroupCommand: group "${this.groupId}" not found`);
    }
    if (!isGroupNode(target)) {
      return fail(`UngroupCommand: node "${this.groupId}" is not a group`);
    }
    const parent = findParent(doc.root, this.groupId);
    if (parent === null) {
      return fail(`UngroupCommand: group "${this.groupId}" has no parent`);
    }
    const indexInParent = parent.children.findIndex((c) => c.id === this.groupId);
    if (indexInParent < 0) {
      return fail(`UngroupCommand: failed to locate group within parent`);
    }

    // Snapshot for undo BEFORE any mutation.
    this.parentId = parent.id;
    this.originalIndex = indexInParent;
    this.originalGroup = target;

    // Remove the group, then re-insert each child at the captured index
    // in order (each subsequent child goes to index + 1 to keep them
    // contiguous and ordered).
    //
    // BAKE the group's transform into each child (Item 4 — débito 4h):
    // `child.transform := multiply(group.transform, child.transform)`.
    // When group is identity, this short-circuits to the child's own
    // transform unchanged (`multiply(I, X)` produces a fresh matrix
    // structurally equal to X but not ref-equal — skip the copy in
    // the identity case for performance + ref-stability).
    const groupTransform = target.transform;
    const isIdentity = isIdentityTransform(groupTransform);
    let root = removeNode(doc.root, this.groupId);
    if (root === doc.root) {
      return fail(`UngroupCommand: failed to detach group "${this.groupId}"`);
    }
    const children: readonly SvgNode[] = (target as GroupNode).children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      const baked: SvgNode = isIdentity
        ? child
        : { ...child, transform: multiply(groupTransform, child.transform) };
      try {
        root = insertNode(root, parent.id, baked, indexInParent + i);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.parentId === null || this.originalGroup === null) {
      return fail('UngroupCommand undo: nothing captured (was execute called?)');
    }
    const doc = ctx.state.document();
    // Detach each child (they're currently siblings under parentId,
    // possibly with the BAKED transforms applied at execute-time —
    // we look them up by id, not by reference).
    let root = doc.root;
    for (const child of this.originalGroup.children) {
      const after = removeNode(root, child.id);
      if (after === root) {
        return fail(`UngroupCommand undo: child "${child.id}" not found`);
      }
      root = after;
    }
    // Re-create the group with original id + transform + style; reuse
    // the captured children array (with their PRE-bake transforms) so
    // the undo restores the exact pre-execute state.
    const restored = createGroup(this.originalGroup.children, {
      id: this.originalGroup.id,
      transform: this.originalGroup.transform,
      style: this.originalGroup.style,
      metadata: this.originalGroup.metadata,
    });
    try {
      root = insertNode(root, this.parentId, restored, this.originalIndex);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
    ctx.state.setDocument({ ...doc, root });
    return ok();
  }
}

/** Cheap identity check — avoids allocating a `multiply()` matrix for the no-op case. */
function isIdentityTransform(t: readonly number[]): boolean {
  return (
    t[0] === IDENTITY_TRANSFORM[0] &&
    t[1] === IDENTITY_TRANSFORM[1] &&
    t[2] === IDENTITY_TRANSFORM[2] &&
    t[3] === IDENTITY_TRANSFORM[3] &&
    t[4] === IDENTITY_TRANSFORM[4] &&
    t[5] === IDENTITY_TRANSFORM[5]
  );
}
