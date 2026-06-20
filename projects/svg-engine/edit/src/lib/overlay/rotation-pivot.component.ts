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
import {
  applyTransform,
  type BoundingBox,
  EditorStateService,
  findNodeById,
  IDENTITY_TRANSFORM,
  type NodeId,
  type Point,
  type Transform,
} from 'svg-engine/core';
import { screenToDoc, ViewportService } from 'svg-engine/render';
import { capturePointer, releasePointer } from '../pointer';
import { allAnchors, BBOX_ANCHORS, type BBoxAnchor } from '../geometry/bbox-anchors';
import { getCombinedBBox, getRenderedNodeOBB, type RenderedOBB } from '../geometry/node-bbox';
import { LayersService } from '../layers/layers.service';
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

/**
 * **D-142** — the geometric frame the pivot lives in for the current
 * selection:
 *
 * - **Single node** (`single: true`): `localBBox` is the node's own
 *   pre-transform geometry bbox and `matrix` maps that local frame →
 *   document space (own transform × ancestors, from `getRenderedNodeOBB`).
 *   The pivot fraction is interpreted in this frame, so it stays glued to
 *   the object and rotates/scales WITH it.
 * - **Multi-selection** (`single: false`): `localBBox` is the combined
 *   AABB and `matrix` is the identity — the multi pivot has no single
 *   orientation, so it behaves exactly like the legacy axis-aligned path.
 */
interface PivotFrame {
  readonly localBBox: BoundingBox;
  readonly matrix: Transform;
  readonly single: boolean;
}

interface DragState {
  readonly pointerId: number;
  readonly startScreenX: number;
  readonly startScreenY: number;
  /** Frame snapshot at drag start (stable: moving the pivot doesn't transform the node). */
  readonly frame: PivotFrame;
  /** Focused node id (single selection) — the store target. `null` for multi. */
  readonly nodeId: NodeId | null;
  /** Doc-space pivot before the drag started, for Esc-cancel. */
  readonly pivotBeforeDoc: Point;
  /** Whether a custom pivot existed before the drag (so cancel restores vs clears). */
  readonly hadCustomBefore: boolean;
  moved: boolean;
}

