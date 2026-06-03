import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CommandBus,
  createEmptyDocument,
  DEFAULT_EASING,
  EditorStateService,
  generateNodeId,
  type NodeId,
} from 'svg-engine/core';
import { AnimationService } from './animation.service';

function setup(): {
  anim: AnimationService;
  bus: CommandBus;
  state: EditorStateService;
  rootId: NodeId;
} {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  const anim = TestBed.inject(AnimationService);
  const bus = TestBed.inject(CommandBus);
  return { anim, bus, state, rootId: state.document().root.id };
}

const NODE = generateNodeId();

describe('AnimationService', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('uses the document root as the container when no active page', () => {
    const { anim, rootId } = setup();
    expect(anim.containerId()).toBe(rootId);
  });

  it('starts with an empty doc (no tracks, default 1000ms)', () => {
    const { anim } = setup();
    expect(anim.tracks()).toEqual([]);
    expect(anim.durationMs()).toBe(1000);
  });

  it('addKeyframe stores a keyframe and the derived signals reflect it', () => {
    const { anim } = setup();
    const r = anim.addKeyframe(NODE, 'x', { time: 0, value: 10, easing: DEFAULT_EASING });
    expect(r.ok).toBe(true);
    expect(anim.tracks()).toHaveLength(1);
    expect(anim.tracks()[0]!.keyframes[0]).toEqual({ time: 0, value: 10, easing: DEFAULT_EASING });
  });

  it('keyframe edits go through CommandBus and are undoable', () => {
    const { anim, bus } = setup();
    anim.addKeyframe(NODE, 'x', { time: 0, value: 10, easing: DEFAULT_EASING });
    expect(anim.tracks()).toHaveLength(1);
    bus.undo();
    expect(anim.tracks()).toEqual([]); // back to empty
  });

  it('removeKeyframe drops the keyframe', () => {
    const { anim } = setup();
    anim.addKeyframe(NODE, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    anim.addKeyframe(NODE, 'x', { time: 100, value: 50, easing: DEFAULT_EASING });
    anim.removeKeyframe(NODE, 'x', 0);
    expect(anim.tracks()[0]!.keyframes.map((k) => k.time)).toEqual([100]);
  });

  it('moveKeyframe relocates a keyframe', () => {
    const { anim } = setup();
    anim.addKeyframe(NODE, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    anim.addKeyframe(NODE, 'x', { time: 100, value: 50, easing: DEFAULT_EASING });
    anim.moveKeyframe(NODE, 'x', 0, 25);
    expect(anim.tracks()[0]!.keyframes.map((k) => k.time)).toEqual([25, 100]);
  });

  it('setKeyframeEasing replaces the easing of one keyframe', () => {
    const { anim } = setup();
    anim.addKeyframe(NODE, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    anim.setKeyframeEasing(NODE, 'x', 0, { kind: 'easeIn' });
    expect(anim.tracks()[0]!.keyframes[0]!.easing).toEqual({ kind: 'easeIn' });
  });

  it('setDuration updates the timeline duration', () => {
    const { anim } = setup();
    anim.addKeyframe(NODE, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    anim.setDuration(2500);
    expect(anim.durationMs()).toBe(2500);
  });

  it('sample() interpolates the active animation at a time', () => {
    const { anim } = setup();
    anim.addKeyframe(NODE, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    anim.addKeyframe(NODE, 'x', { time: 100, value: 100, easing: DEFAULT_EASING });
    const s = anim.sample(50); // linear midpoint
    expect(s.get(NODE)!.get('x')).toBe(50);
  });
});
