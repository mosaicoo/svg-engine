import { computed, Injectable, signal } from '@angular/core';
import { type BoundingBox, bbox, type NodeId, type Point } from 'svg-engine/core';

/**
 * Whether a marquee hit-test counts a node when the marquee fully
 * contains its bbox (`'contain'`) or when the marquee merely overlaps
 * it (`'intersect'`). Defaults to `'intersect'` (Illustrator/Affinity
 * default — friendlier for quick drag-selection).
 */
export type MarqueeHitMode = 'intersect' | 'contain';

/**
 * Whether starting a new marquee replaces the previous selection or
 * adds to it (Shift-modifier). When `'add'`, `initialSelection` is the
 * snapshot of the selection at marquee-start so we can restore-then-add
 * on every update without losing pre-existing members.
 */
export type MarqueeMode = 'replace' | 'add';

export interface MarqueeState {
  readonly startPoint: Point;
  readonly currentPoint: Point;
  readonly mode: MarqueeMode;
  /** Snapshot of `SelectionService.selectedIds()` at gesture start. */
  readonly initialSelection: ReadonlySet<NodeId>;
}

/**
 * Drag-to-select state. Pure transient editor state — not part of
 * `SvgDocument`, not undoable. Lives only for the duration of one
 * pointer gesture.
 *
 * **Lifecycle**:
 * - `start(point, mode, initialSelection)`: stamp the gesture origin and
 *   capture the pre-existing selection for `'add'` mode.
 * - `update(currentPoint)`: move the trailing edge of the marquee. Does
 *   **not** touch `SelectionService` directly — the playground (or any
 *   consumer) reads `rect()` and feeds it into `nodesInsideMarquee` to
 *   compute the new selection.
 * - `end()`: clear the state. The consumer commits the resulting
 *   selection via `SelectionService.selectMany`.
 * - `cancel()`: identical to `end()` for now (no rollback needed because
 *   the consumer drives selection updates each frame).
 *
 * **Why no SelectionService dependency**: keeping marquee state pure
 * lets us unit-test the rect math in isolation and lets consumers
 * decide *when* to push selection changes (e.g., throttle, debounce).
 */
@Injectable({ providedIn: 'root' })
export class MarqueeService {
  private readonly _state = signal<MarqueeState | null>(null);

  /** Current gesture state, or `null` when no marquee is in progress. */
  readonly state = this._state.asReadonly();

  /** Whether a marquee is currently being dragged. */
  readonly isActive = computed(() => this._state() !== null);

  /**
   * Axis-aligned bounding box of the marquee in document coords, or
   * `null` when no gesture is active. The rect is normalized so width
   * and height are always non-negative even when the user drags up/left.
   */
  readonly rect = computed<BoundingBox | null>(() => {
    const s = this._state();
    if (s === null) return null;
    return rectFromPoints(s.startPoint, s.currentPoint);
  });

  /**
   * Begin a marquee gesture anchored at `startPoint` (in document coords).
   *
   * @param mode `'replace'` to overwrite the selection on commit, `'add'`
   *   to union the marquee result with `initialSelection` (Shift-drag).
   * @param initialSelection snapshot of the current selection — captured
   *   so successive `update` calls can rebuild the union from scratch
   *   without accumulating leftovers.
   */
  start(startPoint: Point, mode: MarqueeMode, initialSelection: ReadonlySet<NodeId>): void {
    if (this._state() !== null) return;
    this._state.set({
      startPoint,
      currentPoint: startPoint,
      mode,
      initialSelection: new Set(initialSelection),
    });
  }

  /**
   * Update the marquee's trailing corner. No-op when no gesture is
   * active (so spurious `pointermove` events after `end` are harmless).
   */
  update(currentPoint: Point): void {
    const s = this._state();
    if (s === null) return;
    this._state.set({ ...s, currentPoint });
  }

  /** Clear the gesture. The consumer is responsible for committing selection. */
  end(): void {
    this._state.set(null);
  }

  /** Same as `end()` for now — kept distinct so future Esc semantics can diverge. */
  cancel(): void {
    this._state.set(null);
  }
}

/**
 * Build an axis-aligned `BoundingBox` from two arbitrary points, with
 * non-negative width and height (so dragging up/left still produces a
 * valid rect).
 *
 * Exported because the marquee hit-test helper needs the same
 * normalization at call time, and it's useful for any consumer that
 * wants to materialize the marquee box without reading the signal.
 */
export function rectFromPoints(a: Point, b: Point): BoundingBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return bbox(x, y, w, h);
}
