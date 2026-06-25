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
} from '@mosaicoo/svg-engine/core';
import { AnimationService, PlaybackService, SelectionService } from '@mosaicoo/svg-engine/edit';
import { clientXToTime, SvgeTimeline } from './timeline.component';

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

// ── F5 — editing ──────────────────────────────────────────────────────

/** Mount the timeline directly so protected handlers are reachable for
 * deterministic, DOM-free interaction tests. */
function mount() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  const anim = TestBed.inject(AnimationService);
  const playback = TestBed.inject(PlaybackService);
  const selection = TestBed.inject(SelectionService);
  const fixture = TestBed.createComponent(SvgeTimeline);
  fixture.detectChanges();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reach protected handlers in tests
  const comp = fixture.componentInstance as any;
  return { fixture, state, anim, playback, selection, comp };
}

const kfTimes = (anim: AnimationService, nodeId: string, property: string): number[] =>
  anim
    .tracks()
    .find((t) => t.nodeId === nodeId && t.property === property)
    ?.keyframes.map((k) => k.time) ?? [];

const noop = (): void => {
  /* test stub */
};

/** Fake PointerEvent on a keyframe diamond (offsetParent supplies the lane box). */
function kfDown(left = 0, width = 100, clientX = 0): PointerEvent {
  return {
    stopPropagation: noop,
    pointerId: 1,
    clientX,
    currentTarget: {
      offsetParent: { getBoundingClientRect: () => ({ left, width }) },
      setPointerCapture: noop,
    },
  } as unknown as PointerEvent;
}
function ptrMove(clientX: number): PointerEvent {
  return { clientX } as PointerEvent;
}
function ptrUp(): PointerEvent {
  return {
    currentTarget: { releasePointerCapture: noop },
    pointerId: 1,
  } as unknown as PointerEvent;
}
function scrubDown(clientX: number, width = 200): PointerEvent {
  return {
    pointerId: 1,
    clientX,
    currentTarget: {
      getBoundingClientRect: () => ({ left: 0, width }),
      setPointerCapture: noop,
    },
  } as unknown as PointerEvent;
}
const targetEvent = (value: string): Event => ({ target: { value } }) as unknown as Event;

