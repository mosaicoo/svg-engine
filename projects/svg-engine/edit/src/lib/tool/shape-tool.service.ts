import { computed, Injectable, signal } from '@angular/core';
import type { Point } from 'svg-engine/core';

/**
 * Which primitive a press-drag-release gesture is creating. Drives the
 * preview shape rendered by {@link ShapeOverlay} + the factory call
 * dispatched on pointerup.
 */
export type ShapeKind = 'rect' | 'ellipse' | 'polygon';

/**
 * A press-drag-release in progress. Captured by `begin`, updated by
 * `update`, consumed by either `commit` (release) or `cancel` (Esc).
 *
 * Modifier keys are sampled from the LAST pointer event we saw, so
 * `Shift` constrain / `Alt` from-center take effect mid-drag without
 * needing the user to release + redo.
 */
export interface ShapeDraft {
  readonly kind: ShapeKind;
  /** Where pointerdown landed (doc coords). */
  readonly start: Point;
  /** Latest pointer position (doc coords). */
  readonly current: Point;
  /**
   * `Shift` constrains the bounding rectangle to a square — squares
   * for rect, circles for ellipse, regular n-gons for polygon.
   */
  readonly constrainAspect: boolean;
  /**
   * `Alt` interprets `start` as the CENTER of the shape (Illustrator
   * convention: "draw from center"). When false, `start` is the
   * top-left corner of the bounding rect.
   */
  readonly fromCenter: boolean;
}

/**
 * Reactive state for the {@link RectangleTool} / {@link EllipseTool} /
 * {@link PolygonTool} family. The tools mutate it via `begin/update/
 * commit/cancel`; the {@link ShapeOverlay} reads it to render the
 * dashed preview during drag.
 *
 * **Why a single shared service** (not one per tool): the overlay
 * only needs to know "is there a draft, and which kind". A single
 * signal + a discriminated union keeps the overlay simple (1 computed
 * for the bounding rect, 1 switch for the SVG shape).
 *
 * **Lifecycle**: `root`-provided singleton. The currently active
 * shape tool's `onActivate` / `onDeactivate` doesn't need to touch
 * the service — only the active gesture mutates state, and gestures
 * are bounded by pointerdown/pointerup pairs.
 */
@Injectable({ providedIn: 'root' })
export class ShapeToolService {
  private readonly _draft = signal<ShapeDraft | null>(null);

  /** Read-only draft signal — `null` when no gesture is in progress. */
  readonly draft = this._draft.asReadonly();

  /** `true` when any draft is active (drives overlay visibility). */
  readonly isDrafting = computed(() => this._draft() !== null);

  /**
   * Begin a press-drag-release. Called from a shape tool's
   * `onPointerDown`. The kind is fixed for the duration of the
   * gesture — switching tools mid-drag is not supported (the new
   * tool's onActivate would cancel first).
   */
  begin(kind: ShapeKind, start: Point, modifiers: { shift: boolean; alt: boolean }): void {
    this._draft.set({
      kind,
      start,
      current: start,
      constrainAspect: modifiers.shift,
      fromCenter: modifiers.alt,
    });
  }

  /**
   * Update the in-progress draft with the latest cursor position and
   * modifier state. Modifiers can flip mid-drag — Shift toggles
   * constrain in real time, matching Illustrator/Affinity behaviour.
   */
  update(current: Point, modifiers: { shift: boolean; alt: boolean }): void {
    const draft = this._draft();
    if (draft === null) return;
    this._draft.set({
      kind: draft.kind,
      start: draft.start,
      current,
      constrainAspect: modifiers.shift,
      fromCenter: modifiers.alt,
    });
  }

  /**
   * Drop the in-progress draft. Used on Esc (cancel) and after
   * `commit` completes (the tool already used the draft data to
   * build + dispatch the node, so state can be cleared).
   */
  cancel(): void {
    this._draft.set(null);
  }
}

/**
 * Compute the axis-aligned bounding box of a draft, honouring
 * `constrainAspect` (Shift → square/circle) and `fromCenter` (Alt
 * → start is the center). Returned as `{x, y, w, h}` in doc coords.
 *
 * **Pure** — exported for both the overlay (preview math) and the
 * shape tools (factory input math). One source of truth means the
 * preview can NEVER disagree with the committed shape.
 *
 * Edge cases:
 * - Zero-size drag (start === current) → returns `{x, y, 0, 0}`. The
 *   tool's commit path filters these to avoid inserting degenerate
 *   1×1px or 0×0 nodes.
 * - `constrainAspect` uses `min(|dx|, |dy|)` so the constrained side
 *   never overshoots the cursor (matches Illustrator: drag a 100×20
 *   rect with Shift → 20×20, not 100×100).
 */
export function boundsOfDraft(draft: ShapeDraft): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  let dx = draft.current.x - draft.start.x;
  let dy = draft.current.y - draft.start.y;
  if (draft.constrainAspect) {
    // Square / circle / regular polygon: clamp both axes to the
    // smaller absolute delta, preserving sign for direction.
    const m = Math.min(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * m;
    dy = Math.sign(dy || 1) * m;
  }
  if (draft.fromCenter) {
    // start is the center: bbox extends |dx|,|dy| in each direction.
    const w = Math.abs(dx) * 2;
    const h = Math.abs(dy) * 2;
    return { x: draft.start.x - Math.abs(dx), y: draft.start.y - Math.abs(dy), w, h };
  }
  // start is the top-left corner: bbox extends from start by (dx, dy).
  const x = dx >= 0 ? draft.start.x : draft.start.x + dx;
  const y = dy >= 0 ? draft.start.y : draft.start.y + dy;
  return { x, y, w: Math.abs(dx), h: Math.abs(dy) };
}

/**
 * Default number of sides used by the Polygon tool when the user
 * hasn't customised it. 6 (hexagon) is the Illustrator default and
 * reads as "a polygon" to most users while clearly differing from a
 * rect/circle.
 */
export const DEFAULT_POLYGON_SIDES = 6;

/**
 * Generate the vertices of a regular polygon inscribed in `bounds`,
 * starting from the top vertex and going clockwise. Used by the
 * Polygon tool's commit path + by {@link ShapeOverlay} for the
 * preview.
 *
 * - `sides` clamped to `[3, 32]` defensively.
 * - When `bounds.w` or `bounds.h` is 0, returns `[]` (commit path
 *   skips zero-size shapes).
 */
export function regularPolygonPoints(
  bounds: { x: number; y: number; w: number; h: number },
  sides: number,
): readonly Point[] {
  const n = Math.max(3, Math.min(32, Math.round(sides)));
  if (bounds.w === 0 || bounds.h === 0) return [];
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const rx = bounds.w / 2;
  const ry = bounds.h / 2;
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    // Start at -PI/2 (top vertex) and go clockwise. The negative
    // y-axis points "up" in screen coords, matching the intuition
    // that a hexagon should have a flat / pointed top depending on
    // odd/even rotation — start angle keeps the look predictable.
    const angle = -Math.PI / 2 + (i / n) * Math.PI * 2;
    out.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return out;
}
