import {
  findNodeById,
  findParent,
  type GroupNode,
  IDENTITY_TRANSFORM,
  multiply,
  type NodeId,
  type Transform,
} from 'svg-engine/core';

/**
 * Compose the full ancestor-chain matrix from `root` down to `targetId`.
 * The returned transform maps points from the target node's **local**
 * (pre-transform) coord system into the document root's user space —
 * exactly what we need to render anchor squares / segment hit-zones at
 * the same visual position as the actual `<svg:path>` drawn by the
 * renderer.
 *
 * **Composition order**: `root.transform · … · parent.transform · target.transform`.
 * Matches the SVG painter — outermost parent's transform is applied
 * last to children's local coords. Apply this matrix to a local point
 * with `applyTransform(matrix, p.x, p.y)` to get its visual position.
 *
 * **Why model-based** (not DOM-based like `composedAncestorMatrix` in
 * `node-bbox.ts`): the AnchorOverlay recomputes on every state change.
 * Walking the DOM on each recompute forces a synchronous layout flush
 * (`getAttribute('transform')` + `parentElement`) — orders of magnitude
 * slower than walking the in-memory tree. Model walk is O(depth).
 *
 * Returns `IDENTITY_TRANSFORM` if `targetId` is not found (defensive —
 * callers should have already validated existence via a gating
 * predicate, but the no-op fallback keeps the editor from crashing on
 * race conditions where the node is deleted mid-render).
 *
 * **Why this exists** (regression context): without composing the
 * ancestor chain, the AnchorOverlay drew anchor squares at the path's
 * local-coords-with-only-own-transform position. For a path inside a
 * moved group, that left the squares floating away from the visible
 * shape — the bug the user reported with "arestas não estão
 * posicionadas sobre o elemento".
 */
export function composeAncestorMatrix(root: GroupNode, targetId: NodeId): Transform {
  const target = findNodeById(root, targetId);
  if (target === null) return IDENTITY_TRANSFORM;
  let acc: Transform = target.transform;
  let currentId: NodeId = target.id;
  // Walk parents until we reach the doc root. Cap at 1000 iterations
  // to defend against malformed cyclic trees.
  let safety = 1000;
  while (safety-- > 0) {
    const parent = findParent(root, currentId);
    if (parent === null) break; // current was the doc root
    acc = multiply(parent.transform, acc);
    currentId = parent.id;
  }
  return acc;
}
