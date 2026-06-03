import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { AnimationService } from './animation.service';

/** Default transport step (one frame at 60 fps) for {@link PlaybackService.stepForward}. */
export const DEFAULT_STEP_MS = 1000 / 60;

/**
 * **D-082 (Animation Timeline) — F2.** The transport: it owns the **playhead**
 * (current time, ms) and drives it forward in real time via
 * `requestAnimationFrame`. Pairs with {@link AnimationService} (which owns the
 * document/model) — this service only moves time; the displayed tree is
 * derived from `playhead` + the sampled animation by the preview layer (F6).
 *
 * **Non-destructive**: playing the timeline NEVER mutates the document — only
 * the `playhead` signal changes. At `playhead = 0` with no tracks, the sampled
 * animation is empty and the rendered tree is byte-for-byte the base document.
 *
 * **Why per-editor scope** (D-042): playback is editor-specific (each editor
 * has its own playhead / play state). Provided via
 * `provideSvgEngineEditorScope()`. `AnimationService` is injected optionally so
 * the transport also works standalone (tests / a duration set manually via
 * {@link setFallbackDuration}).
 *
 * **Testability**: the rAF loop calls {@link tick} internally, and {@link tick}
 * is public — a host without `requestAnimationFrame` (SSR, unit tests) can
 * drive playback deterministically by calling `tick(deltaMs)` itself. All the
 * transport math (clamp, loop wrap, end-stop, speed) lives in `tick`/`seek`,
 * not in the rAF callback, so it's covered without a real animation frame.
 */
@Injectable({ providedIn: 'root' })
export class PlaybackService {
  // Optional — the transport reads the timeline duration from here when
  // present; otherwise it uses the settable fallback.
  private readonly anim = inject(AnimationService, { optional: true });
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _playhead = signal(0);
  private readonly _isPlaying = signal(false);
  private readonly _loop = signal(false);
  private readonly _speed = signal(1);
  private readonly _fallbackDurationMs = signal(1000);

  /** Current playhead time, in milliseconds (read-only; mutate via the API). */
  readonly playhead = this._playhead.asReadonly();
  /** Whether the transport is currently advancing the playhead. */
  readonly isPlaying = this._isPlaying.asReadonly();
  /** Whether playback wraps back to 0 at the end instead of stopping. */
  readonly loop = this._loop.asReadonly();
  /** Playback speed multiplier (1 = real time). */
  readonly speed = this._speed.asReadonly();

  /**
   * Total timeline duration, in ms. Comes from {@link AnimationService} when
   * present (so editing the duration updates the transport bounds live),
   * otherwise the {@link setFallbackDuration} value. `??` (not `||`) so a real
   * `0` duration from the model is honored.
   */
  readonly durationMs = computed<number>(
    () => this.anim?.durationMs() ?? this._fallbackDurationMs(),
  );

  private rafId: number | null = null;
  /** Timestamp of the previous rAF callback (0 = "first frame, no delta yet"). */
  private lastTs = 0;

  constructor() {
    // Scoped service: cancel any in-flight rAF when the editor scope is torn
    // down (route change / component destroy) so we don't leak a loop.
    this.destroyRef.onDestroy(() => this.pause());
  }

  // ── transport controls ───────────────────────────────────────────

  /**
   * Start playing from the current playhead. If the playhead is already at (or
   * past) the end and we're not looping, restart from 0 (replay). No-op when
   * already playing. In an environment without `requestAnimationFrame`, this
   * sets `isPlaying` but relies on the host calling {@link tick}.
   */
  play(): void {
    if (this._isPlaying()) return;
    if (this._playhead() >= this.durationMs()) this._playhead.set(0);
    this._isPlaying.set(true);
    this.lastTs = 0;
    const loop = (ts: number): void => {
      if (!this._isPlaying()) return;
      if (this.lastTs === 0) this.lastTs = ts;
      const delta = ts - this.lastTs;
      this.lastTs = ts;
      this.advance(delta);
      // `advance` may have stopped us at the end — only reschedule if still on.
      if (this._isPlaying()) this.rafId = this.schedule(loop);
    };
    this.rafId = this.schedule(loop);
  }

