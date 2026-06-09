import { computed, Injectable, signal } from '@angular/core';
import {
  type AnchorPoint,
  type AnchorSubpath,
  anchorsToPathD,
  createPath,
  type PathNode,
  type Point,
} from 'svg-engine/core';

/**
 * Reactive state for the Pen tool — the path under construction lives
 * here so the {@link PenOverlay} component can render rubber-band
 * previews + in-progress anchors without the tool plugin having to
 * forward events imperatively.
 *
 * **Why a service** (not internal state on the Tool class): the
 * overlay component needs to read the state reactively. Tool instances
 * hold private state; signals on a `root`-provided service expose it
 * to other components without leaking the tool's identity.
 *
 * **Lifecycle**: the service is `root`-provided (single instance per
 * Angular app). The Pen tool's `onActivate/Deactivate` should call
 * {@link reset} to make sure switching tools mid-gesture doesn't leave
 * stale state visible.
 *
 * @internal **Cross-entry-point**: exportado para os overlays/painéis de
 * `svg-engine/ui` consumirem do pacote buildado. Fora do contrato público
 * estável — pode mudar sem major bump; consumidores externos não devem
 * depender diretamente.
 */
@Injectable({ providedIn: 'root' })
export class PenToolService {
  // ── Private mutable state ─────────────────────────────────────────

  private readonly _anchors = signal<readonly AnchorPoint[]>([]);
  /**
   * When the user presses down, we don't yet know if it'll be a click
   * (→ cusp anchor) or a drag (→ smooth anchor). We capture the start
   * point and the live current point; the tool dispatches `commitDrag`
   * or `commitClick` on pointerup based on the distance moved.
   */
  private readonly _dragState = signal<{ start: Point; current: Point } | null>(null);
  /**
   * Pointer position with no button pressed — drives the "rubber band"
   * preview line/curve from the last placed anchor to the cursor.
   * `null` when the cursor isn't over the canvas or when the tool isn't
   * active.
   */
  private readonly _previewPoint = signal<Point | null>(null);
  /**
   * `true` when the cursor is close enough to the first anchor that
   * pointerdown would close the path (≥ 2 anchors required). Drives the
   * snap indicator on the first anchor square + cursor change hint.
   */
  private readonly _snappingToFirst = signal(false);

  // ── Public read-only signals ──────────────────────────────────────

  readonly anchors = this._anchors.asReadonly();
  readonly dragState = this._dragState.asReadonly();
  readonly previewPoint = this._previewPoint.asReadonly();
  readonly snappingToFirst = this._snappingToFirst.asReadonly();

  /** `true` when at least one anchor is placed (overlay should render). */
  readonly hasActivePath = computed(() => this._anchors().length > 0);

  /** `true` when finalising would produce a closeable shape (≥ 2 anchors). */
  readonly canClose = computed(() => this._anchors().length >= 2);

  // ── Mutations called by the Pen tool ──────────────────────────────

  /**
   * Begin a press-drag-release cycle. Stores the start point so we can
   * compute drag distance on pointerup. The actual anchor type (cusp vs
   * smooth) is decided then, based on how far the cursor moved.
   */
  beginPotentialDrag(start: Point): void {
    this._dragState.set({ start, current: start });
  }

  /**
   * Update the in-progress drag. Called from `onPointerMove` while the
   * button is held. Triggers the symmetric-handle preview rendered by
   * {@link PenOverlay}.
   */
  updateDrag(current: Point): void {
    const ds = this._dragState();
    if (ds === null) return;
    this._dragState.set({ start: ds.start, current });
  }

  /**
   * Commit the current drag as a **smooth** anchor with handles derived
   * from the drag delta:
   *
   * - `handleOut = current` (where the cursor is)
   * - `handleIn = mirror of handleOut around `start` (= `2·start − current`)
   *
   * Result: a perfectly symmetric Bezier vertex. The user can refine
   * later via the Path Editor (Direct Select tool) if asymmetry is wanted.
   */
  commitDrag(): void {
    const ds = this._dragState();
    if (ds === null) return;
    const { start, current } = ds;
    const handleIn: Point = { x: 2 * start.x - current.x, y: 2 * start.y - current.y };
    const handleOut: Point = current;
    const anchor: AnchorPoint = {
      point: start,
      handleIn,
      handleOut,
      kind: 'symmetric',
    };
    this._anchors.update((list) => [...list, anchor]);
    this._dragState.set(null);
  }

