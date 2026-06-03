import { describe, expect, it } from 'vitest';
import { generateNodeId } from '../types/node-id';
import type { AnimationDoc, AnimationTrack } from './animation-doc';
import { DEFAULT_EASING } from './easing';
import { sampleAnimation, sampleTrack } from './sample-animation';

const A = generateNodeId();
const B = generateNodeId();

function track(
  nodeId = A,
  property = 'x',
  kfs: { time: number; value: number }[] = [],
): AnimationTrack {
  return { nodeId, property, keyframes: kfs.map((k) => ({ ...k, easing: DEFAULT_EASING })) };
}

describe('sampleTrack', () => {
  it('returns null for an empty track', () => {
    expect(sampleTrack(track(A, 'x', []), 0)).toBeNull();
  });

  it('holds before the first and after the last keyframe', () => {
    const t = track(A, 'x', [
      { time: 100, value: 10 },
      { time: 200, value: 20 },
    ]);
    expect(sampleTrack(t, 0)).toBe(10); // before first → first value
    expect(sampleTrack(t, 100)).toBe(10);
    expect(sampleTrack(t, 999)).toBe(20); // after last → last value
  });

  it('linearly interpolates between two keyframes', () => {
    const t = track(A, 'x', [
      { time: 0, value: 0 },
      { time: 100, value: 100 },
    ]);
    expect(sampleTrack(t, 50)).toBeCloseTo(50, 6);
    expect(sampleTrack(t, 25)).toBeCloseTo(25, 6);
  });

  it('applies the starting keyframe easing to the segment', () => {
    const t: AnimationTrack = {
      nodeId: A,
      property: 'x',
      keyframes: [
        { time: 0, value: 0, easing: { kind: 'easeIn' } },
        { time: 100, value: 100, easing: DEFAULT_EASING },
      ],
    };
    const v = sampleTrack(t, 50);
    // ease-in is slow at the start → below the linear midpoint of 50.
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(0);
    expect(v!).toBeLessThan(50);
  });
});

describe('sampleAnimation', () => {
  it('groups overrides by node and property; skips empty tracks', () => {
    const doc: AnimationDoc = {
      durationMs: 1000,
      tracks: [
        track(A, 'x', [
          { time: 0, value: 0 },
          { time: 100, value: 100 },
        ]),
        track(A, 'opacity', [{ time: 0, value: 0.5 }]),
        track(B, 'y', [{ time: 0, value: 7 }]),
        track(B, 'width', []), // empty → skipped
      ],
    };
    const s = sampleAnimation(doc, 50);
    expect(s.get(A)!.get('x')).toBeCloseTo(50, 6);
    expect(s.get(A)!.get('opacity')).toBe(0.5);
    expect(s.get(B)!.get('y')).toBe(7);
    expect(s.get(B)!.has('width')).toBe(false);
  });
});
