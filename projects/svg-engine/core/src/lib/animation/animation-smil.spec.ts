import { describe, expect, it } from 'vitest';
import type { NodeId } from '../types/node-id';
import type { Transform } from '../types/transform';
import type { AnimationDoc, AnimationTrack } from './animation-doc';
import { animationToSmil } from './animation-smil';
import type { EasingSpec } from './easing';

const N = 'n1' as NodeId;
const M = 'n2' as NodeId;
const LINEAR: EasingSpec = { kind: 'linear' };

function track(
  nodeId: NodeId,
  property: string,
  keyframes: { time: number; value: number | string; easing?: EasingSpec }[],
): AnimationTrack {
  return {
    nodeId,
    property,
    keyframes: keyframes.map((k) => ({ ...k, easing: k.easing ?? LINEAR })),
  };
}

function doc(durationMs: number, tracks: AnimationTrack[]): AnimationDoc {
  return { durationMs, tracks };
}

describe('D-082 F9a — animationToSmil (SMIL serializer)', () => {
  it('serializes a linear geometry track to a single <animate>', () => {
    const d = doc(1000, [
      track(N, 'x', [
        { time: 0, value: 0 },
        { time: 1000, value: 100 },
      ]),
    ]);
    expect(animationToSmil(d, N)).toEqual([
      '<animate attributeName="x" dur="1s" repeatCount="indefinite" keyTimes="0;1" values="0;100" />',
    ]);
  });

  it('pads synthetic hold points at t=0 and t=duration (mirrors sampleTrack)', () => {
    const d = doc(1000, [
      track(N, 'y', [
        { time: 250, value: 10 },
        { time: 750, value: 20 },
      ]),
    ]);
    // Holds 10 before 250ms and 20 after 750ms → keyTimes span [0,1].
    expect(animationToSmil(d, N)).toEqual([
      '<animate attributeName="y" dur="1s" repeatCount="indefinite" keyTimes="0;0.25;0.75;1" values="10;10;20;20" />',
    ]);
  });

  it('emits calcMode="spline" + keySplines for a non-linear segment', () => {
    const d = doc(1000, [
      track(N, 'x', [
        { time: 0, value: 0, easing: { kind: 'easeIn' } },
        { time: 1000, value: 100 },
      ]),
    ]);
    expect(animationToSmil(d, N)).toEqual([
      '<animate attributeName="x" dur="1s" repeatCount="indefinite" keyTimes="0;1" values="0;100" calcMode="spline" keySplines="0.42 0 1 1" />',
    ]);
  });

  it('omits keySplines/calcMode when every segment is linear', () => {
    const d = doc(1000, [
      track(N, 'x', [
        { time: 0, value: 0 },
        { time: 500, value: 50 },
        { time: 1000, value: 100 },
      ]),
    ]);
    const out = animationToSmil(d, N);
    expect(out[0]).not.toContain('keySplines');
    expect(out[0]).not.toContain('calcMode');
    expect(out[0]).toContain('keyTimes="0;0.5;1"');
  });

  it('maps camelCase style props to their SVG attribute names', () => {
    const d = doc(1000, [
      track(N, 'strokeWidth', [
        { time: 0, value: 1 },
        { time: 1000, value: 4 },
      ]),
      track(N, 'fillOpacity', [
        { time: 0, value: 1 },
        { time: 1000, value: 0 },
      ]),
    ]);
    const out = animationToSmil(d, N).join('\n');
    expect(out).toContain('attributeName="stroke-width"');
    expect(out).toContain('attributeName="fill-opacity"');
  });

  it('emits color values verbatim for fill/stroke tracks', () => {
    const d = doc(1000, [
      track(N, 'fill', [
        { time: 0, value: '#ff0000' },
        { time: 1000, value: '#0000ff' },
      ]),
    ]);
    expect(animationToSmil(d, N)).toEqual([
      '<animate attributeName="fill" dur="1s" repeatCount="indefinite" keyTimes="0;1" values="#ff0000;#0000ff" />',
    ]);
  });

  it('returns [] for a non-positive duration', () => {
    const d = doc(0, [
      track(N, 'x', [
        { time: 0, value: 0 },
        { time: 0, value: 100 },
      ]),
    ]);
    expect(animationToSmil(d, N)).toEqual([]);
  });

  it('returns [] for a node with no tracks', () => {
    const d = doc(1000, [
      track(M, 'x', [
        { time: 0, value: 0 },
        { time: 1000, value: 100 },
      ]),
    ]);
    expect(animationToSmil(d, N)).toEqual([]);
  });

  it('pads a single-keyframe track into a constant 2-point animation', () => {
    const d = doc(1000, [track(N, 'opacity', [{ time: 0, value: 0.5 }])]);
    expect(animationToSmil(d, N)).toEqual([
      '<animate attributeName="opacity" dur="1s" repeatCount="indefinite" keyTimes="0;1" values="0.5;0.5" />',
    ]);
  });

  it('formats fractional duration as seconds (1500ms → 1.5s)', () => {
    const d = doc(1500, [
      track(N, 'x', [
        { time: 0, value: 0 },
        { time: 1500, value: 1 },
      ]),
    ]);
    expect(animationToSmil(d, N)[0]).toContain('dur="1.5s"');
  });

  it('sorts emitted elements by attribute name (deterministic output)', () => {
    const d = doc(1000, [
      track(N, 'x', [
        { time: 0, value: 0 },
        { time: 1000, value: 1 },
      ]),
      track(N, 'opacity', [
        { time: 0, value: 1 },
        { time: 1000, value: 0 },
      ]),
    ]);
    const names = animationToSmil(d, N).map((el) => /attributeName="([^"]+)"/.exec(el)![1]);
    expect(names).toEqual(['opacity', 'x']); // alphabetical, not insertion order
  });
});

