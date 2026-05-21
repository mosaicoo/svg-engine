import { isGroupNode, type SvgNode } from '../model/svg-node';
import { generateNodeId } from '../types/node-id';

/**
 * Deep-clone an `SvgNode` (or any subtree) and assign **fresh ids** to
 * every node in the clone. Useful for Copy/Paste, Duplicate, template
 * stamping, and any operation that needs structurally-identical nodes
 * that won't collide with the originals in the same document.
 *
 * **What is cloned**:
 *
 * - The node and all descendants if it's a {@link GroupNode}.
 * - Top-level fields are spread (`{ ...node, id: newId, children: ... }`)
 *   producing a new object reference for each node.
 * - Nested **immutable** values (`Transform`, `Style`, geometry primitives
 *   like `Point`/`BoundingBox`) are reused by reference — they're never
 *   mutated downstream, so sharing them is safe.
 *
 * **What is NOT cloned**:
 *
 * - `transform` matrix is reused by reference (immutable in this codebase).
 * - `style` object is reused by reference (immutable in this codebase).
 * - Path `d` strings, text `value`, image `href` — primitives, shared.
 *
 * The clone is **functionally independent** of the original — mutating
 * the document doesn't reach back to the source. This is what callers
 * (ClipboardService.copy, DuplicateCommand.execute) need.
 */
export function cloneNodeWithNewIds<T extends SvgNode>(node: T): T {
  if (isGroupNode(node)) {
    return {
      ...node,
      id: generateNodeId(),
      children: node.children.map((child) => cloneNodeWithNewIds(child)),
    } as T;
  }
  return { ...node, id: generateNodeId() } as T;
}
