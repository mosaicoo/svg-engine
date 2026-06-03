import { describe, expect, it } from 'vitest';
import type { GroupNode } from '../model/group-node';
import { createGroup, createRect } from '../model/node-factory';
import type { RectNode } from '../model/rect-node';
import type { SvgNode } from '../model/svg-node';
import type { NodeId } from '../types/node-id';
import { generateNodeId } from '../types/node-id';
import { applyAnimationToTree } from './apply-animation';
import type { AnimationSample, AnimationValue } from './sample-animation';

function sampleOf(
  entries: readonly [NodeId, readonly [string, AnimationValue][]][],
): AnimationSample {
  return new Map(entries.map(([id, props]) => [id, new Map(props)]));
}

function tree() {
  const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
  const b = createRect({ x: 50, y: 0, width: 10, height: 10 });
  const root = createGroup([a, b]);
  return { a, b, root };
}

const childAt = (n: SvgNode, i: number): SvgNode => (n as GroupNode).children[i]!;

describe('applyAnimationToTree', () => {
  it('returns the SAME tree reference for an empty sample (identity at t0)', () => {
    const { root } = tree();
    expect(applyAnimationToTree(root, new Map())).toBe(root);
  });

  it('returns the same tree when no sampled node exists in it (structural sharing)', () => {
    const { root } = tree();
    const s = sampleOf([[generateNodeId(), [['x', 5]]]]);
    expect(applyAnimationToTree(root, s)).toBe(root);
  });

  it('applies a numeric top-level override and preserves unaffected siblings by reference', () => {
    const { a, b, root } = tree();
    const out = applyAnimationToTree(root, sampleOf([[a.id, [['x', 99]]]]));
    expect(out).not.toBe(root); // ancestor rebuilt
    expect((childAt(out, 0) as RectNode).x).toBe(99);
    expect(childAt(out, 1)).toBe(b); // sibling kept its reference
  });

  it('applies style overrides (opacity + color) under node.style', () => {
    const { a, root } = tree();
    const out = applyAnimationToTree(
      root,
      sampleOf([
        [
          a.id,
          [
            ['opacity', 0.5],
            ['fill', '#ff0000'],
          ],
        ],
      ]),
    );
    const oa = childAt(out, 0);
    expect(oa.style.opacity).toBe(0.5);
    expect(oa.style.fill).toBe('#ff0000');
  });

  it('applies transform translate via decompose/recompose', () => {
    const { a, root } = tree();
    const out = applyAnimationToTree(
      root,
      sampleOf([
        [
          a.id,
          [
            ['translateX', 25],
            ['translateY', 5],
          ],
        ],
      ]),
    );
    const t = childAt(out, 0).transform;
    expect(t[4]).toBeCloseTo(25, 6);
    expect(t[5]).toBeCloseTo(5, 6);
  });

  it('applies transform rotation in DEGREES', () => {
    const { a, root } = tree();
    const out = applyAnimationToTree(root, sampleOf([[a.id, [['rotation', 90]]]]));
    const t = childAt(out, 0).transform;
    // 90° → [cos, sin, -sin, cos, 0, 0] = [0, 1, -1, 0, 0, 0]
    expect(t[0]).toBeCloseTo(0, 6);
    expect(t[1]).toBeCloseTo(1, 6);
    expect(t[2]).toBeCloseTo(-1, 6);
    expect(t[3]).toBeCloseTo(0, 6);
  });

  it('does not mutate the base tree', () => {
    const { a, root } = tree();
    applyAnimationToTree(root, sampleOf([[a.id, [['x', 99]]]]));
    expect((root.children[0] as RectNode).x).toBe(0); // original untouched
  });
});