describe('D-082 F5 — SvgeTimeline (editing)', () => {
  describe('clientXToTime (pure)', () => {
    it('maps clientX to time within [0, duration]', () => {
      const r = { left: 0, width: 100 };
      expect(clientXToTime(50, r, 1000)).toBe(500);
      expect(clientXToTime(0, r, 1000)).toBe(0);
      expect(clientXToTime(100, r, 1000)).toBe(1000);
    });
    it('clamps out-of-range and degenerate inputs', () => {
      expect(clientXToTime(-20, { left: 0, width: 100 }, 1000)).toBe(0);
      expect(clientXToTime(9999, { left: 0, width: 100 }, 1000)).toBe(1000);
      expect(clientXToTime(50, { left: 0, width: 0 }, 1000)).toBe(0); // zero width
      expect(clientXToTime(50, { left: 0, width: 100 }, 0)).toBe(0); // zero duration
    });
    it('honors a non-zero lane offset', () => {
      expect(clientXToTime(150, { left: 100, width: 100 }, 1000)).toBe(500);
    });
  });

  it('the per-track key button sets a keyframe at the playhead capturing the live value', () => {
    const { fixture, state, anim, playback } = mount();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    playback.seek(300);
    fixture.detectChanges();
    const keyBtn = fixture.nativeElement.querySelector('.tl-key-btn') as HTMLButtonElement;
    keyBtn.click();
    expect(kfTimes(anim, rect.id, 'x')).toEqual([0, 300]);
    const kf = anim
      .tracks()
      .find((t) => t.property === 'x')!
      .keyframes.find((k) => k.time === 300)!;
    expect(kf.value).toBe(5); // rect.x === 5 was captured
  });

  it('dragging a keyframe diamond moves it (undoable command)', () => {
    const { state, anim, comp } = mount();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    comp.onKfDown(kfDown(0, 100), rect.id, 'x', 0);
    comp.onKfMove(ptrMove(50)); // 50% of 1000ms → 500
    comp.onKfUp(ptrUp());
    expect(kfTimes(anim, rect.id, 'x')).toEqual([500]);
  });

  it('a click on a diamond (no movement) selects without moving it', () => {
    const { state, anim, comp } = mount();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 200, value: 0, easing: DEFAULT_EASING });
    comp.onKfDown(kfDown(0, 100), rect.id, 'x', 200);
    comp.onKfUp(ptrUp()); // no move in between
    expect(kfTimes(anim, rect.id, 'x')).toEqual([200]); // unchanged
    expect(comp.selectedKfView()).not.toBeNull();
  });

  it('sub-threshold pointer jitter is treated as a click, not a move', () => {
    const { state, anim, comp } = mount();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 200, value: 0, easing: DEFAULT_EASING });
    comp.onKfDown(kfDown(0, 100, 40), rect.id, 'x', 200); // pointer starts at 40
    comp.onKfMove(ptrMove(42)); // only 2px — below the 4px drag threshold
    comp.onKfUp(ptrUp());
    expect(kfTimes(anim, rect.id, 'x')).toEqual([200]); // unchanged → selectable
    expect(comp.selectedKfView()).not.toBeNull();
  });

  it('the × button removes the whole track and clears its selection', () => {
    const { state, anim, comp } = mount();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    anim.addKeyframe(rect.id, 'x', { time: 500, value: 9, easing: DEFAULT_EASING });
    comp.onKfDown(kfDown(), rect.id, 'x', 0);
    comp.onKfUp(ptrUp());
    expect(comp.selectedKfView()).not.toBeNull();
    comp.removeTrack(rect.id, 'x');
    expect(anim.tracks().find((t) => t.property === 'x')).toBeUndefined();
    expect(comp.selectedKfView()).toBeNull();
  });

  it('the footer deletes the selected keyframe', () => {
    const { fixture, state, anim, comp } = mount();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    anim.addKeyframe(rect.id, 'x', { time: 500, value: 9, easing: DEFAULT_EASING });
    comp.onKfDown(kfDown(), rect.id, 'x', 500);
    comp.onKfUp(ptrUp());
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.tl-del-btn') as HTMLButtonElement).click();
    expect(kfTimes(anim, rect.id, 'x')).toEqual([0]);
    expect(comp.selectedKfView()).toBeNull();
  });

  it('Delete on a focused keyframe removes that keyframe (not the shape) and stops the event', () => {
    const { state, anim, comp } = mount();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    anim.addKeyframe(rect.id, 'x', { time: 500, value: 9, easing: DEFAULT_EASING });
    comp.onKfDown(kfDown(), rect.id, 'x', 500);
    comp.onKfUp(ptrUp());
    let stopped = false;
    const ev = {
      key: 'Delete',
      preventDefault: noop,
      stopPropagation: () => {
        stopped = true;
      },
    } as unknown as KeyboardEvent;
    comp.onKfKey(ev);
    expect(kfTimes(anim, rect.id, 'x')).toEqual([0]); // only the selected kf was removed
    expect(comp.selectedKfView()).toBeNull();
    expect(stopped).toBe(true); // shell's document Delete handler is prevented
  });

  it('Escape on a focused keyframe clears the selection', () => {
    const { state, anim, comp } = mount();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    comp.onKfDown(kfDown(), rect.id, 'x', 0);
    comp.onKfUp(ptrUp());
    expect(comp.selectedKfView()).not.toBeNull();
    comp.onKfKey({ key: 'Escape', preventDefault: noop, stopPropagation: noop } as KeyboardEvent);
    expect(comp.selectedKfView()).toBeNull();
    expect(kfTimes(anim, rect.id, 'x')).toEqual([0]); // nothing removed
  });

  it('changes the easing of the selected keyframe', () => {
    const { state, anim, comp } = mount();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    comp.onKfDown(kfDown(), rect.id, 'x', 0);
    comp.onKfUp(ptrUp());
    comp.onEasingChange(targetEvent('easeIn'));
    const kf = anim.tracks().find((t) => t.property === 'x')!.keyframes[0]!;
    expect(kf.easing).toEqual({ kind: 'easeIn' });
  });

  it('sets the duration from the header input', () => {
    const { anim, comp } = mount();
    expect(anim.durationMs()).toBe(1000); // default
    comp.onDurationChange(targetEvent('2500'));
    expect(anim.durationMs()).toBe(2500);
  });

  it('scrubbing seeks the playhead', () => {
    const { state, anim, playback, comp } = mount();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 0, value: 0, easing: DEFAULT_EASING });
    comp.onScrubDown(scrubDown(100, 200)); // 100/200 → 50% → 500ms
    expect(playback.playhead()).toBe(500);
    comp.onScrubMove(ptrMove(50)); // 50/200 → 25% → 250ms
    expect(playback.playhead()).toBe(250);
    comp.onScrubUp(ptrUp());
  });

  it('starts a new track for a property of the selected shape', () => {
    const { state, anim, selection, comp } = mount();
    const rect = seedRect(state);
    selection.select(rect.id);
    // 'opacity' is animatable and not yet tracked → addable
    expect(
      comp.addableProperties().some((p: { property: string }) => p.property === 'opacity'),
    ).toBe(true);
    comp.onAddPropertyChange(targetEvent('opacity'));
    comp.addTrack();
    expect(anim.tracks().some((t) => t.nodeId === rect.id && t.property === 'opacity')).toBe(true);
  });
});

