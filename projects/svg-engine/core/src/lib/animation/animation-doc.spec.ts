import { describe, expect, it } from 'vitest';
import { createRect } from '../model/node-factory';
import { generateNodeId } from '../types/node-id';
import {
  ANIMATION_KEY,
  emptyAnimationDoc,
  findTrack,
  isAnimationDoc,
  readAnimationDoc,
  removeKeyframe,
  upsertKeyframe,
} from './animation-doc';
import { DEFAULT_EASING } from './easing';

const A = generateNodeId();
const B = generateNodeId();

describe('AnimationDoc model', () => {
  it('emptyAnimationDoc defaults to 1000ms and no tracks', () => {
    const d = emptyAnimationDoc();
    expect(d.durationMs).toBe(1000);
    expect(d.tracks).toEqual([]);
    expect(emptyAnimationDoc(500).durationMs).toBe(500);
  });

  it('upsertKeyframe creates a track and applies the default easing', () => {
    const d = upsertKeyframe(emptyAnimationDoc(), A, 'x', {
      time: 0,
      value: 10,
      easing: undefined as never,
    });
    expect(d.tracks).toHaveLength(1);
    const t = findTrack(d, A, 'x')!;
    expect(t.keyframes).toHaveLength(1);
    expect(t.keyframes[0]).toEqual({ time: 0, value: 10, easing: DEFAULT_EASING });
  });

  it('distinct (node, property) pairs become separate tracks', () => {
    let d = upsertKeyframe(emptyAnimationDoc(), A, 'x', {
      time: 0,
      value: 1,
      easing: DEFAULT_EASING,
    });
    d = upsertKeyframe(d, A, 'y', { time: 0, value: 2, easing: DEFAULT_EASING });
    d = upsertKeyframe(d, B, 'x', { time: 0, value: 3, easing: DEFAULT_EASING });
    expect(d.tracks).toHaveLength(3);
  });

  it('inserts keep keyframes sorted by time; same time replaces', () => {
    let d = upsertKeyframe(emptyAnimationDoc(), A, 'x', {
      time: 100,
      value: 5,
      easing: DEFAULT_EASING,
    });
    d = upsertKeyframe(d, A, 'x', { time: 0, value: 1, easing: DEFAULT_EASING });
    d = upsertKeyframe(d, A, 'x', { time: 50, value: 3, easing: DEFAULT_EASING });
    let t = findTrack(d, A, 'x')!;
    expect(t.keyframes.map((k) => k.time)).toEqual([0, 50, 100]);
    // Replace the one at t=50.
    d = upsertKeyframe(d, A, 'x', { time: 50, value: 99, easing: DEFAULT_EASING });
    t = findTrack(d, A, 'x')!;
    expect(t.keyframes).toHaveLength(3);
    expect(t.keyframes[1]!.value).toBe(99);
  });

  it('upsert is immutable — the input doc is untouched', () => {
    const base = emptyAnimationDoc();
    const next = upsertKeyframe(base, A, 'x', { time: 0, value: 1, easing: DEFAULT_EASING });
    expect(base.tracks).toHaveLength(0);
    expect(next).not.toBe(base);
  });

  it('removeKeyframe drops the keyframe and prunes empty tracks', () => {
    let d = upsertKeyframe(emptyAnimationDoc(), A, 'x', {
      time: 0,
      value: 1,
      easing: DEFAULT_EASING,
    });
    d = upsertKeyframe(d, A, 'x', { time: 100, value: 2, easing: DEFAULT_EASING });
    d = removeKeyframe(d, A, 'x', 0);
    expect(findTrack(d, A, 'x')!.keyframes.map((k) => k.time)).toEqual([100]);
    d = removeKeyframe(d, A, 'x', 100);
    expect(findTrack(d, A, 'x')).toBeNull(); // track pruned when empty
  });

  it('removeKeyframe is a no-op when nothing matches', () => {
    const d = upsertKeyframe(emptyAnimationDoc(), A, 'x', {
      time: 0,
      value: 1,
      easing: DEFAULT_EASING,
    });
    expect(removeKeyframe(d, A, 'x', 999)).toBe(d);
    expect(removeKeyframe(d, B, 'x', 0)).toBe(d);
  });

  it('readAnimationDoc reads from metadata.customData; isAnimationDoc guards', () => {
    const anim = upsertKeyframe(emptyAnimationDoc(), A, 'x', {
      time: 0,
      value: 1,
      easing: DEFAULT_EASING,
    });
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const withAnim = {
      ...rect,
      metadata: { ...rect.metadata, customData: { [ANIMATION_KEY]: anim } },
    };
    expect(readAnimationDoc(withAnim)).toBe(anim);
    expect(readAnimationDoc(rect)).toBeNull();
    expect(readAnimationDoc(null)).toBeNull();
    expect(isAnimationDoc(anim)).toBe(true);
    expect(isAnimationDoc({ foo: 1 })).toBe(false);
    expect(isAnimationDoc(null)).toBe(false);
  });
});
