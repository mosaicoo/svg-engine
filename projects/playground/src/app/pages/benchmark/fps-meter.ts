/**
 * Frame-rate sampler used by the `/benchmark` page (ex `/perf`, renamed
 * in D-041).
 *
 * **How it works**: rAF callback records `performance.now()`; each delta
 * is pushed into a fixed-size ring buffer (`windowFrames`, default 60).
 * `currentFps` returns the inverse of the rolling-mean delta. Cheap O(1)
 * per frame, no allocation in steady state.
 *
 * **`onTick`** fires once per ~250ms (configurable) with the current FPS
 * — consumers wire it to a signal `.set()` to drive the UI without
 * thrashing change detection on every animation frame.
 *
 * **Pause**: rAF is naturally paused when the tab is hidden (browser
 * doesn't fire callbacks) — no manual visibility handling needed.
 */
export interface FpsMeterOptions {
  /** How many recent frame deltas to average over. Default 60 (~1s @ 60fps). */
  readonly windowFrames?: number;
  /** UI update interval in ms. Default 250 (4 Hz — readable, no flicker). */
  readonly tickIntervalMs?: number;
}

export class FpsMeter {
  private readonly windowFrames: number;
  private readonly tickIntervalMs: number;
  private readonly deltas: number[];
  private head = 0;
  private filled = 0;
  private lastFrameTime: number | null = null;
  private lastTickTime = 0;
  private rafId: number | null = null;
  private onTick: ((fps: number) => void) | null = null;

  constructor(options: FpsMeterOptions = {}) {
    this.windowFrames = options.windowFrames ?? 60;
    this.tickIntervalMs = options.tickIntervalMs ?? 250;
    this.deltas = new Array(this.windowFrames).fill(0);
  }

  /**
   * Start sampling. `tick` fires roughly every `tickIntervalMs` with the
   * current rolling-average FPS. Calling `start` while already running
   * is a no-op (idempotent).
   */
  start(tick: (fps: number) => void): void {
    if (this.rafId !== null) return;
    this.onTick = tick;
    this.lastFrameTime = null;
    this.lastTickTime = performance.now();
    this.head = 0;
    this.filled = 0;
    const loop = (now: number): void => {
      if (this.lastFrameTime !== null) {
        const delta = now - this.lastFrameTime;
        this.deltas[this.head] = delta;
        this.head = (this.head + 1) % this.windowFrames;
        if (this.filled < this.windowFrames) this.filled++;
      }
      this.lastFrameTime = now;
      if (now - this.lastTickTime >= this.tickIntervalMs && this.onTick !== null) {
        this.lastTickTime = now;
        this.onTick(this.currentFps());
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** Cancel the rAF loop. Safe to call multiple times. */
  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.onTick = null;
  }

  /**
   * Current rolling-average FPS (1000 / mean delta). Returns 0 when no
   * samples yet (first frame after start).
   */
  currentFps(): number {
    if (this.filled === 0) return 0;
    let sum = 0;
    for (let i = 0; i < this.filled; i++) sum += this.deltas[i]!;
    const mean = sum / this.filled;
    return mean > 0 ? 1000 / mean : 0;
  }
}