  /** Stop playing and cancel the rAF loop. The playhead stays where it is. */
  pause(): void {
    this._isPlaying.set(false);
    if (this.rafId !== null) this.cancel(this.rafId);
    this.rafId = null;
    this.lastTs = 0;
  }

  /** Toggle between {@link play} and {@link pause}. */
  toggle(): void {
    if (this._isPlaying()) this.pause();
    else this.play();
  }

  /** Set the playhead to `timeMs`, clamped to `[0, duration]`. */
  seek(timeMs: number): void {
    this._playhead.set(this.clamp(timeMs));
  }

  /** Move the playhead by `deltaMs` (can be negative), clamped. */
  step(deltaMs: number): void {
    this.seek(this._playhead() + deltaMs);
  }

  /** Nudge the playhead forward by `deltaMs` (default one 60fps frame). */
  stepForward(deltaMs: number = DEFAULT_STEP_MS): void {
    this.step(Math.abs(deltaMs));
  }

  /** Nudge the playhead backward by `deltaMs` (default one 60fps frame). */
  stepBackward(deltaMs: number = DEFAULT_STEP_MS): void {
    this.step(-Math.abs(deltaMs));
  }

  /** Jump the playhead to the start (0). */
  goToStart(): void {
    this.seek(0);
  }

  /** Jump the playhead to the end (duration). */
  goToEnd(): void {
    this.seek(this.durationMs());
  }

  /** Enable/disable looping (wrap to 0 at the end instead of stopping). */
  setLoop(on: boolean): void {
    this._loop.set(on);
  }

  /** Set the playback speed multiplier (clamped to > 0; invalid → 1). */
  setSpeed(multiplier: number): void {
    this._speed.set(multiplier > 0 ? multiplier : 1);
  }

  /**
   * Set the fallback duration used when no {@link AnimationService} is present.
   * No effect on the bounds while an AnimationService is wired (its duration
   * wins). Clamped to ≥ 0.
   */
  setFallbackDuration(ms: number): void {
    this._fallbackDurationMs.set(ms < 0 ? 0 : ms);
  }

  /**
   * Advance the playhead by `deltaMs × speed`, honoring loop/end. **Public for
   * testability and for hosts without `requestAnimationFrame`** — the internal
   * rAF loop calls this with the real frame delta.
   */
  tick(deltaMs: number): void {
    this.advance(deltaMs);
  }

  // ── internals ────────────────────────────────────────────────────

  private advance(deltaMs: number): void {
    const dur = this.durationMs();
    const next = this._playhead() + deltaMs * this._speed();
    if (next >= dur) {
      if (this._loop() && dur > 0) {
        this._playhead.set(next % dur);
      } else {
        this._playhead.set(dur);
        this.pause();
      }
      return;
    }
    this._playhead.set(next < 0 ? 0 : next);
  }

  private clamp(timeMs: number): number {
    const dur = this.durationMs();
    if (timeMs < 0) return 0;
    if (timeMs > dur) return dur;
    return timeMs;
  }

  private schedule(cb: FrameRequestCallback): number | null {
    const win = this.window();
    if (win === null || typeof win.requestAnimationFrame !== 'function') return null;
    return win.requestAnimationFrame(cb);
  }

  private cancel(id: number): void {
    const win = this.window();
    if (win !== null && typeof win.cancelAnimationFrame === 'function') {
      win.cancelAnimationFrame(id);
    }
  }

  private window(): (Window & typeof globalThis) | null {
    const w = this.document.defaultView;
    if (w !== null) return w as Window & typeof globalThis;
    if (typeof window !== 'undefined') return window;
    return null;
  }
}
