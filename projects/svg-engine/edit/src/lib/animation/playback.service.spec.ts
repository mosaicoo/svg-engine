import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyDocument, EditorStateService } from 'svg-engine/core';
import { AnimationService } from './animation.service';
import { PlaybackService } from './playback.service';

/** Default scope: a real AnimationService backing the duration (empty doc →
 * 1000ms). Resets the document so durationMs() is deterministic. */
function setup(): { pb: PlaybackService; anim: AnimationService } {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  const anim = TestBed.inject(AnimationService);
  const pb = TestBed.inject(PlaybackService);
  return { pb, anim };
}

describe('PlaybackService', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('defaults: playhead 0, not playing, no loop, speed 1, duration from anim (1000)', () => {
    const { pb } = setup();
    expect(pb.playhead()).toBe(0);
    expect(pb.isPlaying()).toBe(false);
    expect(pb.loop()).toBe(false);
    expect(pb.speed()).toBe(1);
    expect(pb.durationMs()).toBe(1000);
  });

  it('seek clamps to [0, duration]', () => {
    const { pb } = setup();
    pb.seek(500);
    expect(pb.playhead()).toBe(500);
    pb.seek(-10);
    expect(pb.playhead()).toBe(0);
    pb.seek(99999);
    expect(pb.playhead()).toBe(1000);
  });

  it('tick advances the playhead by delta × speed', () => {
    const { pb } = setup();
    pb.tick(100);
    expect(pb.playhead()).toBe(100);
    pb.setSpeed(2);
    pb.tick(100);
    expect(pb.playhead()).toBe(300); // 100 + 100*2
  });

  it('tick stops at the end when not looping (and clears isPlaying)', () => {
    const { pb } = setup();
    pb.seek(950);
    pb.tick(100); // 950 + 100 = 1050 ≥ 1000
    expect(pb.playhead()).toBe(1000);
    expect(pb.isPlaying()).toBe(false);
  });

  it('tick wraps around when looping', () => {
    const { pb } = setup();
    pb.setLoop(true);
    pb.seek(950);
    pb.tick(100); // 1050 % 1000 = 50
    expect(pb.playhead()).toBe(50);
  });

  it('play sets isPlaying; pause clears it; toggle flips it', () => {
    const { pb } = setup();
    pb.play();
    expect(pb.isPlaying()).toBe(true);
    pb.pause();
    expect(pb.isPlaying()).toBe(false);
    pb.toggle();
    expect(pb.isPlaying()).toBe(true);
    pb.toggle();
    expect(pb.isPlaying()).toBe(false);
  });

  it('play() from the end replays from 0', () => {
    const { pb } = setup();
    pb.seek(1000);
    pb.play();
    expect(pb.playhead()).toBe(0);
    expect(pb.isPlaying()).toBe(true);
    pb.pause();
  });

  it('stepForward / stepBackward nudge the playhead (clamped)', () => {
    const { pb } = setup();
    pb.seek(500);
    pb.stepForward(100);
    expect(pb.playhead()).toBe(600);
    pb.stepBackward(100);
    expect(pb.playhead()).toBe(500);
    pb.stepBackward(99999);
    expect(pb.playhead()).toBe(0); // clamped at start
  });

  it('goToStart / goToEnd jump to the bounds', () => {
    const { pb } = setup();
    pb.seek(500);
    pb.goToStart();
    expect(pb.playhead()).toBe(0);
    pb.goToEnd();
    expect(pb.playhead()).toBe(1000);
  });

  it('setSpeed rejects non-positive multipliers (falls back to 1)', () => {
    const { pb } = setup();
    pb.setSpeed(3);
    expect(pb.speed()).toBe(3);
    pb.setSpeed(0);
    expect(pb.speed()).toBe(1);
    pb.setSpeed(-2);
    expect(pb.speed()).toBe(1);
  });

  it('tracks the AnimationService duration live', () => {
    const { pb, anim } = setup();
    anim.addKeyframe(anim.containerId(), 'opacity', {
      time: 0,
      value: 1,
      easing: { kind: 'linear' },
    });
    anim.setDuration(3000);
    expect(pb.durationMs()).toBe(3000);
    pb.seek(2500);
    expect(pb.playhead()).toBe(2500); // within the new bounds
  });

  describe('without an AnimationService (standalone transport)', () => {
    it('uses the settable fallback duration', () => {
      TestBed.configureTestingModule({
        providers: [{ provide: AnimationService, useValue: null }],
      });
      const pb = TestBed.inject(PlaybackService);
      expect(pb.durationMs()).toBe(1000); // default fallback
      pb.setFallbackDuration(200);
      expect(pb.durationMs()).toBe(200);
      pb.seek(99999);
      expect(pb.playhead()).toBe(200); // clamped to the fallback duration
    });
  });
});
