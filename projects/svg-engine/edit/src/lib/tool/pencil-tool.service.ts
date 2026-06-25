import { computed, Injectable, signal } from '@angular/core';
import type { Point } from '@mosaicoo/svg-engine/core';

/**
 * Reactive state for the Pencil tool — the in-progress freehand stroke
 * lives here so the {@link PencilOverlay} component can render the
 * trace as the user drags, instead of waiting for `pointerup` to see
 * the final path (which was the v1 behaviour and felt broken to users).
 *
 * **Why a service** (mirrors {@link PenToolService}): the overlay
 * needs to read state reactively. Tool instances hold private state;
 * signals on a `root`-provided service expose it to other components
 * without leaking the tool's identity.
 *
 * **Lifecycle**: `root`-provided singleton. The Pencil tool's
 * `onActivate` / `onDeactivate` call {@link reset} so switching tools
 * mid-stroke doesn't leave stale state visible. `onPointerCancel`
 * (touch interruption) calls {@link cancel} for the same reason.
 *
 * **Stroke semantics**: the service is the single source of truth for
 * what got captured during a gesture. The tool calls {@link begin} on
 * pointerdown, {@link append} on each move, and {@link finish} on
 * release (which returns the captured points + resets the state). The
 * tool is responsible for converting the points into a path node and
 * dispatching the `InsertNodeCommand` — keeping the service free of
 * any document/command coupling so it stays testable in isolation.
 *
 * @internal **Cross-entry-point**: exportado para os overlays/painéis de
 * `svg-engine/ui` consumirem do pacote buildado. Fora do contrato público
 * estável — pode mudar sem major bump; consumidores externos não devem
 * depender diretamente.
 */
@Injectable({ providedIn: 'root' })
export class PencilToolService {
  // ── Private mutable state ─────────────────────────────────────────

  private readonly _points = signal<readonly Point[]>([]);
  private readonly _drawing = signal(false);

  // ── Public read-only signals ──────────────────────────────────────

  /** Recorded points in capture order — first is the pointerdown point. */
  readonly points = this._points.asReadonly();
  /** `true` between `begin()` and `finish()`/`cancel()`. */
  readonly drawing = this._drawing.asReadonly();
  /**
   * `true` when there are enough points to render a visible stroke
   * preview (≥ 2). Drives the overlay's `@if` gate so a fresh
   * pointerdown without movement doesn't draw a 0-length path.
   */
  readonly hasDraft = computed(() => this._drawing() && this._points().length >= 2);

  // ── Mutations called by the Pencil tool ───────────────────────────

  /** Start a new stroke — clears any previous buffer + sets `drawing`. */
  begin(start: Point): void {
    this._points.set([start]);
    this._drawing.set(true);
  }

  /**
   * Append a point to the buffer. No-op when not currently drawing
   * (defensive — handlers may race with `cancel()` on touch
   * interruption).
   */
  append(point: Point): void {
    if (!this._drawing()) return;
    this._points.update((list) => [...list, point]);
  }

  /**
   * Stop drawing and return the captured points. Caller is expected
   * to build a path from them (when `result.length >= 2`) and dispatch
   * the `InsertNodeCommand`. Service state is cleared regardless —
   * `drawing` flips back to `false`, points buffer empties.
   */
  finish(): readonly Point[] {
    const captured = this._points();
    this._drawing.set(false);
    this._points.set([]);
    return captured;
  }

  /** Discard the in-progress stroke without returning anything. */
  cancel(): void {
    this._drawing.set(false);
    this._points.set([]);
  }

  /**
   * Alias for {@link cancel} — used by the tool's `onActivate` /
   * `onDeactivate` for symmetry with `PenToolService.reset()`.
   */
  reset(): void {
    this.cancel();
  }

  // ── TOOL-OPT-B preference signals ────────────────────────────────
  // Style + behavior toggles consumed at commit time. Defaults match
  // the prior hardcoded values (`fill:none + stroke:#000000 + strokeWidth:2`
  // + open path) so existing tests/usages stay unchanged. Live with
  // the service so multi-editor scope (D-042) eventually applies.

  private readonly _fill = signal<string>('none');
  private readonly _stroke = signal<string>('#000000');
  private readonly _strokeWidth = signal<number>(2);
  private readonly _closePath = signal<boolean>(false);

  readonly fill = this._fill.asReadonly();
  readonly stroke = this._stroke.asReadonly();
  readonly strokeWidth = this._strokeWidth.asReadonly();
  readonly closePath = this._closePath.asReadonly();

  setFill(v: string): void {
    this._fill.set(v);
  }
  setStroke(v: string): void {
    this._stroke.set(v);
  }
  setStrokeWidth(px: number): void {
    this._strokeWidth.set(Math.max(0.5, Math.min(100, px)));
  }
  setClosePath(on: boolean): void {
    this._closePath.set(on);
  }
}