  /**
   * Commit the current pending position as a **cusp** anchor (no
   * handles). Used when the user clicks without dragging.
   */
  commitClick(): void {
    const ds = this._dragState();
    if (ds === null) return;
    const point = ds.start;
    const anchor: AnchorPoint = {
      point,
      handleIn: point,
      handleOut: point,
      kind: 'cusp',
    };
    this._anchors.update((list) => [...list, anchor]);
    this._dragState.set(null);
  }

  /**
   * Drop the in-progress drag without committing. Used when the user
   * cancels mid-gesture (pointercancel from a touch interruption) but
   * the already-placed anchors stay intact.
   */
  cancelDrag(): void {
    this._dragState.set(null);
  }

  /** Update the rubber-band cursor position (no button pressed). */
  updatePreview(point: Point | null): void {
    this._previewPoint.set(point);
  }

  /** Set whether the cursor is in close-to-first range. */
  setSnappingToFirst(snapping: boolean): void {
    this._snappingToFirst.set(snapping);
  }

  /**
   * Wipe ALL state — used on tool deactivation, Esc, or after a
   * successful finalise. The overlay will hide itself (computed
   * `hasActivePath` flips to `false`).
   */
  reset(): void {
    this._anchors.set([]);
    this._dragState.set(null);
    this._previewPoint.set(null);
    this._snappingToFirst.set(false);
  }

  // ── Finalisation helpers (return a SvgNode for the caller to dispatch) ─

  /**
   * Build a `PathNode` from the placed anchors as an OPEN subpath.
   * Returns `null` if fewer than 2 anchors (not enough geometry).
   * Does **not** reset state — caller is expected to dispatch the
   * `InsertNodeCommand` and then call {@link reset} on success.
   */
  buildOpenPath(): PathNode | null {
    const anchors = this._anchors();
    if (anchors.length < 2) return null;
    return this.buildPathFromAnchors(anchors, false);
  }

  /**
   * Build a `PathNode` from the placed anchors as a CLOSED subpath
   * (last → first wrapped with `Z`). Returns `null` if fewer than 2
   * anchors (≥ 3 is the geometric minimum but a closed 2-anchor "lens"
   * is meaningful with curved handles, so the threshold is 2).
   */
  buildClosedPath(): PathNode | null {
    const anchors = this._anchors();
    if (anchors.length < 2) return null;
    return this.buildPathFromAnchors(anchors, true);
  }

  /**
   * Shared serialiser used by both `buildOpenPath` / `buildClosedPath`.
   * Wraps the in-progress anchors in an `AnchorSubpath`, serialises via
   * `anchorsToPathD`, and constructs the `PathNode` with a sensible
   * default style (1px black stroke, no fill — matches Pencil tool
   * default) so the user sees a visible line immediately.
   */
  private buildPathFromAnchors(anchors: readonly AnchorPoint[], closed: boolean): PathNode {
    const subpath: AnchorSubpath = { anchors, closed };
    const d = anchorsToPathD([subpath]);
    // TOOL-OPT-B: pull style from prefs. Closed paths default fill to
    // black for visibility (same as the prior hardcoded behavior);
    // open paths use the configured fill (default 'none').
    return createPath(d, {
      style: {
        fill: closed && this._fill() === 'none' ? '#000000' : this._fill(),
        stroke: this._stroke(),
        strokeWidth: this._strokeWidth(),
      },
    });
  }

  // ── TOOL-OPT-B preference signals ────────────────────────────────
  // Style + behavior toggles consumed by buildPathFromAnchors and the
  // PenOverlay (rubberBand). Defaults match the prior hardcoded
  // `fill:none + stroke:#000000 + strokeWidth:1` look.

  private readonly _fill = signal<string>('none');
  private readonly _stroke = signal<string>('#000000');
  private readonly _strokeWidth = signal<number>(1);
  private readonly _rubberBand = signal<boolean>(true);

  readonly fill = this._fill.asReadonly();
  readonly stroke = this._stroke.asReadonly();
  readonly strokeWidth = this._strokeWidth.asReadonly();
  readonly rubberBand = this._rubberBand.asReadonly();

  setFill(v: string): void {
    this._fill.set(v);
  }
  setStroke(v: string): void {
    this._stroke.set(v);
  }
  setStrokeWidth(px: number): void {
    this._strokeWidth.set(Math.max(0.5, Math.min(100, px)));
  }
  setRubberBand(on: boolean): void {
    this._rubberBand.set(on);
  }
}
