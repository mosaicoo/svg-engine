import { computed, Injectable, signal } from '@angular/core';
import type { SprayDrop } from './insert-symbol-instances-batch.command';

/**
 * **D-063b** — Reactive state for the Symbol Sprayer's live preview.
 * The Sprayer tool used to buffer drops in a private field and only
 * paint them on pointer-up (via `InsertSymbolInstancesBatchCommand`).
 * That was disconcerting — the user saw nothing during the drag and
 * everything appeared on release.
 *
 * **What changed** (D-063): the tool now also writes each drop into
 * this service, and the `<svg:g svgeSymbolSprayerOverlay>` component
 * renders the buffer as ghosted `<use>` elements in real time. On
 * pointer-up the tool clears this buffer and dispatches the same
 * batch command as before — the FINAL document state is unchanged.
 *
 * **Why a separate service** (mirrors {@link PencilToolService}):
 * the overlay component needs to react to drops without the tool
 * leaking its private state. A signal-backed service is the
 * standard pattern for tool ↔ overlay communication in this
 * codebase.
 *
 * **Why scoped per-editor** (D-042): two editors should be free to
 * spray independently — the preview must be isolated.
 *
 * **Lifecycle**:
 * - `begin(symbolId)` — start a fresh preview (clears prior drops,
 *   pins the symbol id so the overlay knows what to render).
 * - `append(drop)` — add one drop. Triggers overlay re-render via
 *   the signal change.
 * - `clear()` — discard the buffer (called by the tool on pointer-up
 *   AFTER dispatching the command, or on cancel).
 *
 * **Performance**: the signal holds an immutable array; appends
 * allocate a new array (small N — 10s to low 100s of drops per
 * gesture). Overlay re-renders the full set on each change — Angular's
 * `@for` track-by-index avoids DOM thrashing.
 */
@Injectable({ providedIn: 'root' })
export class SymbolSprayerPreviewService {
  private readonly _drops = signal<readonly SprayDrop[]>([]);
  private readonly _symbolId = signal<string | null>(null);

  /** Pending drops in capture order (centroid-based positions). */
  readonly drops = this._drops.asReadonly();
  /** Id of the symbol being sprayed — drives the overlay's `<use href="#…">`. */
  readonly symbolId = this._symbolId.asReadonly();
  /** True when at least one drop has accumulated under an active symbol. */
  readonly hasPreview = computed(() => this._symbolId() !== null && this._drops().length > 0);

  /**
   * Start a fresh preview pass. Replaces any prior buffer (a
   * stale buffer from an aborted gesture). Pins the symbol id so
   * the overlay can resolve the master to render the `<use>`s.
   */
  begin(symbolId: string): void {
    this._symbolId.set(symbolId);
    this._drops.set([]);
  }

  /** Append a drop to the buffer (idempotent if `begin` wasn't called). */
  append(drop: SprayDrop): void {
    this._drops.update((list) => [...list, drop]);
  }

  /** Drop the preview state — call after dispatching the batch command. */
  clear(): void {
    this._drops.set([]);
    this._symbolId.set(null);
  }
}
