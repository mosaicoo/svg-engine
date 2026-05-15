import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  type OnDestroy,
  signal,
} from '@angular/core';
import { type BoundingBox, EditorStateService, type Point } from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';
import {
  allAnchors,
  BBOX_ANCHORS,
  findNearestAnchor,
  type BBoxAnchor,
} from '../geometry/bbox-anchors';
import { getCombinedBBox, getRenderedNodeBBox } from '../geometry/node-bbox';
import { SelectionService } from '../selection/selection.service';
import { TransformService } from '../transform/transform.service';

/** Pixel size of the central pivot dot. */
const DOT_PX = 6;
/** Pixel half-length of each crosshair arm. */
const ARM_PX = 12;
/** Pixel radius for snap-to-anchor detection (D-022.snap). */
const SNAP_RADIUS_PX = 5;
/** Pixel size of each anchor dot in the 3×3 picker popover. */
const POPOVER_DOT_PX = 10;
/** Drag threshold in CSS pixels — below this, a release is treated as a click (open popover). */
const CLICK_VS_DRAG_THRESHOLD_PX = 3;

interface DragState {
  readonly pointerId: number;
  readonly startScreenX: number;
  readonly startScreenY: number;
  readonly bboxAtStart: BoundingBox;
  /** Pivot snapshot (in node-local coords) before the drag started, for Esc-cancel. */
  readonly pivotBefore: Point;
  moved: boolean;
}

