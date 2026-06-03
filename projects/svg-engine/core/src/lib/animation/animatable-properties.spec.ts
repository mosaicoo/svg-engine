import { describe, expect, it } from 'vitest';
import { composeTransform } from '../geometry';
import {
  createEllipse,
  createGroup,
  createLine,
  createPath,
  createRect,
} from '../model/node-factory';
import type { RectNode } from '../model/rect-node';
import {
  animatablePropertiesForNode,
  findAnimatableProperty,
  readAnimatableValue,
} from './animatable-properties';
import { applyAnimationToTree } from './apply-animation';
import type { AnimationSample } from './sample-animation';

const propsOf = (n: ReturnType<typeof createRect>): string[] =>
  animatablePropertiesForNode(n).map((p) => p.property);

describe('animatablePropertiesForNode — per node type', () => {
  it('rect exposes x/y/width/height + transform + style', () => {
    const p = propsOf(createRect({ x: 0, y: 0, width: 10, height: 10 }));
    expect(p.slice(0, 4)).toEqual(['x', 'y', 'width', 'height']);
    // transform + style appended (universal)
    expect(p).toContain('rotation');
    expect(p).toContain('opacity');
    expect(p).toContain('fill');
  });

  it('ellipse exposes cx/cy/rx/ry', () => {
    const p = animatablePropertiesForNode(createEllipse({ cx: 0, cy: 0, rx: 5, ry: 5 })).map(
      (d) => d.property,
    );
    expect(p.slice(0, 4)).toEqual(['cx', 'cy', 'rx', 'ry']);
  });

  it('line exposes x1/y1/x2/y2', () => {
    const p = animatablePropertiesForNode(createLine({ x1: 0, y1: 0, x2: 10, y2: 10 })).map(
      (d) => d.property,
    );
    expect(p.slice(0, 4)).toEqual(['x1', 'y1', 'x2', 'y2']);
  });

  it('path and group expose only transform + style (no per-type geometry in the MVP)', () => {
    const pathProps = animatablePropertiesForNode(createPath('M0 0 L10 10')).map((d) => d.property);
    const groupProps = animatablePropertiesForNode(createGroup([])).map((d) => d.property);
    expect(pathProps).not.toContain('d');
    expect(pathProps[0]).toBe('translateX'); // geometry block is empty → transform first
    expect(groupProps[0]).toBe('translateX');
    // both still animate the universal blocks
    expect(pathProps).toContain('fill');
    expect(groupProps).toContain('opacity');
  });

  it('every property name is unique within a node', () => {
    const p = propsOf(createRect({ x: 0, y: 0, width: 10, height: 10 }));
    expect(new Set(p).size).toBe(p.length);
  });

  it('transform/style props carry the right kinds and defaults', () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    expect(findAnimatableProperty(rect, 'rotation')).toMatchObject({
      kind: 'angle',
      defaultValue: 0,
    });
    expect(findAnimatableProperty(rect, 'scaleX')).toMatchObject({
      kind: 'scale',
      defaultValue: 1,
    });
    expect(findAnimatableProperty(rect, 'fill')).toMatchObject({ kind: 'color' });
    expect(findAnimatableProperty(rect, 'opacity')).toMatchObject({
      kind: 'number',
      defaultValue: 1,
    });
    expect(findAnimatableProperty(rect, 'nope')).toBeNull();
  });
});

describe('readAnimatableValue', () => {
  it('reads geometry fields', () => {
    const rect = createRect({ x: 3, y: 7, width: 40, height: 20 });
    expect(readAnimatableValue(rect, 'x')).toBe(3);
    expect(readAnimatableValue(rect, 'width')).toBe(40);
    // a geometry field that does not exist on this node → null
    expect(readAnimatableValue(rect, 'cx')).toBeNull();
  });

  it('reads style fields (number + color), null when unset', () => {
    const rect = {
      ...createRect({ x: 0, y: 0, width: 10, height: 10 }),
      style: { opacity: 0.5, fill: '#abcdef' },
    };
    expect(readAnimatableValue(rect, 'opacity')).toBe(0.5);
    expect(readAnimatableValue(rect, 'fill')).toBe('#abcdef');
    expect(readAnimatableValue(rect, 'stroke')).toBeNull(); // unset → null
  });

  it('reads transform components via decomposition (rotation in degrees)', () => {
    const base = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const node = {
      ...base,
      transform: composeTransform({
        tx: 12,
        ty: 34,
        rotationRad: Math.PI / 2, // 90°
        scaleX: 2,
        scaleY: 3,
      }),
    };
    expect(readAnimatableValue(node, 'translateX')).toBeCloseTo(12, 6);
    expect(readAnimatableValue(node, 'translateY')).toBeCloseTo(34, 6);
    expect(readAnimatableValue(node, 'rotation')).toBeCloseTo(90, 6);
    expect(readAnimatableValue(node, 'scaleX')).toBeCloseTo(2, 6);
    expect(readAnimatableValue(node, 'scaleY')).toBeCloseTo(3, 6);
  });
});

/**
 * The contract that makes the catalog meaningful: every property it advertises
 * must actually be applied by `applyAnimationToTree` (F1). If a catalog entry
 * named a property the apply layer didn't recognize, the timeline would let
 * the user keyframe something that never moves. This round-trips one property
 * from each bucket (geometry / transform / style + color).
 */
describe('catalog ↔ applyAnimationToTree alignment', () => {
  function sampleOf(
    nodeId: string,
    entries: readonly [string, number | string][],
  ): AnimationSample {
    return new Map([[nodeId as never, new Map(entries)]]);
  }

  it('applies a geometry, a transform, a style and a color override', () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const root = createGroup([rect]);

    const out = applyAnimationToTree(
      root,
      sampleOf(rect.id, [
        ['width', 99], // geometry
        ['translateX', 25], // transform
        ['opacity', 0.25], // style (number)
        ['fill', '#ff0000'], // style (color)
      ]),
    );
    const child = (out as ReturnType<typeof createGroup>).children[0] as RectNode;
    expect(child.width).toBe(99);
    expect(child.transform[4]).toBeCloseTo(25, 6); // tx
    expect(child.style.opacity).toBe(0.25);
    expect(child.style.fill).toBe('#ff0000');
  });
});