describe('D-082 F9b — animationToSmil (transform → <animateTransform>)', () => {
  it('serializes a rotation track to <animateTransform type="rotate"> (degrees)', () => {
    const d = doc(1000, [
      track(N, 'rotation', [
        { time: 0, value: 0 },
        { time: 1000, value: 90 },
      ]),
    ]);
    expect(animationToSmil(d, N)).toEqual([
      '<animateTransform attributeName="transform" type="rotate" dur="1s" repeatCount="indefinite" additive="sum" keyTimes="0;1" values="0;90" />',
    ]);
  });

  it('merges a single animated translate axis with the other static axis', () => {
    const d = doc(1000, [
      track(N, 'translateX', [
        { time: 0, value: 0 },
        { time: 1000, value: 100 },
      ]),
    ]);
    // translateY not animated and static 0 → "x,0" pairs, exact keySplines path.
    expect(animationToSmil(d, N)).toEqual([
      '<animateTransform attributeName="transform" type="translate" dur="1s" repeatCount="indefinite" additive="sum" keyTimes="0;1" values="0,0;100,0" />',
    ]);
  });

  it('samples both translate axes over the union of their keyframe times', () => {
    const d = doc(1000, [
      track(N, 'translateX', [
        { time: 0, value: 0 },
        { time: 1000, value: 100 },
      ]),
      track(N, 'translateY', [
        { time: 0, value: 0 },
        { time: 500, value: 50 },
        { time: 1000, value: 0 },
      ]),
    ]);
    // Union times {0, 500, 1000}; tx eased-sampled (50 at mid), ty exact.
    expect(animationToSmil(d, N)).toEqual([
      '<animateTransform attributeName="transform" type="translate" dur="1s" repeatCount="indefinite" additive="sum" keyTimes="0;0.5;1" values="0,0;50,50;100,0" />',
    ]);
  });

  it('emits translate → rotate → scale in additive composition order', () => {
    const d = doc(1000, [
      track(N, 'scaleX', [
        { time: 0, value: 1 },
        { time: 1000, value: 2 },
      ]),
      track(N, 'rotation', [
        { time: 0, value: 0 },
        { time: 1000, value: 45 },
      ]),
      track(N, 'translateX', [
        { time: 0, value: 0 },
        { time: 1000, value: 10 },
      ]),
    ]);
    const types = animationToSmil(d, N).map((el) => /type="([^"]+)"/.exec(el)![1]);
    expect(types).toEqual(['translate', 'rotate', 'scale']);
  });

  it('bakes static transform components as constants (base transform preserved)', () => {
    // Base = translate(10,20); animate scaleX only. The static translate must
    // survive as a constant <animateTransform> since the exporter drops the
    // static transform attribute for animated nodes.
    const base: Transform = [1, 0, 0, 1, 10, 20];
    const d = doc(1000, [
      track(N, 'scaleX', [
        { time: 0, value: 1 },
        { time: 1000, value: 2 },
      ]),
    ]);
    expect(animationToSmil(d, N, base)).toEqual([
      '<animateTransform attributeName="transform" type="translate" dur="1s" repeatCount="indefinite" additive="sum" keyTimes="0;1" values="10,20;10,20" />',
      '<animateTransform attributeName="transform" type="scale" dur="1s" repeatCount="indefinite" additive="sum" keyTimes="0;1" values="1,1;2,1" />',
    ]);
  });

  it('omits constant transform groups that are at identity', () => {
    // Only rotation animated, identity base → no translate/scale elements.
    const d = doc(1000, [
      track(N, 'rotation', [
        { time: 0, value: 0 },
        { time: 1000, value: 90 },
      ]),
    ]);
    const out = animationToSmil(d, N);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('type="rotate"');
  });

  it('keeps per-segment easing (keySplines) on a single animated axis', () => {
    const d = doc(1000, [
      track(N, 'scaleX', [
        { time: 0, value: 1, easing: { kind: 'easeIn' } },
        { time: 1000, value: 2 },
      ]),
    ]);
    expect(animationToSmil(d, N)[0]).toContain('calcMode="spline" keySplines="0.42 0 1 1"');
  });

  it('emits geometry/style <animate> before transform <animateTransform>', () => {
    const d = doc(1000, [
      track(N, 'rotation', [
        { time: 0, value: 0 },
        { time: 1000, value: 90 },
      ]),
      track(N, 'x', [
        { time: 0, value: 0 },
        { time: 1000, value: 50 },
      ]),
    ]);
    const tags = animationToSmil(d, N).map((el) => /^<(\w+)/.exec(el)![1]);
    expect(tags).toEqual(['animate', 'animateTransform']);
  });
});