describe('D-082 F6 — SvgeTimeline transport', () => {
  it('renders the transport controls + speed select in the header', () => {
    const { fixture } = mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.tl-transport')).not.toBeNull();
    expect(host.querySelector('.tl-play')).not.toBeNull();
    expect(host.querySelector('.tl-speed')).not.toBeNull();
  });

  it('play/pause toggles PlaybackService.isPlaying', () => {
    const { playback, comp } = mount();
    comp.togglePlay();
    expect(playback.isPlaying()).toBe(true);
    comp.togglePlay();
    expect(playback.isPlaying()).toBe(false);
  });

  it('the loop button toggles looping', () => {
    const { playback, comp } = mount();
    comp.toggleLoop();
    expect(playback.loop()).toBe(true);
    comp.toggleLoop();
    expect(playback.loop()).toBe(false);
  });

  it('the speed select changes playback speed', () => {
    const { playback, comp } = mount();
    comp.onSpeedChange(targetEvent('2'));
    expect(playback.speed()).toBe(2);
  });

  it('start / end / step move the playhead', () => {
    const { playback, comp } = mount();
    comp.toEnd();
    expect(playback.playhead()).toBe(1000); // default duration
    comp.toStart();
    expect(playback.playhead()).toBe(0);
    playback.seek(500);
    comp.stepFwd();
    expect(playback.playhead()).toBeGreaterThan(500);
    const fwd = playback.playhead();
    comp.stepBack();
    expect(playback.playhead()).toBeLessThan(fwd);
  });
});

const kfValue = (
  anim: AnimationService,
  nodeId: string,
  property: string,
  time: number,
): number | string | undefined =>
  anim
    .tracks()
    .find((t) => t.nodeId === nodeId && t.property === property)
    ?.keyframes.find((k) => k.time === time)?.value;

