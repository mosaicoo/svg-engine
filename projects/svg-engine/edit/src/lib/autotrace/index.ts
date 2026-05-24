/**
 * **D-062d** — Auto-trace (raster → vector) module. Single-threshold
 * marching-squares + Douglas-Peucker. See `trace-bitmap.ts` for the
 * algorithm, scope, and honest limitations vs. potrace-grade tracers.
 *
 * Public surface:
 * - {@link traceImageToPaths} — pure function: `ImageData` → `d`
 *   strings. No Angular. Good for specs.
 * - {@link TraceImageCommand} — wraps a selected `ImageNode`, loads
 *   the raster, traces, and inserts the result as a group. Async
 *   `prepare()` step before dispatch (CommandBus.dispatch is sync).
 */

export { traceImageToPaths, type TraceOptions } from './trace-bitmap';
export { TraceImageCommand } from './trace-image.command';
export { TraceProgressService } from './trace-progress.service';