/**
 * Editable rotation pivot crosshair (D-022 Affinity-grade; **D-142**
 * OBB-aware).
 *
 * Renders a small crosshair at the current pivot of the focused selection —
 * the point **around which rotation (and the Inspector's scale anchor) is
 * applied**. Behaviour:
 *
 * - **Free-drag**: pointer-down on the crosshair starts a drag; the pivot
 *   follows the pointer. While dragging, the pivot **snaps** to the
 *   nearest of the 9 box anchors when within ~5 CSS pixels. Holding
 *   **Alt** during drag bypasses snap for fine positioning.
 * - **Click (no drag)**: a release without movement opens a 3×3 picker
 *   popover (anchored on the box) — clicking one of the 9 dots snaps
 *   the pivot to that anchor and closes the popover.
 * - **Esc** during drag restores the pivot to its pre-drag position;
 *   while a popover is open, Esc closes the popover.
 * - **Double-click** on the crosshair resets the pivot to the center
 *   (removing the per-node entry from `TransformService`).
 *
 * **D-142 — OBB-aware**: for a single node the box + its 9 anchors are
 * the node's **oriented** box (local geometry bbox projected through the
 * node's matrix), so the crosshair, the snap targets, and the picker dots
 * stay glued to the (possibly rotated/scaled) object — the pivot you set
 * remains exactly where you put it after the object rotates. Multi-selection
 * keeps the axis-aligned combined box. Pivot persistence (per-node, as a
 * fraction of the node's LOCAL box) is delegated to {@link TransformService}.
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
        <!-- Crosshair arms (axis-aligned: a target symbol, not the box).
             Its POSITION is what tracks the oriented object (D-142). -->
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
        <!-- Central handle (pointer target). Keyboard: Enter/Space
             opens the picker popover; double-click resets to center. -->
        <svg:circle
          class="dot"
          [class.custom]="hasCustomPivot()"
          [attr.cx]="p.x"
          [attr.cy]="p.y"
          [attr.r]="dotRadius()"
          role="button"
          tabindex="0"
          focusable="true"
          aria-label="Rotation pivot. Enter to open anchor picker, drag to move, double-click to reset."
          aria-haspopup="menu"
          [attr.aria-expanded]="popoverOpen() ? 'true' : 'false'"
          aria-keyshortcuts="Enter Space Escape"
          (pointerdown)="onPointerDown($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (dblclick)="onDoubleClick($event)"
          (keydown)="onMainKeyDown($event)"
        ></svg:circle>
      </svg:g>

      @if (popoverOpen() && frame(); as f) {
        <svg:g class="popover" role="menu" aria-label="Pivot anchor picker">
          @for (a of popoverAnchors(f); track a.anchor) {
            <svg:circle
              class="popover-dot"
              [class.active]="isCurrentAnchor(a.anchor)"
              [attr.cx]="a.x"
              [attr.cy]="a.y"
              [attr.r]="popoverDotRadius()"
              [attr.data-svge-anchor]="a.anchor"
              role="menuitemradio"
              tabindex="0"
              focusable="true"
              [attr.aria-checked]="isCurrentAnchor(a.anchor) ? 'true' : 'false'"
              [attr.aria-label]="'Snap pivot to ' + a.anchor"
              (keydown)="onPopoverDotKeyDown($event, a.anchor)"
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
      /* Same convention as the resize handles: native outline off,
         keyboard-only :focus-visible orange ring. */
      outline: none;
    }
    .dot:active {
      cursor: grabbing;
    }
    .dot.custom {
      fill: #d32f2f;
    }
    .dot:focus-visible {
      stroke: #ff6f00;
      stroke-width: 2.5;
      filter: drop-shadow(0 0 2px rgba(255, 111, 0, 0.6));
    }
    .popover-dot {
      fill: #ffffff;
      stroke: #1976d2;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      cursor: pointer;
      outline: none;
    }
    .popover-dot.active {
      fill: #1976d2;
    }
    .popover-dot:focus-visible {
      stroke: #ff6f00;
      stroke-width: 2;
      filter: drop-shadow(0 0 2px rgba(255, 111, 0, 0.6));
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
  private readonly layers = inject(LayersService);

  /** **D-142** — oriented box for a single node (local bbox + matrix). */
  private readonly _obb = signal<RenderedOBB | null>(null);
  /** Combined AABB for a multi-selection (no orientation). */
  private readonly _bbox = signal<BoundingBox | null>(null);
  private readonly _popoverOpen = signal(false);
  private readonly _drag = signal<DragState | null>(null);

  protected readonly popoverOpen = this._popoverOpen.asReadonly();

  /**
   * **D-142** — the active pivot frame, or `null` when the chrome should
   * render NOTHING. `null` covers "no selection" and "selection hidden"
   * (Layer Panel eye-toggle OR `metadata.visible === false`) — chrome on an
   * invisible target floats in empty space and confuses the user; the
   * selection state survives, un-hide restores it. Single selection → the
   * node's oriented box; multi → the combined AABB with identity matrix.
   */
  protected readonly frame = computed<PivotFrame | null>(() => {
    const id = this.selection.focusId();
    if (id !== null) {
      if (this.layers.hiddenIds().has(id)) return null;
      const node = findNodeById(this.state.document().root, id);
      if (node !== null && node.metadata.visible === false) return null;
    }
    if (this.selection.isSingleSelection() && id !== null) {
      const o = this._obb();
      if (o === null) return null;
      return { localBBox: o.localBBox, matrix: o.matrix, single: true };
    }
    const b = this._bbox();
    if (b === null) return null;
    return { localBBox: b, matrix: IDENTITY_TRANSFORM, single: false };
  });

  /** Pivot position in DOCUMENT coords (glued to the oriented object for single). */
  protected readonly pivotPos = computed<Point | null>(() => {
    const f = this.frame();
    if (f === null) return null;
    if (f.single) {
      const id = this.selection.focusId();
      if (id === null) return null;
      return this.transform.resolvePivotForNode(id, f.localBBox, f.matrix);
    }
    return this.transform.resolvePivot(f.localBBox);
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
   * Window-level capture-phase delegation for popover-dot pointerdowns.
   *
   * Why **window** + **capture**: the popover dots live inside the same
   * `<svg>` as the canvas. The playground's canvas binds `(pointerdown)`
   * via Angular templating, which uses **bubble** phase. By listening on
   * `window` in **capture** phase we run *first* — before the canvas
   * handler ever sees the event. We then `stopImmediatePropagation()`
   * so the canvas never runs `selection.clear()` (which would kill the
   * frame and unmount the entire pivot+popover overlay, masking the
   * pivot move with a "everything disappeared" symptom).
   *
   * Why imperative (not Angular `(pointerdown)` on the circle): prior
   * attempts with template bindings on `<svg:circle>` inside nested
   * `@for`/`@if` blocks did not attach working DOM listeners in this
   * setup (handler never fired). Imperative `addEventListener` on a
   * stable host (window) is the most defensible approach.
   *
   * The handler ignores any pointerdown whose target is **not** one of
   * our popover dots living inside this directive's host `<g>`, so
   * other interactions (resize handles, body-drag, other components)
   * are unaffected.
   */
  private readonly onWindowPointerDownCapture = (event: Event): void => {
    if (!(event instanceof PointerEvent)) return;
    const target = event.target as Element | null;
    if (target === null) return;
    // 1) Must be a popover-dot
    if (!target.classList.contains('popover-dot')) return;
    // 2) Must belong to *this* RotationPivot instance (not another one
    //    in a different renderer on the same page).
    const host = this.elRef.nativeElement;
    if (!host.contains(target)) return;
    // 3) Anchor must be valid and we must have a frame + focused node.
    const anchorAttr = target.getAttribute('data-svge-anchor');
    const f = this.frame();
    const focus = this.selection.focusId();
    if (
      anchorAttr === null ||
      !BBOX_ANCHORS.includes(anchorAttr as BBoxAnchor) ||
      f === null ||
      focus === null
    ) {
      // Even if we can't process it, we still need to suppress canvas
      // selection-clear — the user's intent was clearly a pivot pick.
      event.stopImmediatePropagation();
      event.preventDefault();
      this._popoverOpen.set(false);
      return;
    }
    event.stopImmediatePropagation();
    event.preventDefault();
    // Anchor fractions are frame-independent (tl=0,0 … br=1,1), so passing
    // the local box stores exactly the same canonical fraction; it then
    // resolves through the node's matrix and lands on the oriented anchor.
    this.transform.setPivotAnchorForNode(focus, anchorAttr as BBoxAnchor, f.localBBox);
    this._popoverOpen.set(false);
  };

  constructor() {
    afterEveryRender({ read: () => this.recomputeBBox() });
    document.addEventListener('keydown', this.onKeyDown);
    // capture: true → fires BEFORE any bubble-phase listener on ancestors
    // (like the playground's <section class="canvas"> pointerdown).
    window.addEventListener('pointerdown', this.onWindowPointerDownCapture, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pointerdown', this.onWindowPointerDownCapture, true);
  }

  protected onPointerDown(event: PointerEvent): void {
    const f = this.frame();
    const pivot = this.pivotPos();
    if (f === null || pivot === null) return;

    const nodeId = f.single ? this.selection.focusId() : null;
    const hadCustomBefore = nodeId !== null && this.transform.customPivots().has(nodeId);
    this._drag.set({
      pointerId: event.pointerId,
      startScreenX: event.clientX,
      startScreenY: event.clientY,
      frame: f,
      nodeId,
      pivotBeforeDoc: pivot,
      hadCustomBefore,
      moved: false,
    });

    capturePointer(event);
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

    const f = drag.frame;
    const altBypass = event.altKey;
    const snapRadiusDoc = SNAP_RADIUS_PX / this.viewport.zoom();
    const snapped = altBypass ? null : this.nearestOrientedAnchor(f, docPoint, snapRadiusDoc);

    if (snapped !== null) {
      if (drag.nodeId !== null) {
        this.transform.setPivotAnchorForNode(drag.nodeId, snapped, f.localBBox);
      } else {
        this.transform.setPivotAnchor(snapped, f.localBBox);
      }
    } else if (drag.nodeId !== null) {
      // Single node → project through the matrix so the fraction is stored
      // in the OBJECT's frame and follows it through later rotations.
      this.transform.setPivotDocForNode(drag.nodeId, docPoint, f.localBBox, f.matrix);
    } else {
      // Multi (identity matrix) → fraction of the combined AABB.
      this.transform.setPivot(docPoint, f.localBBox);
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
    releasePointer(event);
  }

  protected onDoubleClick(event: MouseEvent): void {
    this.transform.resetPivot();
    this._popoverOpen.set(false);
    event.stopPropagation();
  }

  // ── Keyboard accessibility (Fase 6c a11y audit) ──────────────────

  /**
   * Keyboard counterpart of the click-to-open / dblclick-to-reset
   * gestures on the central pivot dot.
   *
   * - **Enter / Space**: toggle the anchor-picker popover (same as a
   *   click without drag). When opening, focus is left on the main dot —
   *   user presses Tab to enter the popover (browser-native focus order).
   * - **Escape**: handled by the existing window-level keydown handler
   *   (`onKeyDown` at the class level) — kept centralised so the same
   *   logic cancels drag OR closes popover.
   */
  protected onMainKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      this._popoverOpen.update((v) => !v);
    }
  }

  /**
   * Keyboard activator for the popover anchor dots. The pointer path
   * uses window-level capture-phase delegation (`onWindowPointerDownCapture`)
   * for historical reasons (see class-level comment about prior Angular
   * binding race condition). For keyboard, we route through the same
   * anchor-set logic but via per-element `(keydown)`:
   *
   * - **Enter / Space**: snap the pivot to this anchor + close popover
   *   (matches what a click on the dot does).
   *
   * Arrow keys are NOT implemented for navigation inside the popover —
   * native browser Tab order suffices (focus moves to the next dot in
   * DOM order).
   */
  protected onPopoverDotKeyDown(event: KeyboardEvent, anchor: BBoxAnchor): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    const f = this.frame();
    if (f === null) return;
    const focus = this.selection.focusId();
    if (f.single && focus !== null) {
      this.transform.setPivotAnchorForNode(focus, anchor, f.localBBox);
    } else {
      this.transform.setPivotAnchor(anchor, f.localBBox);
    }
    this._popoverOpen.set(false);
  }

  /**
   * The 9 box anchors in DOCUMENT coordinates for the current frame.
   * For a single node this projects the LOCAL anchors through the node's
   * matrix, so the dots sit on the corners/edges of the **oriented** box.
   */
  protected popoverAnchors(f: PivotFrame): readonly { anchor: BBoxAnchor; x: number; y: number }[] {
    return BBOX_ANCHORS.map((anchor) => {
      const p = this.anchorDoc(f, anchor);
      return { anchor, x: p.x, y: p.y };
    });
  }

  protected isCurrentAnchor(anchor: BBoxAnchor): boolean {
    const f = this.frame();
    const pivot = this.pivotPos();
    if (f === null || pivot === null) return false;
    const candidate = this.anchorDoc(f, anchor);
    const eps = 0.5 / this.viewport.zoom();
    return Math.abs(pivot.x - candidate.x) < eps && Math.abs(pivot.y - candidate.y) < eps;
  }

  /** A box anchor projected from the local frame into document coordinates. */
  private anchorDoc(f: PivotFrame, anchor: BBoxAnchor): Point {
    const local = allAnchors(f.localBBox)[anchor];
    return applyTransform(f.matrix, local.x, local.y);
  }

  /**
   * Nearest of the 9 oriented anchors to `docPoint`, within `radiusDoc`
   * (document units), or `null` if none is close enough. Replaces the
   * AABB-only `findNearestAnchor` so snapping lands on the rotated box.
   */
  private nearestOrientedAnchor(
    f: PivotFrame,
    docPoint: Point,
    radiusDoc: number,
  ): BBoxAnchor | null {
    let best: BBoxAnchor | null = null;
    let bestSq = radiusDoc * radiusDoc;
    for (const anchor of BBOX_ANCHORS) {
      const p = this.anchorDoc(f, anchor);
      const dx = docPoint.x - p.x;
      const dy = docPoint.y - p.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) {
        bestSq = d;
        best = anchor;
      }
    }
    return best;
  }

  private cancelDrag(): void {
    const drag = this._drag();
    if (drag === null) return;
    if (drag.nodeId !== null) {
      // Single node — restore the exact pre-drag pivot, or clear it if there
      // was no custom pivot before (so Esc truly returns to "default centre").
      if (drag.hadCustomBefore) {
        this.transform.setPivotDocForNode(
          drag.nodeId,
          drag.pivotBeforeDoc,
          drag.frame.localBBox,
          drag.frame.matrix,
        );
      } else {
        this.transform.clearPivotForNode(drag.nodeId);
      }
    } else {
      // Multi — restore the previous combined-bbox pivot (transient).
      this.transform.setPivot(drag.pivotBeforeDoc, drag.frame.localBBox);
    }
    this._drag.set(null);
  }

  private recomputeBBox(): void {
    this.transform.syncPivotForSelection();
    const svg = this.elRef.nativeElement.ownerSVGElement;
    if (svg === null) {
      this.maybeSetObb(null);
      this.maybeSet(this._bbox, null);
      return;
    }
    // Establish signal deps
    const ids = this.selection.selectedIds();
    const focus = this.selection.focusId();
    this.state.document();

    let obb: RenderedOBB | null = null;
    let combined: BoundingBox | null = null;
    if (this.selection.isSingleSelection() && focus !== null) {
      obb = getRenderedNodeOBB(svg, focus);
    } else if (ids.size > 1) {
      combined = getCombinedBBox(svg, ids);
    }
    this.maybeSetObb(obb);
    this.maybeSet(this._bbox, combined);
  }

  /**
   * Convert client (screen) coords to doc coords via the shared util
   * (D-036). Resolves the overlay's owning `<svg>`; returns null when
   * the SVG isn't reachable (jsdom / SSR / detached).
   */
  private screenToDoc(clientX: number, clientY: number): Point | null {
    return screenToDoc(this.elRef.nativeElement.ownerSVGElement, clientX, clientY);
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

  /**
   * Change-guard for the oriented box — compares both the local bbox and
   * the matrix element-wise so the `afterEveryRender` re-measure doesn't
   * spin (set a fresh-but-equal object every frame → re-render loop).
   */
  private maybeSetObb(next: RenderedOBB | null): void {
    const cur = this._obb();
    if (cur === next) return;
    if (cur !== null && next !== null && obbsEqual(cur, next)) return;
    this._obb.set(next);
  }
}

function obbsEqual(a: RenderedOBB, b: RenderedOBB): boolean {
  return (
    a.localBBox.x === b.localBBox.x &&
    a.localBBox.y === b.localBBox.y &&
    a.localBBox.width === b.localBBox.width &&
    a.localBBox.height === b.localBBox.height &&
    a.matrix[0] === b.matrix[0] &&
    a.matrix[1] === b.matrix[1] &&
    a.matrix[2] === b.matrix[2] &&
    a.matrix[3] === b.matrix[3] &&
    a.matrix[4] === b.matrix[4] &&
    a.matrix[5] === b.matrix[5]
  );
}
