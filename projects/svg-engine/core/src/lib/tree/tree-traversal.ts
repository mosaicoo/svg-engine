import type { GroupNode } from '../model/group-node';
import { isGroupNode, type SvgNode } from '../model/svg-node';

/**
 * Visit every node in `root` in pre-order (parent before children).
 * Returning `false` from the visitor short-circuits the entire traversal;
 * any other return value (including `void`) continues.
 */
export function walk(root: GroupNode, visitor: (node: SvgNode) => boolean | void): void {
  walkInternal(root, visitor);
}

function walkInternal(node: SvgNode, visitor: (node: SvgNode) => boolean | void): boolean {
  if (visitor(node) === false) return false;
  if (isGroupNode(node)) {
    for (const child of node.children) {
      if (walkInternal(child, visitor) === false) return false;
    }
  }
  return true;
}

/** Collect every node in `root` into a flat array (pre-order). */
export function collectNodes(root: GroupNode): readonly SvgNode[] {
  const result: SvgNode[] = [];
  walk(root, (node) => {
    result.push(node);
  });
  return result;
}

/**
 * Count nodes in the subtree rooted at `root`. By default the root group
 * itself is included; pass `{ includeRoot: false }` to count descendants only.
 */
export function countNodes(
  root: GroupNode,
  options: { readonly includeRoot?: boolean } = {},
): number {
  const includeRoot = options.includeRoot ?? true;
  let count = includeRoot ? 0 : -1;
  walk(root, () => {
    count += 1;
  });
  return count;
}