/**
 * Editable rotation pivot crosshair (D-022 Affinity-grade).
 *
 * Renders a small crosshair at the current pivot of the focused selection.
 * Behaviour:
 *
 * - **Free-drag**: pointer-down on the crosshair starts a drag; the pivot
 *   follows the pointer. While dragging, the pivot **snaps** to the
 *   nearest of the 9 bbox anchors when within ~5 CSS pixels. Holding
 *   **Alt** during drag bypasses snap for fine positioning.
 * - **Click (no drag)**: a release without movement opens a 3×3 picker
 *   popover (anchored on the bbox) — clicking one of the 9 dots snaps
 *   the pivot to that anchor and closes the popover.
 * - **Esc** during drag restores the pivot to its pre-drag position;
 *   while a popover is open, Esc closes the popover.
 * - **Double-click** on the crosshair resets the pivot to the center
 *   (removing the per-node entry from `TransformService`).
 *
 * The component is a no-op when nothing is selected. Pivot persistence
 * (per-node, in node-local coords) is delegated to {@link TransformService}.
 *
 * Usage (inside a `<svge-renderer>`):
 * ```html
 * <svge-renderer [tree]="tree" [viewBox]="viewBox">
 *   <svg:g svgeRotationPivot></svg:g>
 * </svge-renderer>
 * ```
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeRotationPivot]',
  standalone: true,
  template: `
    @if (pivotPos(); as p) {
      <svg:g class="pivot-group">
        <!-- Crosshair arms -->
        <svg:line
          class="arm"
          [attr.x1]="p.x - armLen()"
          [attr.y1]="p.y"
          [attr.x2]="p.x + armLen()"
          [attr.y2]="p.y"
        ></svg:line>
        <svg:line
          class="arm"
          [attr.x1]="p.x"
          [attr.y1]="p.y - armLen()"
          [attr.x2]="p.x"
          [attr.y2]="p.y + armLen()"
        ></svg:line>
        <!-- Central handle (pointer target) -->
        <svg:circle
          class="dot"
          [class.custom]="hasCustomPivot()"
          [attr.cx]="p.x"
          [attr.cy]="p.y"
          [attr.r]="dotRadius()"
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (dblclick)="onDoubleClick($event)"
          aria-label="Rotation pivot"
        ></svg:circle>
      </svg:g>

      @if (popoverOpen() && currentBBox(); as b) {
        <svg:g class="popover" aria-label="Pivot anchor picker">
          @for (a of popoverAnchors(b); track a.anchor) {
            <svg:circle
              class="popover-dot"
              [class.active]="isCurrentAnchor(a.anchor, b)"
              [attr.cx]="a.x"
              [attr.cy]="a.y"
              [attr.r]="popoverDotRadius()"
              [attr.data-svge-anchor]="a.anchor"
              [attr.aria-label]="'Snap pivot to ' + a.anchor"
            ></svg:circle>
          }
        </svg:g>
      }
    }
  `,
  styles: `
    .arm {
      stroke: #d32f2f;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    .dot {
      fill: #ffffff;
      stroke: #d32f2f;
      stroke-width: 1.5;
      vector-effect: non-scaling-stroke;
      cursor: grab;
      touch-action: none;
    }
    .dot:active {
      cursor: grabbing;
    }
    .dot.custom {
      fill: #d32f2f;
    }
    .popover-dot {
      fill: #ffffff;
      stroke: #1976d2;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      cursor: pointer;
    }
    .popover-dot.active {
      fill: #1976d2;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RotationPivot implements OnDestroy {
  private readonly elRef = inject(ElementRef<SVGGElement>);
  private readonly selection = inject(SelectionService);
  private readonly state = inject(EditorStateService);
  private readonly viewport = inject(ViewportService);
  private readonly transform = inject(TransformService);

  private readonly _bbox = signal<BoundingBox | null>(null);
  private readonly _popoverOpen = signal(false);
  private readonly _drag = signal<DragState | null>(null);

  protected readonly currentBBox = this._bbox.asReadonly();
  protected readonly popoverOpen = this._popoverOpen.asReadonly();

  protected readonly pivotPos = computed<Point | null>(() => {
    const b = this._bbox();
    if (b === null) return null;
    return this.transform.resolvePivot(b);
  });

  protected readonly hasCustomPivot = computed(() => {
    const focus = this.selection.focusId();
    if (focus === null) return false;
    return this.transform.customPivots().has(focus);
  });

  protected readonly armLen = computed(() => ARM_PX / this.viewport.zoom());
  protected readonly dotRadius = computed(() => DOT_PX / 2 / this.viewport.zoom());
  protected readonly popoverDotRadius = computed(() => POPOVER_DOT_PX / 2 / this.viewport.zoom());

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (this._drag() !== null) {
        this.cancelDrag();
        event.preventDefault();
      } else if (this._popoverOpen()) {
        this._popoverOpen.set(false);
        event.preventDefault();
      }
    }
  };

  /**
   * Imperative pointer-down delegation on the host `<svg:g svgeRotationPivot>`.
   *
   * Why imperative (not Angular template binding): in this setup,
   * Angular `(pointerdown)` bindings on `<svg:circle>` elements inside
   * `@for` and on `<svg:g>` wrappers inside `@if` did **not** attach
   * working DOM listeners (confirmed via diagnostic logs — handlers
   * never fired even though the canvas listener saw the popover-dot
   * as `event.target`). Attaching the listener directly on the host
   * via `addEventListener` bypasses any template-binding quirk and
   * guarantees the handler runs.
   *
   * The handler delegates by inspecting `event.target.classList` /
   * `data-svge-anchor`:
   *   - `popover-dot`: read its anchor and commit the pivot.
   *   - anything else inside the host: ignore (let other handlers run).
   */
  private readonly onHostPointerDown = (event: PointerEvent): void => {
    const target = event.target as Element | null;
    if (target === null) return;
    if (!target.classList || !target.classList.contains('popover-dot')) return;
    const anchor = target.getAttribute('data-svge-anchor') as BBoxAnchor | null;
    const bbox = this._bbox();
    if (anchor === null || !BBOX_ANCHORS.includes(anchor) || bbox === null) return;
    event.stopPropagation();
    event.stopImmediatePropagation();
    event.preventDefault();
    const focus = this.selection.focusId();
    if (focus !== null) {
      this.transform.setPivotAnchorForNode(focus, anchor, bbox);
    }
    this._popoverOpen.set(false);
  };

  constructor() {
    afterEveryRender({ read: () => this.recomputeBBox() });
    document.addEventListener('keydown', this.onKeyDown);
    // Use `capture: true` so we run BEFORE bubble-phase listeners on
    // ancestors (like the playground's canvas pointerdown). This is the
    // most reliable way to ensure our delegation runs first.
    this.elRef.nativeElement.addEventListener('pointerdown', this.onHostPointerDown, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.elRef.nativeElement.removeEventListener('pointerdown', this.onHostPointerDown, true);
  }

  protected onPointerDown(event: PointerEvent): void {
    const b = this._bbox();
    const pivot = this.pivotPos();
    if (b === null || pivot === null) return;

    const pivotLocal = docToLocal(pivot, b);
    const drag: DragState = {
      pointerId: event.pointerId,
      startScreenX: event.clientX,
      startScreenY: event.clientY,
      bboxAtStart: b,
      pivotBefore: pivotLocal,
      moved: false,
    };
    this._drag.set(drag);

    const target = event.target as Element;
    if ('setPointerCapture' in target) {
      try {
        (target as Element & { setPointerCapture(id: number): void }).setPointerCapture(
          event.pointerId,
        );
      } catch {
        // ignore — some browsers/elements reject capture
      }
    }
    event.stopPropagation();
  }

  protected onPointerMove(event: PointerEvent): void {
    const drag = this._drag();
    if (drag === null || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startScreenX;
    const dy = event.clientY - drag.startScreenY;
    const distSq = dx * dx + dy * dy;
    if (!drag.moved && distSq < CLICK_VS_DRAG_THRESHOLD_PX * CLICK_VS_DRAG_THRESHOLD_PX) {
      // Below threshold — still considered a "click in progress"
      return;
    }
    drag.moved = true;

    const docPoint = this.screenToDoc(event.clientX, event.clientY);
    if (docPoint === null) return;

    const altBypass = event.altKey;
    const snapRadiusDoc = SNAP_RADIUS_PX / this.viewport.zoom();
    const snapped = altBypass ? null : findNearestAnchor(drag.bboxAtStart, docPoint, snapRadiusDoc);

    if (snapped !== null) {
      this.transform.setPivotAnchor(snapped, drag.bboxAtStart);
    } else {
      this.transform.setPivot(docPoint, drag.bboxAtStart);
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    const drag = this._drag();
    if (drag === null || drag.pointerId !== event.pointerId) return;

    if (!drag.moved) {
      // Release without drag — toggle popover
      this._popoverOpen.update((v) => !v);
    }

    this._drag.set(null);
    const target = event.target as Element & { releasePointerCapture?(id: number): void };
    if (typeof target.releasePointerCapture === 'function') {
      try {
        target.releasePointerCapture(event.pointerId);
      } catch {
        // ignore
      }
    }
  }

  protected onDoubleClick(event: MouseEvent): void {
    this.transform.resetPivot();
    this._popoverOpen.set(false);
    event.stopPropagation();
  }

  protected popoverAnchors(
    bbox: BoundingBox,
  ): readonly { anchor: BBoxAnchor; x: number; y: number }[] {
    const a = allAnchors(bbox);
    return BBOX_ANCHORS.map((anchor) => ({ anchor, x: a[anchor].x, y: a[anchor].y }));
  }

  protected isCurrentAnchor(anchor: BBoxAnchor, bbox: BoundingBox): boolean {
    const pivot = this.pivotPos();
    if (pivot === null) return false;
    const candidate = allAnchors(bbox)[anchor];
    const eps = 0.5 / this.viewport.zoom();
    return Math.abs(pivot.x - candidate.x) < eps && Math.abs(pivot.y - candidate.y) < eps;
  }

  private cancelDrag(): void {
    const drag = this._drag();
    if (drag === null) return;
    // Restore pivot from snapshot (in local coords of the bbox at drag start)
    const restored = localToDoc(drag.pivotBefore, drag.bboxAtStart);
    this.transform.setPivot(restored, drag.bboxAtStart);
    this._drag.set(null);
  }

  private recomputeBBox(): void {
    this.transform.syncPivotForSelection();
    const svg = this.elRef.nativeElement.ownerSVGElement;
    if (svg === null) {
      this.maybeSet(this._bbox, null);
      return;
    }
    // Establish signal deps
    const ids = this.selection.selectedIds();
    const focus = this.selection.focusId();
    this.state.document();

    let next: BoundingBox | null = null;
    if (this.selection.isSingleSelection() && focus !== null) {
      next = getRenderedNodeBBox(svg, focus);
    } else if (ids.size > 1) {
      next = getCombinedBBox(svg, ids);
    }
    this.maybeSet(this._bbox, next);
  }

  private screenToDoc(clientX: number, clientY: number): Point | null {
    const svg = this.elRef.nativeElement.ownerSVGElement;
    if (svg === null) return null;
    const ctm = svg.getScreenCTM();
    if (ctm === null) return null;
    const inverse = ctm.inverse();
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const userSpace = pt.matrixTransform(inverse);
    return { x: userSpace.x, y: userSpace.y };
  }

  private maybeSet(
    target: { set(v: BoundingBox | null): void; (): BoundingBox | null },
    next: BoundingBox | null,
  ): void {
    const cur = target();
    if (cur === next) return;
    if (
      cur !== null &&
      next !== null &&
      cur.x === next.x &&
      cur.y === next.y &&
      cur.width === next.width &&
      cur.height === next.height
    ) {
      return;
    }
    target.set(next);
  }
}

function docToLocal(p: Point, b: BoundingBox): Point {
  if (b.width === 0 || b.height === 0) return { x: 0.5, y: 0.5 };
  return { x: (p.x - b.x) / b.width, y: (p.y - b.y) / b.height };
}

function localToDoc(p: Point, b: BoundingBox): Point {
  return { x: b.x + p.x * b.width, y: b.y + p.y * b.height };
}
