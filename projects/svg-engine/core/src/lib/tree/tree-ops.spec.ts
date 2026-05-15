import { createGroup, createRect } from '../model/node-factory';
import { findNodeById, findParent, insertNode, removeNode, updateNode } from './tree-ops';

function makeTree() {
  const r1 = createRect({ x: 0, y: 0, width: 10, height: 10 });
  const r2 = createRect({ x: 20, y: 20, width: 5, height: 5 });
  const inner = createGroup([r2]);
  const root = createGroup([r1, inner]);
  return { root, r1, r2, inner };
}

describe('tree-ops / findNodeById', () => {
  it('finds the root itself', () => {
    const { root } = makeTree();
    expect(findNodeById(root, root.id)).toBe(root);
  });

  it('finds a direct child', () => {
    const { root, r1 } = makeTree();
    expect(findNodeById(root, r1.id)).toBe(r1);
  });

  it('finds a deeply-nested child', () => {
    const { root, r2 } = makeTree();
    expect(findNodeById(root, r2.id)).toBe(r2);
  });

  it('returns null for missing ids', () => {
    const { root } = makeTree();
    expect(findNodeById(root, 'does-not-exist' as never)).toBeNull();
  });
});

describe('tree-ops / findParent', () => {
  it('returns the root for a direct child', () => {
    const { root, r1 } = makeTree();
    expect(findParent(root, r1.id)).toBe(root);
  });

  it('returns the inner group for a nested child', () => {
    const { root, inner, r2 } = makeTree();
    expect(findParent(root, r2.id)).toBe(inner);
  });

  it('returns null for the root itself', () => {
    const { root } = makeTree();
    expect(findParent(root, root.id)).toBeNull();
  });

  it('returns null for a missing id', () => {
    const { root } = makeTree();
    expect(findParent(root, 'does-not-exist' as never)).toBeNull();
  });
});

describe('tree-ops / insertNode', () => {
  it('appends to the root group when no index is given', () => {
    const { root } = makeTree();
    const newRect = createRect({ x: 99, y: 99, width: 1, height: 1 });
    const next = insertNode(root, root.id, newRect);
    expect(next).not.toBe(root);
    expect(next.children.at(-1)).toBe(newRect);
    expect(next.children).toHaveLength(root.children.length + 1);
  });

  it('inserts at the requested index in the parent', () => {
    const { root, inner } = makeTree();
    const newRect = createRect({ x: 1, y: 2, width: 3, height: 4 });
    const next = insertNode(root, inner.id, newRect, 0);
    const newInner = next.children[1];
    expect(newInner?.type).toBe('group');
    if (newInner?.type !== 'group') throw new Error('expected group');
    expect(newInner.children[0]).toBe(newRect);
  });

  it('returns the same root reference when parent is missing', () => {
    const { root } = makeTree();
    const newRect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    expect(insertNode(root, 'nope' as never, newRect)).toBe(root);
  });

  it('throws when the inserted node id already exists', () => {
    const { root, r1 } = makeTree();
    expect(() => insertNode(root, root.id, r1)).toThrow(/already exists/);
  });

  it('preserves structural sharing of unaffected branches', () => {
    const { root, inner } = makeTree();
    const newRect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    // Insert into root → only root reallocates; inner stays referentially equal
    const next = insertNode(root, root.id, newRect);
    const innerInNext = next.children.find((c) => c.id === inner.id);
    expect(innerInNext).toBe(inner);
  });
});

describe('tree-ops / removeNode', () => {
  it('removes a direct child', () => {
    const { root, r1 } = makeTree();
    const next = removeNode(root, r1.id);
    expect(next).not.toBe(root);
    expect(next.children.find((c) => c.id === r1.id)).toBeUndefined();
  });

  it('removes a nested child and reallocates the path', () => {
    const { root, inner, r2 } = makeTree();
    const next = removeNode(root, r2.id);
    const nextInner = next.children.find((c) => c.id === inner.id);
    expect(nextInner?.type).toBe('group');
    if (nextInner?.type !== 'group') throw new Error('expected group');
    expect(nextInner.children).toHaveLength(0);
  });

  it('returns the same root reference when id is missing', () => {
    const { root } = makeTree();
    expect(removeNode(root, 'nope' as never)).toBe(root);
  });

  it('refuses to remove the root', () => {
    const { root } = makeTree();
    expect(removeNode(root, root.id)).toBe(root);
  });
});

describe('tree-ops / updateNode', () => {
  it('updates a direct child immutably', () => {
    const { root, r1 } = makeTree();
    const next = updateNode(root, r1.id, (n) => ({ ...n, x: 999 }));
    const updated = next.children.find((c) => c.id === r1.id);
    expect(updated?.type).toBe('rect');
    if (updated?.type !== 'rect') throw new Error('expected rect');
    expect(updated.x).toBe(999);
    expect(updated).not.toBe(r1);
  });

  it('returns the same root when updater returns the same reference', () => {
    const { root, r1 } = makeTree();
    expect(updateNode(root, r1.id, (n) => n)).toBe(root);
  });

  it('returns the same root when id is missing', () => {
    const { root } = makeTree();
    expect(updateNode(root, 'nope' as never, (n) => n)).toBe(root);
  });

  it('throws when the updater changes the id', () => {
    const { root, r1 } = makeTree();
    expect(() => updateNode(root, r1.id, (n) => ({ ...n, id: 'different' as never }))).toThrow(
      /changed id/,
    );
  });

  it('throws when the updater changes the type', () => {
    const { root, r1 } = makeTree();
    expect(() => updateNode(root, r1.id, (n) => ({ ...n, type: 'ellipse' }) as never)).toThrow(
      /changed type/,
    );
  });
});