describe('D-082 follow-up — set keyframe value + seek-on-select', () => {
  it('selecting a keyframe seeks the playhead to its time', () => {
    const { state, anim, playback, comp } = mount();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 300, value: 9, easing: DEFAULT_EASING });
    comp.onKfDown(kfDown(), rect.id, 'x', 300);
    comp.onKfUp(ptrUp()); // a click (no move)
    expect(playback.playhead()).toBe(300);
  });

  it('the footer value input sets the keyframe value, preserving the easing', () => {
    const { state, anim, comp } = mount();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'x', { time: 0, value: 5, easing: { kind: 'easeIn' } });
    comp.onKfDown(kfDown(), rect.id, 'x', 0);
    comp.onKfUp(ptrUp());
    comp.onKfValueChange(targetEvent('42'));
    expect(kfValue(anim, rect.id, 'x', 0)).toBe(42);
    // easing carried over (moveKeyframe preserves it)
    const kf = anim.tracks().find((t) => t.property === 'x')!.keyframes[0]!;
    expect(kf.easing).toEqual({ kind: 'easeIn' });
  });

  it('the footer value input edits a color keyframe', () => {
    const { state, anim, comp } = mount();
    const rect = seedRect(state);
    anim.addKeyframe(rect.id, 'fill', { time: 0, value: '#ff0000', easing: DEFAULT_EASING });
    comp.onKfDown(kfDown(), rect.id, 'fill', 0);
    comp.onKfUp(ptrUp());
    expect(comp.selectedKfView().kind).toBe('color');
    comp.onKfValueChange(targetEvent('#00ff00'));
    expect(kfValue(anim, rect.id, 'fill', 0)).toBe('#00ff00');
  });

  it('colorInputValue coerces non-hex values to #000000', () => {
    const { comp } = mount();
    expect(comp.colorInputValue('#abcdef')).toBe('#abcdef');
    expect(comp.colorInputValue('rgb(1,2,3)')).toBe('#000000');
    expect(comp.colorInputValue(42)).toBe('#000000');
  });
});

describe('D-082 follow-up — multi-property + multi-shape authoring', () => {
  const propsFor = (anim: AnimationService, nodeId: string): string[] =>
    anim
      .tracks()
      .filter((t) => t.nodeId === nodeId)
      .map((t) => t.property)
      .sort();

  it('the add-track row stays available while a keyframe is selected (more properties)', () => {
    const { state, anim, selection, comp } = mount();
    const rect = seedRect(state);
    selection.select(rect.id);

    comp.onAddPropertyChange(targetEvent('opacity'));
    comp.addTrack();
    // The newly-added keyframe is auto-selected (keyframe editor visible)…
    expect(comp.selectedKfView()).not.toBeNull();
    // …AND the add-track row is still available (independent of selection).
    expect(comp.addableProperties().length).toBeGreaterThan(0);
    // The already-animated property dropped out of the addable list.
    expect(
      comp.addableProperties().some((p: { property: string }) => p.property === 'opacity'),
    ).toBe(false);

    // Add a second property on the same shape — no need to deselect first.
    comp.onAddPropertyChange(targetEvent('rotation'));
    comp.addTrack();
    expect(propsFor(anim, rect.id)).toEqual(['opacity', 'rotation']);
  });

  it('animates a second shape by selecting it (add-track follows the focused shape)', () => {
    const { state, anim, selection, comp } = mount();
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const b = createRect({ x: 50, y: 0, width: 10, height: 10 });
    const doc = state.document();
    state.setDocument({ ...doc, root: { ...doc.root, children: [a, b] } });

    selection.select(a.id);
    comp.onAddPropertyChange(targetEvent('opacity'));
    comp.addTrack();

    // Switch to shape B — its addable properties surface even with a keyframe
    // from shape A still selected.
    selection.select(b.id);
    expect(comp.addableProperties().length).toBeGreaterThan(0);
    comp.onAddPropertyChange(targetEvent('x'));
    comp.addTrack();

    expect(anim.tracks().some((t) => t.nodeId === a.id && t.property === 'opacity')).toBe(true);
    expect(anim.tracks().some((t) => t.nodeId === b.id && t.property === 'x')).toBe(true);
  });
});
