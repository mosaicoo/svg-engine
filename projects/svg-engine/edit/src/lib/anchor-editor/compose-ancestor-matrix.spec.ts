import { createGroup, createPath, createRect, type GroupNode } from '@mosaicoo/svg-engine/core';
import { composeAncestorMatrix } from './compose-ancestor-matrix';

/**
 * Regression coverage for the bug "arestas de deformação não estão
 * posicionadas sobre o elemento dentro de um grupo": the AnchorOverlay
 * was rendering anchor squares using only `node.transform`, missing
 * the parent group's transform — so anchors floated away from the
 * visible path on the canvas.
 *
 * These specs validate that `composeAncestorMatrix` returns a matrix
 * that, applied to a node-local point, lands on the node's visual
 * (renderer-output) position.
 */
describe('composeAncestorMatrix', () => {
  it('returns the node-own transform for nodes directly under root', () => {
    const path = createPath('M0 0 L 10 10');
    const root = createGroup([path]);
    // path has identity transform → returned matrix is identity
    expect(composeAncestorMatrix(root, path.id)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('composes group + path transforms (translate × translate)', () => {
    const path = createPath('M0 0 L 10 10', { transform: [1, 0, 0, 1, 5, 5] });
    const group: GroupNode = createGroup([path], { transform: [1, 0, 0, 1, 100, 50] });
    const root = createGroup([group]);
    // root (identity) · group (translate 100,50) · path (translate 5,5)
    //   = translate(105, 55)
    expect(composeAncestorMatrix(root, path.id)).toEqual([1, 0, 0, 1, 105, 55]);
  });

  it('group transform is OUTER, applies LAST to local coords', () => {
    // Path local point (10, 10), path has no transform of its own.
    // Group translates by (100, 50).
    // Visual position must be (110, 60) = group_translate applied AFTER local coords.
    const path = createPath('M0 0');
    const group = createGroup([path], { transform: [1, 0, 0, 1, 100, 50] });
    const root = createGroup([group]);
    const m = composeAncestorMatrix(root, path.id);
    // Apply m to local (10, 10): x' = a·10 + c·10 + e; y' = b·10 + d·10 + f
    const [a, b, c, d, e, f] = m;
    const x = a * 10 + c * 10 + e;
    const y = b * 10 + d * 10 + f;
    expect(x).toBe(110);
    expect(y).toBe(60);
  });

  it('walks NESTED groups (path inside outer-inner-path chain)', () => {
    const path = createPath('M0 0');
    const inner = createGroup([path], { transform: [1, 0, 0, 1, 0, 50] });
    const outer = createGroup([inner], { transform: [1, 0, 0, 1, 100, 0] });
    const root = createGroup([outer]);
    // root · outer (translate 100,0) · inner (translate 0,50) · path (identity)
    //   = translate(100, 50)
    expect(composeAncestorMatrix(root, path.id)).toEqual([1, 0, 0, 1, 100, 50]);
  });

  it('rotated group: anchor at (10, 0) ends up at the rotated visual position', () => {
    const path = createPath('M0 0');
    // 90deg rotation around origin: (x, y) → (-y, x)
    const sin = Math.sin(Math.PI / 2);
    const cos = Math.cos(Math.PI / 2);
    const rot90: [number, number, number, number, number, number] = [cos, sin, -sin, cos, 0, 0];
    const group = createGroup([path], { transform: rot90 });
    const root = createGroup([group]);
    const m = composeAncestorMatrix(root, path.id);
    // Apply to (10, 0): expected (~0, ~10).
    const [a, b, c, d, e, f] = m;
    const x = a * 10 + c * 0 + e;
    const y = b * 10 + d * 0 + f;
    expect(x).toBeCloseTo(0, 4);
    expect(y).toBeCloseTo(10, 4);
  });

  it('returns identity for unknown ids (defensive)', () => {
    const root = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    // Cast: validate the defensive path without forging a real NodeId.
    expect(
      composeAncestorMatrix(
        root,
        'does-not-exist' as unknown as Parameters<typeof composeAncestorMatrix>[1],
      ),
    ).toEqual([1, 0, 0, 1, 0, 0]);
  });
});
