import type { GroupNode } from '../model/group-node';
import { isGroupNode, type SvgNode } from '../model/svg-node';
import type { NodeId } from '../types/node-id';

/**
 * Pure, immutable operations over an SVG node tree rooted at a
 * {@link GroupNode}. Every operation that does not find its target
 * returns the **same** root reference (use `===` to detect a no-op).
 * On success a new tree is returned with structural sharing: only the
 * path from root to the affected node is reallocated.
 */

/** Recursively find a node by id. Returns `null` when absent. */
export function findNodeById(root: GroupNode, id: NodeId): SvgNode | null {
  if (root.id === id) return root;
  for (const child of root.children) {
    if (child.id === id) return child;
    if (isGroupNode(child)) {
      const found = findNodeById(child, id);
      if (found !== null) return found;
    }
  }
  return null;
}

/** Find the parent group of a node by the child's id. `null` for root or absent. */
export function findParent(root: GroupNode, childId: NodeId): GroupNode | null {
  for (const child of root.children) {
    if (child.id === childId) return root;
    if (isGroupNode(child)) {
      const parent = findParent(child, childId);
      if (parent !== null) return parent;
    }
  }
  return null;
}

/**
 * Insert `node` as a child of the group identified by `parentId`. When
 * `index` is omitted the node is appended; otherwise it is spliced at the
 * given position (clamped to `[0, parent.children.length]`).
 *
 * Returns the same `root` reference if `parentId` is not a group in the
 * tree. Throws when `node.id` already exists anywhere in the tree.
 */
export function insertNode(
  root: GroupNode,
  parentId: NodeId,
  node: SvgNode,
  index?: number,
): GroupNode {
  if (findNodeById(root, node.id) !== null) {
    throw new Error(`insertNode: node id "${node.id}" already exists in tree`);
  }
  const result = mapGroup(root, (group) => {
    if (group.id !== parentId) return null;
    const at = clampIndex(index ?? group.children.length, group.children.length);
    const nextChildren = [...group.children.slice(0, at), node, ...group.children.slice(at)];
    return { ...group, children: nextChildren };
  });
  return result;
}

/**
 * Remove the node identified by `id`. Returns the same `root` reference if
 * no such node exists. The root group itself cannot be removed (returns
 * `root` unchanged).
 */
export function removeNode(root: GroupNode, id: NodeId): GroupNode {
  if (root.id === id) return root;
  return mapGroup(root, (group) => {
    const idx = group.children.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    const nextChildren = [...group.children.slice(0, idx), ...group.children.slice(idx + 1)];
    return { ...group, children: nextChildren };
  });
}

/**
 * Apply `updater` to the node identified by `id`. The updater receives the
 * current node and must return its replacement (with the **same** `id` and
 * `type` — enforced at runtime). Returns the same `root` if `id` is absent
 * or if the updater returns the same reference.
 */
export function updateNode<T extends SvgNode>(
  root: GroupNode,
  id: NodeId,
  updater: (node: T) => T,
): GroupNode {
  if (root.id === id) {
    const next = updater(root as unknown as T) as unknown as GroupNode;
    return next === (root as unknown as T) ? root : next;
  }
  return mapGroup(root, (group) => {
    const idx = group.children.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    const current = group.children[idx];
    if (!current) return null;
    const next = updater(current as T) as unknown as SvgNode;
    if (next === current) return null;
    if (next.id !== current.id) {
      throw new Error(`updateNode: updater changed id (${current.id} -> ${next.id})`);
    }
    if (next.type !== current.type) {
      throw new Error(
        `updateNode: updater changed type (${current.type} -> ${next.type}); use a remove+insert pair instead`,
      );
    }
    const nextChildren = [...group.children.slice(0, idx), next, ...group.children.slice(idx + 1)];
    return { ...group, children: nextChildren };
  });
}

/**
 * Walk every {@link GroupNode} in the subtree (including `root`). The
 * mapper returns either a replacement group or `null` to leave it
 * untouched. The traversal is post-order: deeper groups are mapped before
 * their parents, so a parent mapper sees already-updated children.
 *
 * Returns `root` unchanged when no mapper invocation produced a change.
 */
function mapGroup(root: GroupNode, mapper: (group: GroupNode) => GroupNode | null): GroupNode {
  let childrenChanged = false;
  const nextChildren = root.children.map((child) => {
    if (!isGroupNode(child)) return child;
    const mapped = mapGroup(child, mapper);
    if (mapped !== child) childrenChanged = true;
    return mapped;
  });
  const intermediate: GroupNode = childrenChanged ? { ...root, children: nextChildren } : root;
  const result = mapper(intermediate);
  return result ?? intermediate;
}

function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return length;
  return Math.max(0, Math.min(Math.trunc(index), length));
}
