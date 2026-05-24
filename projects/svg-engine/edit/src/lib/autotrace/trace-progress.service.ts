import { computed, Injectable, signal } from '@angular/core';

/**
 * **D-066** — Per-editor "tracing in progress" signal. The async
 * portion of `TraceImageCommand.prepare()` (image fetch + canvas
 * rasterization + marching squares + Douglas-Peucker) can take
 * hundreds of milliseconds for large images; without feedback the
 * user is left wondering whether they actually triggered the action.
 *
 * **Counter-based** (not a boolean) so multiple parallel traces are
 * tracked correctly — `running` stays true until ALL in-flight
 * traces finish. Parallel traces are rare (you'd need two different
 * shells firing simultaneously) but the counter pattern is more
 * defensive than a boolean that could flip false too early.
 *
 * **Scoped per-editor** (D-042): two editor instances trace
 * independently — the status pill in editor A doesn't light up
 * because editor B is tracing.
 *
 * **Usage pattern** (caller wraps the async work):
 * ```ts
 * const progress = injector.get(TraceProgressService);
 * progress.start();
 * try {
 *   await cmd.prepare({ state });
 *   bus.dispatch(cmd);
 * } finally {
 *   progress.stop();  // always — success or fail
 * }
 * ```
 *
 * **Why caller-driven** (not baked into `TraceImageCommand`): the
 * command lives in `svg-engine/edit` headless and is decoupled from
 * DI containers; baking start/stop would couple it to the service.
 * Wrapping at the call site (menu handler, dialog handler) keeps the
 * command pure and lets headless consumers opt out by simply not
 * injecting the service.
 */
@Injectable({ providedIn: 'root' })
export class TraceProgressService {
  private readonly _count = signal<number>(0);

  /** Number of traces currently in flight (≥ 0). */
  readonly count = this._count.asReadonly();
  /** True when at least one trace is running. Drives the status-bar pill. */
  readonly running = computed(() => this._count() > 0);

  /** Mark the start of one trace operation. Always pair with `stop()`. */
  start(): void {
    this._count.update((n) => n + 1);
  }

  /** Mark a trace finished (success or failure). Clamped at 0 defensively. */
  stop(): void {
    this._count.update((n) => Math.max(0, n - 1));
  }
}
