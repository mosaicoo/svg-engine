import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { describe, expect, it } from 'vitest';
import {
  createEmptyDocument,
  createRect,
  DEFAULT_EASING,
  EditorStateService,
  type RectNode,
} from 'svg-engine/core';
import { AnimationService, PlaybackService } from 'svg-engine/edit';
import { SvgeTimeline } from './timeline.component';

@Component({
  standalone: true,
  imports: [SvgeTimeline],
  template: `<svge-timeline />`,
})
class TestHost {}

function setup() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [TestHost],
    providers: [provideNoopAnimations()],
  });
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  const anim = TestBed.inject(AnimationService);
  const playback = TestBed.inject(PlaybackService);
  const fixture = TestBed.createComponent(TestHost);
  fixture.detectChanges();
  return { fixture, state, anim, playback };
}

/** Add a rect to the document so node-label lookup resolves, return its id. */
function seedRect(state: EditorStateService): RectNode {
  const rect = createRect({ x: 5, y: 5, width: 20, height: 10 });
  const doc = state.document();
  state.setDocument({ ...doc, root: { ...doc.root, children: [rect] } });
  return rect;
}

describe('D-082 F4 — SvgeTimeline (read-only)', () => {
  it('shows the empty state when the page has no animation', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('.tl-empty')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.tl-lane')).toBeNull();
  });

  it('renders one node row + one track row per animated property', () => {
    const { fixture, state, anim } = setup();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    anim.addKeyframe(rect.id, 'x', { time: 500, value: 50, easing: DEFAULT_EASING });
    anim.addKeyframe(rect.id, 'opacity', { time: 0, value: 1, easing: DEFAULT_EASING });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.tl-empty')).toBeNull();
    // one node header row…
    expect(host.querySelectorAll('.tl-label--node').length).toBe(1);
    // …with the rect's type-based label
    expect(host.querySelector('.tl-label--node')?.textContent).toContain('rect');
    // two track rows (x + opacity)
    expect(host.querySelectorAll('.tl-label--track').length).toBe(2);
  });

  it('renders a keyframe diamond per keyframe', () => {
    const { fixture, state, anim } = setup();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    anim.addKeyframe(rect.id, 'x', { time: 1000, value: 50, easing: DEFAULT_EASING });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.tl-kf').length).toBe(2);
  });

  it('positions a keyframe at the correct percent of the duration', () => {
    const { fixture, state, anim } = setup();
    const rect = seedRect(state);
    // default duration is 1000ms → a keyframe at 500ms sits at 50%.
    anim.addKeyframe(rect.id, 'x', { time: 500, value: 9, easing: DEFAULT_EASING });
    fixture.detectChanges();
    const kf = fixture.nativeElement.querySelector('.tl-kf') as HTMLElement;
    expect(kf.style.left).toBe('50%');
  });

  it('renders the time ruler and the playhead (at 0% by default)', () => {
    const { fixture, state, anim } = setup();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelectorAll('.tl-tick').length).toBeGreaterThan(1);
    const playhead = host.querySelector('.tl-playhead') as HTMLElement;
    expect(playhead).not.toBeNull();
    expect(playhead.style.left).toBe('0%');
  });

  it('moves the playhead indicator with PlaybackService', () => {
    const { fixture, state, anim, playback } = setup();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    playback.seek(250); // 25% of the default 1000ms duration
    fixture.detectChanges();
    const playhead = fixture.nativeElement.querySelector('.tl-playhead') as HTMLElement;
    expect(playhead.style.left).toBe('25%');
  });

  it('shows the playhead / duration readout', () => {
    const { fixture, state, anim, playback } = setup();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    playback.seek(500);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tl-time')?.textContent).toContain('0.5s / 1s');
  });
});
