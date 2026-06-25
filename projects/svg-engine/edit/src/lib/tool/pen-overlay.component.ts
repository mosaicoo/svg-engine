import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { AnchorPoint, Point } from '@mosaicoo/svg-engine/core';
import { ViewportService } from '@mosaicoo/svg-engine/render';
import { PenToolService } from './pen-tool.service';

/** Pixel size of the anchor squares (CSS pixels — divided by zoom). */
const ANCHOR_PX = 8;
/** Pixel size of the handle knob circles. */
const HANDLE_PX = 6;

/**
 * Visual feedback overlay for the {@link PenTool} — renders the
 * path-under-construction so the user can see where each click /
 * drag landed and where the next segment will go.
 *
 * **What it draws** (in z-order, back to front):
 *
 * 1. **Committed segments** — straight lines or cubic Beziers connecting
 *    each consecutive pair of placed anchors. Matches what the final
 *    path will look like.
 * 2. **Rubber band** — dashed line/curve from the LAST committed anchor
 *    to the current cursor position (no button pressed). Curve when
 *    the user is dragging a handle out; straight line otherwise. Gives
 *    "what would I get if I clicked here?" feedback.
 * 3. **In-progress handle preview** — during a press-drag-release
 *    gesture, draw the symmetric handle pair being placed (handleOut
 *    at cursor, handleIn mirrored) so the user can see the curve they
 *    are creating before releasing.
 * 4. **Anchor squares** — small white squares at each committed anchor
 *    position. First anchor gets a special "snap target" highlight when
 *    the cursor is near it (signals "click here to close path").
 * 5. **Handle circles** — small blue dots at handleIn/handleOut of
 *    smooth anchors (cusps have no visible handles since they're at
 *    the anchor point).
 *
 * **Render gating**: only renders when `PenToolService.hasActivePath()`
 * is true (at least one anchor placed) OR when there's an in-progress
 * drag. Hidden otherwise — no overlay clutter when the tool is active
 * but no path has been started.
 *
 * **Pixel-constant sizing**: like SelectionOverlay/AnchorOverlay,
 * anchor + handle dimensions are divided by `viewport.zoom()` so they
 * stay constant on screen across zoom levels. Stroke widths use
 * `vector-effect="non-scaling-stroke"`.
 *
 * Usage (inside an `<svge-renderer>`):
 * ```html
 * <svg:g svgePenOverlay></svg:g>
 * ```
 *
 * Pointer events are disabled on every visible element — the overlay
 * is purely visual feedback; the actual pointer handling lives in
 * {@link PenTool} routed through the canvas.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgePenOverlay]',
  standalone: true,
  // Decorative-only feedback during path creation. The semantic
  // outcome (a new path inserted) is announced via the document
  // change in EditorStateService; the overlay itself adds no SR
  // value during the drag.
  host: { 'aria-hidden': 'true' },
  template: `
    @if (visible()) {
      <!-- Committed segments between consecutive placed anchors. -->
      @for (seg of committedSegments(); track seg.key) {
        <svg:path class="pen-segment" [attr.d]="seg.d"></svg:path>
      }

      <!-- Rubber band from last anchor to cursor (only when no drag in progress). -->
      @if (rubberBand(); as rb) {
        <svg:path class="pen-rubber" [attr.d]="rb"></svg:path>
      }

      <!-- In-progress curve segment being formed during a drag — gives
           real-time feedback of the Bezier the user is creating before
           release, instead of just showing the handle stems. -->
      @if (dragCurvePreview(); as cd) {
        <svg:path class="pen-segment" [attr.d]="cd"></svg:path>
      }

      <!-- In-progress symmetric handle preview during a drag. -->
      @if (dragHandlePreview(); as h) {
        <svg:line
          class="pen-handle-stem"
          [attr.x1]="h.start.x"
          [attr.y1]="h.start.y"
          [attr.x2]="h.handleOut.x"
          [attr.y2]="h.handleOut.y"
        ></svg:line>
        <svg:line
          class="pen-handle-stem"
          [attr.x1]="h.start.x"
          [attr.y1]="h.start.y"
          [attr.x2]="h.handleIn.x"
          [attr.y2]="h.handleIn.y"
        ></svg:line>
        <svg:circle
          class="pen-handle-knob"
          [attr.cx]="h.handleOut.x"
          [attr.cy]="h.handleOut.y"
          [attr.r]="handleHalf()"
        ></svg:circle>
        <svg:circle
          class="pen-handle-knob"
          [attr.cx]="h.handleIn.x"
          [attr.cy]="h.handleIn.y"
          [attr.r]="handleHalf()"
        ></svg:circle>
      }

      <!-- Anchor squares (committed). First anchor gets snap-target style. -->
      @for (a of anchorViews(); track a.key) {
        <svg:rect
          class="pen-anchor"
          [class.snap-target]="a.isSnapTarget"
          [attr.x]="a.point.x - anchorHalf()"
          [attr.y]="a.point.y - anchorHalf()"
          [attr.width]="anchorSize()"
          [attr.height]="anchorSize()"
        ></svg:rect>
      }

      <!-- Handle circles + stems for smooth/symmetric committed anchors. -->
      @for (h of handleViews(); track h.key) {
        <svg:line
          class="pen-handle-stem"
          [attr.x1]="h.from.x"
          [attr.y1]="h.from.y"
          [attr.x2]="h.to.x"
          [attr.y2]="h.to.y"
        ></svg:line>
        <svg:circle
          class="pen-handle-knob"
          [attr.cx]="h.to.x"
          [attr.cy]="h.to.y"
          [attr.r]="handleHalf()"
        ></svg:circle>
      }
    }
  `,
  styles: `
    .pen-segment {
      fill: none;
      stroke: #1976d2;
      stroke-width: 1.5;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    .pen-rubber {
      fill: none;
      stroke: #1976d2;
      stroke-width: 1;
      stroke-dasharray: 4 3;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
      opacity: 0.7;
    }
    .pen-anchor {
      fill: #ffffff;
      stroke: #1976d2;
      stroke-width: 1.5;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    /* Snap-to-close target — orange highlight on the first anchor when
       the cursor is in close-range. Mirrors the snap-guides colour
       convention so users learn "magenta/orange = snap is active". */
    .pen-anchor.snap-target {
      fill: #ff6f00;
      stroke: #ff6f00;
    }
    .pen-handle-knob {
      fill: #1976d2;
      stroke: #ffffff;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    .pen-handle-stem {
      stroke: #90caf9;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PenOverlay {
  private readonly pen = inject(PenToolService);
  private readonly viewport = inject(ViewportService);

  /** Pixel-constant sizing (matches AnchorOverlay convention). */
  protected readonly anchorSize = computed(() => ANCHOR_PX / this.viewport.zoom());
  protected readonly anchorHalf = computed(() => this.anchorSize() / 2);
  protected readonly handleHalf = computed(() => HANDLE_PX / this.viewport.zoom() / 2);

  /** Show the overlay only when there's something to render. */
  protected readonly visible = computed(
    () => this.pen.hasActivePath() || this.pen.dragState() !== null,
  );

  /**
   * Per-segment `d` strings between consecutive committed anchors.
   * One entry per (anchor[i], anchor[i+1]) pair. Uses a cubic Bezier
   * via the handles when either side has a non-flat handle; falls
   * back to a straight line otherwise (matches `anchorsToPathD`).
   */
  protected readonly committedSegments = computed<readonly { key: string; d: string }[]>(() => {
    const anchors = this.pen.anchors();
    if (anchors.length < 2) return [];
    const out: { key: string; d: string }[] = [];
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i]!;
      const b = anchors[i + 1]!;
      out.push({ key: `seg-${i}`, d: segmentD(a, b) });
    }
    return out;
  });

  /**
   * Rubber-band path from the last committed anchor to the cursor.
   * Returns `null` when:
   *
   * - No anchor has been placed yet (nothing to draw from).
   * - A drag is in progress (the in-progress handle preview takes
   *   priority — rubber band would clutter on top of it).
   * - The cursor isn't over the canvas (`previewPoint === null`).
   *
   * The path honours the LAST anchor's `handleOut` for a curved
   * preview if applicable — so the rubber band shows roughly what
   * the next segment will look like.
   */
  protected readonly rubberBand = computed<string | null>(() => {
    if (this.pen.dragState() !== null) return null;
    const anchors = this.pen.anchors();
    const cursor = this.pen.previewPoint();
    if (anchors.length === 0 || cursor === null) return null;
    const last = anchors[anchors.length - 1]!;
    // The next anchor doesn't exist yet, so we treat the cursor as a
    // bare cusp (no incoming handle). A more elaborate preview would
    // mirror the last anchor's outgoing handle as a hint of the
    // smooth-by-default curve — left as future polish since "straight
    // line preview" already conveys position clearly.
    const cursorAnchor: AnchorPoint = {
      point: cursor,
      handleIn: cursor,
      handleOut: cursor,
      kind: 'cusp',
    };
    return segmentD(last, cursorAnchor);
  });

  /**
   * Compute the symmetric handle pair being drawn during an in-progress
   * drag. Returns `null` when no drag is active. The `start` field is
   * the anchor point (where the user pressed); `handleOut` is the
   * cursor; `handleIn` is the mirror through `start`.
   */
  protected readonly dragHandlePreview = computed<{
    start: Point;
    handleIn: Point;
    handleOut: Point;
  } | null>(() => {
    const ds = this.pen.dragState();
    if (ds === null) return null;
    const { start, current } = ds;
    // No preview while the cursor hasn't moved yet (looks like an
    // anchor with zero-length handles — visual noise).
    if (start.x === current.x && start.y === current.y) return null;
    const handleOut = current;
    const handleIn: Point = { x: 2 * start.x - current.x, y: 2 * start.y - current.y };
    return { start, handleIn, handleOut };
  });

  /**
   * SVG `d` string for the in-progress curve segment being created
   * during a press-drag-release. Returns `null` when:
   *
   * - No drag is active (`dragHandlePreview()` is also `null`).
   * - The cursor hasn't moved off the press point (no curvature yet).
   * - No previous anchor exists (the very first anchor of the path has
   *   nothing to attach a segment to — only the symmetric handles show).
   *
   * Lets the user see the actual Bezier materialise dynamically as
   * they drag, instead of having to release first to know what curve
   * the handles will produce. Mirrors the symmetric-handle convention
   * from {@link PenToolService.commitDrag} (handleIn = mirror of
   * handleOut around `start`) so the preview is bit-for-bit what the
   * final committed segment will be.
   *
   * Uses {@link segmentD} so the preview is rendered with the exact
   * same `d` builder as the committed segments and the eventual
   * serialised path.
   */
  protected readonly dragCurvePreview = computed<string | null>(() => {
    const preview = this.dragHandlePreview();
    if (preview === null) return null;
    const anchors = this.pen.anchors();
    if (anchors.length === 0) return null;
    const prev = anchors[anchors.length - 1]!;
    // The pending anchor sits at `start` with the mirrored handleIn we
    // already computed in `dragHandlePreview`. `handleOut` doesn't
    // affect the segment going INTO this anchor — it'd only matter for
    // a hypothetical next segment which doesn't exist yet.
    const pending: AnchorPoint = {
      point: preview.start,
      handleIn: preview.handleIn,
      handleOut: preview.handleOut,
      kind: 'symmetric',
    };
    return segmentD(prev, pending);
  });

  /**
   * Anchor squares with snap-target highlighting on the first anchor
   * when the cursor is in close-range (drives the "snap to close"
   * visual hint).
   */
  protected readonly anchorViews = computed<
    readonly { key: string; point: Point; isSnapTarget: boolean }[]
  >(() => {
    const anchors = this.pen.anchors();
    const snapping = this.pen.snappingToFirst();
    return anchors.map((a, i) => ({
      key: `anchor-${i}`,
      point: a.point,
      isSnapTarget: i === 0 && snapping,
    }));
  });

  /**
   * Handle stems + knobs for smooth / symmetric anchors. Each anchor
   * with a non-flat handle contributes up to 2 entries (in + out).
   * Cusps contribute none.
   */
  protected readonly handleViews = computed<readonly { key: string; from: Point; to: Point }[]>(
    () => {
      const out: { key: string; from: Point; to: Point }[] = [];
      const anchors = this.pen.anchors();
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i]!;
        if (!pointsEqual(a.handleIn, a.point)) {
          out.push({ key: `h-in-${i}`, from: a.point, to: a.handleIn });
        }
        if (!pointsEqual(a.handleOut, a.point)) {
          out.push({ key: `h-out-${i}`, from: a.point, to: a.handleOut });
        }
      }
      return out;
    },
  );
}

/**
 * Build the `d` string for the segment from `a` → `b`. Uses a cubic
 * Bezier when either side has a non-flat handle; falls back to a
 * straight line when both sides are flat. Mirrors the convention in
 * `anchorsToPathD` so the overlay preview matches what the final
 * serialised path will render.
 */
function segmentD(a: AnchorPoint, b: AnchorPoint): string {
  const flatOut = pointsEqual(a.handleOut, a.point);
  const flatIn = pointsEqual(b.handleIn, b.point);
  if (flatOut && flatIn) {
    return `M${fmt(a.point.x)} ${fmt(a.point.y)} L${fmt(b.point.x)} ${fmt(b.point.y)}`;
  }
  return (
    `M${fmt(a.point.x)} ${fmt(a.point.y)} ` +
    `C${fmt(a.handleOut.x)} ${fmt(a.handleOut.y)} ` +
    `${fmt(b.handleIn.x)} ${fmt(b.handleIn.y)} ` +
    `${fmt(b.point.x)} ${fmt(b.point.y)}`
  );
}

function pointsEqual(a: Point, b: Point, eps = 1e-6): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? `${n}` : Number(n.toFixed(4)).toString();
}
