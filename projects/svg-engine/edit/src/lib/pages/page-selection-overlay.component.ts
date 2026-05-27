import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  CommandBus,
  getPageName,
  getPageViewBox,
  MovePageCommand,
  type NodeId,
  ResizePageCommand,
} from 'svg-engine/core';
import { screenToDoc, ViewportService } from 'svg-engine/render';
import { capturePointer, releasePointer } from '../pointer';
import { SelectionService } from '../selection/selection.service';
import { ActivePageService } from './active-page.service';

/**
 * Bracket arm length in CSS pixels — the visible "L" extends this far
 * INWARD from each page corner. 12px reads as a crisp affordance at
 * default zoom without competing with the artboard content.
 */
const BRACKET_ARM_PX = 12;

/**
 * Distance (CSS px) from the page's top edge to the bottom of the
 * floating label. Keeps the label off the artboard so it doesn't
 * obscure content at the top of the page.
 */
const LABEL_OFFSET_PX = 6;

/**
 * Label font size in CSS pixels — matches the rulers / status bar
 * type scale so it reads as part of the editor chrome, not as
 * document content.
 */
const LABEL_FONT_SIZE_PX = 11;

/**
 * Move-handle square side in CSS pixels. Same scale as shape resize
 * handles (8 px) but visually distinct via fill colour — see styles.
 */
const HANDLE_SIZE_PX = 8;

/**
 * Distance (CSS px) from the page's top edge to the move handle's
 * BOTTOM. Sits right next to the label so the user reads them as a
 * unit ("this is the page metadata + drag affordance").
 */
const HANDLE_OFFSET_PX = 18;

/**
 * Minimum page dimension (doc units). Resize gestures clamp width/
 * height to this so the user can't drag a page down to zero (which
 * would make it un-selectable and visually invisible).
 */
const MIN_PAGE_DIM = 10;

/** Resize anchor identifier (4 corners + 4 edges). */
type ResizeAnchor = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'r' | 'b' | 'l';

/**
 * In-progress drag state. `null` when no drag is active. The overlay's
 * preview computeds read this so the brackets/handles + label render at
 * the new geometry while the user drags.
 */
interface DragState {
  readonly kind: 'move' | 'resize';
  readonly anchor: ResizeAnchor | null; // only set for 'resize'
  readonly pageId: NodeId;
  /** ViewBox at pointerdown — the immutable starting point of the drag. */
  readonly startViewBox: { x: number; y: number; width: number; height: number };
  /** Cursor position (doc coords) at pointerdown. */
  readonly startPoint: { x: number; y: number };
  /** Current cursor position (doc coords) — updated on every pointermove. */
  readonly currentPoint: { x: number; y: number };
}

/**
 * **PAGES-REFACTOR Fase 2 (visuals) + Fase 6 (interactivity)** —
 * visual selection overlay AND drag-gesture surface for the active
 * Page node.
 *
 * **Visual elements** (rendered when the active page is selected):
 *
 * - 4 corner brackets (draw.io / diagrams.net style "L" marks) —
 *   decorative, pointer-events: none.
 * - 1 floating page label above the top edge ("Name — W×H").
 * - 1 top-center MOVE handle — drag to reposition the page origin
 *   (dispatches `MovePageCommand` on pointerup).
 * - 8 RESIZE handles (4 corners + 4 edge midpoints) — drag to resize
 *   the page (dispatches `ResizePageCommand` on pointerup).
 *
 * **Drag model** (Fase 6):
 *
 * - On `pointerdown` on a handle: capture pointer, snapshot the
 *   current viewBox, record cursor doc-position. No command dispatched
 *   yet. Local `_drag` signal flips on.
 * - On `pointermove`: update `_drag.currentPoint`. The `overlay()`
 *   computed reads `_drag` and renders the brackets/handles/label at
 *   the PREVIEWED geometry (start + delta). Page content is NOT moved
 *   yet — the preview is overlay-only to keep the gesture cheap and
 *   the undo stack to a single entry.
 * - On `pointerup`: compute the final viewBox from the preview, drop
 *   the local `_drag` state, dispatch ONE command (`MovePageCommand`
 *   for move, `ResizePageCommand` for resize). The dispatched command's
 *   no-op short-circuit guards against degenerate clicks (down → up
 *   with no move).
 *
 * **Why preview-then-dispatch** (vs. live dispatch per pointermove):
 * dispatching every pointermove would either flood the undo stack
 * with intermediate viewBoxes OR require a coalescing layer in
 * CommandBus. Preview-then-dispatch is simpler, keeps the undo
 * model clean (one drag = one undo entry), and is acceptable UX
 * because the brackets/handles do follow the cursor in real time —
 * only the page CONTENT lags until pointerup. A future enhancement
 * (separate gesture service) can add live content preview without
 * changing this overlay's API.
 *
 * **Zoom-stable size** — bracket/label/handle dimensions divide by
 * `viewport.zoom()` via dedicated computeds. `vector-effect: non-
 * scaling-stroke` complements this for bracket stroke widths.
 *
 * **Projection** (D-022): mount as the LAST `<svg:g>` child of
 * `<svge-renderer>` so it paints on top of all document content. The
 * renderer's `<ng-content />` preserves projection order:
 *
 * ```html
 * <svge-renderer [tree]="tree()" [viewBox]="viewBox()">
 *   <svg:g svgePageOverlay svgeBehind></svg:g>
 *   <svg:g svgeGridOverlay svgeBehind></svg:g>
 *   <svg:g svgeSelectionOverlay></svg:g>
 *   <svg:g svgePageSelectionOverlay></svg:g>
 * </svge-renderer>
 * ```
 *
 * **No-op** when there is no active page OR the active page isn't
 * selected — zero footprint at the default scope.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgePageSelectionOverlay]',
  standalone: true,
  host: { 'aria-hidden': 'true' },
  template: `
    @if (overlay(); as o) {
      <!--
        Floating label above the page's top-left corner. Format:
        "Page 1 — 800×600" (per the answered user preference).
        text-anchor=start so the label aligns with the bracket TL.
        Font size and y-offset compensate for zoom so the label stays
        at constant CSS-pixel size across the zoom range.
      -->
      <svg:text
        class="page-label"
        [attr.x]="o.x"
        [attr.y]="o.y - labelOffsetDoc()"
        [attr.font-size]="labelFontSizeDoc() + 'px'"
        text-anchor="start"
      >
        {{ o.label }}
      </svg:text>

      <!--
        Top-center MOVE handle. Sits between the label and the page's
        top edge — close enough to the label that they read as one
        UI group ("page metadata + drag handle"). The handle is a
        small square with a distinctive blue fill so it doesn't get
        confused with shape resize handles (which have a white fill).
        Fase 6 — wired to MovePageCommand on pointerup.
      -->
      <svg:rect
        class="page-move-handle"
        [attr.x]="o.x + o.width / 2 - handleHalfDoc()"
        [attr.y]="o.y - handleOffsetDoc()"
        [attr.width]="handleSizeDoc()"
        [attr.height]="handleSizeDoc()"
        aria-label="Page move handle — drag to reposition the page"
        role="button"
        (pointerdown)="onMoveHandlePointerDown($event)"
        (pointermove)="onHandlePointerMove($event)"
        (pointerup)="onHandlePointerUp($event)"
      ></svg:rect>

      <!--
        4 corner brackets — draw.io style "L" marks at each corner of
        the page's viewBox. Decorative only (pointer-events: none); the
        actual resize affordance lives on the 8 square handles below
        which sit ON TOP of the bracket vertices and corners.
      -->
      <svg:path class="page-bracket" [attr.d]="bracketTL(o)"></svg:path>
      <svg:path class="page-bracket" [attr.d]="bracketTR(o)"></svg:path>
      <svg:path class="page-bracket" [attr.d]="bracketBL(o)"></svg:path>
      <svg:path class="page-bracket" [attr.d]="bracketBR(o)"></svg:path>

      <!--
        Fase 6 — 8 resize handles (4 corners + 4 edge midpoints). Each
        handle is a small square that dispatches ResizePageCommand on
        pointerup. The cursor style hints the axis of resize (n-resize,
        e-resize, etc.) — matches the user's reference image where the
        handles are always available, not just on hover.
      -->
      @for (h of resizeHandles(); track h.anchor) {
        <svg:rect
          class="page-resize-handle"
          [class]="'page-resize-handle anchor-' + h.anchor"
          [attr.x]="h.x - handleHalfDoc()"
          [attr.y]="h.y - handleHalfDoc()"
          [attr.width]="handleSizeDoc()"
          [attr.height]="handleSizeDoc()"
          [attr.data-svge-page-handle]="h.anchor"
          [attr.aria-label]="'Page resize handle, ' + anchorLabel(h.anchor)"
          role="button"
          (pointerdown)="onResizeHandlePointerDown($event, h.anchor)"
          (pointermove)="onHandlePointerMove($event)"
          (pointerup)="onHandlePointerUp($event)"
        ></svg:rect>
      }
    }
  `,
  styles: `
    .page-label {
      fill: var(--svge-page-overlay-stroke, #1976d2);
      font-family:
        system-ui,
        -apple-system,
        sans-serif;
      font-weight: 500;
      pointer-events: none;
      user-select: none;
    }
    .page-bracket {
      fill: none;
      stroke: var(--svge-page-overlay-stroke, #1976d2);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    .page-move-handle {
      fill: var(--svge-page-overlay-stroke, #1976d2);
      stroke: var(--svge-page-overlay-handle-stroke, #ffffff);
      stroke-width: 1.5;
      vector-effect: non-scaling-stroke;
      cursor: move;
      touch-action: none;
      pointer-events: all;
    }
    .page-resize-handle {
      fill: #ffffff;
      stroke: var(--svge-page-overlay-stroke, #1976d2);
      stroke-width: 1.5;
      vector-effect: non-scaling-stroke;
      touch-action: none;
      pointer-events: all;
    }
    /* Axis-aware cursors for each anchor — Illustrator/Figma convention.
       Corners use diagonal resize cursors; edges use cardinal cursors. */
    .page-resize-handle.anchor-tl,
    .page-resize-handle.anchor-br {
      cursor: nwse-resize;
    }
    .page-resize-handle.anchor-tr,
    .page-resize-handle.anchor-bl {
      cursor: nesw-resize;
    }
    .page-resize-handle.anchor-t,
    .page-resize-handle.anchor-b {
      cursor: ns-resize;
    }
    .page-resize-handle.anchor-l,
    .page-resize-handle.anchor-r {
      cursor: ew-resize;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgePageSelectionOverlay {
  private readonly activePage = inject(ActivePageService);
  private readonly selection = inject(SelectionService);
  private readonly viewport = inject(ViewportService);
  private readonly bus = inject(CommandBus);

  /**
   * In-progress drag state. `null` when no drag is active. Set on
   * pointerdown, mutated on pointermove (updating `currentPoint`),
   * cleared on pointerup. Drives the preview rendering in {@link overlay}.
   */
  private readonly _drag = signal<DragState | null>(null);

  /**
   * All visual sizes are doc-unit values derived from CSS-pixel
   * constants divided by current zoom. Keeping the conversion in
   * one `computed` per dimension makes the template render path
   * trivial (single multiplication / sum per attribute) and avoids
   * re-computing zoom for every element.
   */
  protected readonly handleSizeDoc = computed(() => HANDLE_SIZE_PX / this.viewport.zoom());
  protected readonly handleHalfDoc = computed(() => this.handleSizeDoc() / 2);
  protected readonly handleOffsetDoc = computed(() => HANDLE_OFFSET_PX / this.viewport.zoom());
  protected readonly labelOffsetDoc = computed(() => LABEL_OFFSET_PX / this.viewport.zoom());
  protected readonly labelFontSizeDoc = computed(() => LABEL_FONT_SIZE_PX / this.viewport.zoom());
  protected readonly bracketArmDoc = computed(() => BRACKET_ARM_PX / this.viewport.zoom());

  /**
   * Source of truth for the overlay. `null` when:
   * - no page is active in the editor scope, OR
   * - the active page is not the current selection.
   *
   * **Fase 6**: when a drag is in progress, returns the PREVIEW
   * geometry derived from `_drag` (start viewBox + delta) instead of
   * the page's stored viewBox. Lets brackets/handles/label track the
   * cursor in real time without dispatching commands until pointerup.
   */
  protected readonly overlay = computed(() => {
    const page = this.activePage.activePage();
    if (page === null) return null;
    if (!this.selection.isSelected(page.id)) return null;
    const vb = getPageViewBox(page);
    if (vb === null) return null;
    const preview = this.previewViewBox(vb);
    const name = getPageName(page);
    // Format per answered preference: "Page 1 — 800×600". Uses em-
    // dash + the multiplication sign (not lowercase x) — matches the
    // dimensions shown in the Inspector Page tab + reads cleaner.
    const label = `${name} — ${this.formatDim(preview.width)}×${this.formatDim(preview.height)}`;
    return {
      x: preview.x,
      y: preview.y,
      width: preview.width,
      height: preview.height,
      label,
    };
  });

  /**
   * Positions of the 8 resize handles (in doc coords) derived from the
   * current overlay rect. Each handle has an anchor id so the
   * pointerdown handler knows which sides to update during the drag.
   */
  protected readonly resizeHandles = computed<{ anchor: ResizeAnchor; x: number; y: number }[]>(
    () => {
      const o = this.overlay();
      if (o === null) return [];
      const cx = o.x + o.width / 2;
      const cy = o.y + o.height / 2;
      const x2 = o.x + o.width;
      const y2 = o.y + o.height;
      return [
        { anchor: 'tl', x: o.x, y: o.y },
        { anchor: 't', x: cx, y: o.y },
        { anchor: 'tr', x: x2, y: o.y },
        { anchor: 'r', x: x2, y: cy },
        { anchor: 'br', x: x2, y: y2 },
        { anchor: 'b', x: cx, y: y2 },
        { anchor: 'bl', x: o.x, y: y2 },
        { anchor: 'l', x: o.x, y: cy },
      ];
    },
  );

  /**
   * Format a dimension as an integer when it's a clean number,
   * otherwise round to 1 decimal. Avoids "800.000000001" noise
   * from float arithmetic without showing useless ".0" suffixes
   * for round dimensions.
   */
  private formatDim(value: number): string {
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(1);
  }

  /** Top-left bracket path: vertical arm down + horizontal arm right. */
  protected bracketTL(o: { x: number; y: number }): string {
    const L = this.bracketArmDoc();
    return `M${o.x},${o.y + L} L${o.x},${o.y} L${o.x + L},${o.y}`;
  }

  /** Top-right bracket path: horizontal arm left + vertical arm down. */
  protected bracketTR(o: { x: number; y: number; width: number }): string {
    const L = this.bracketArmDoc();
    const x2 = o.x + o.width;
    return `M${x2 - L},${o.y} L${x2},${o.y} L${x2},${o.y + L}`;
  }

  /** Bottom-left bracket path: vertical arm up + horizontal arm right. */
  protected bracketBL(o: { x: number; y: number; height: number }): string {
    const L = this.bracketArmDoc();
    const y2 = o.y + o.height;
    return `M${o.x},${y2 - L} L${o.x},${y2} L${o.x + L},${y2}`;
  }

  /** Bottom-right bracket path: horizontal arm left + vertical arm up. */
  protected bracketBR(o: { x: number; y: number; width: number; height: number }): string {
    const L = this.bracketArmDoc();
    const x2 = o.x + o.width;
    const y2 = o.y + o.height;
    return `M${x2 - L},${y2} L${x2},${y2} L${x2},${y2 - L}`;
  }

  /** Human-readable expansion of the 8 anchor codes (for aria-label). */
  protected anchorLabel(a: ResizeAnchor): string {
    const labels: Record<ResizeAnchor, string> = {
      tl: 'top-left corner',
      t: 'top-center edge',
      tr: 'top-right corner',
      r: 'right edge',
      br: 'bottom-right corner',
      b: 'bottom-center edge',
      bl: 'bottom-left corner',
      l: 'left edge',
    };
    return labels[a];
  }

  // ── Pointer handlers ─────────────────────────────────────────────

  /**
   * Pointer-down on the move handle. Captures the pointer + snapshots
   * the page's current viewBox + cursor. Subsequent pointermove updates
   * `_drag.currentPoint`; pointerup dispatches `MovePageCommand`.
   */
  protected onMoveHandlePointerDown(event: PointerEvent): void {
    const page = this.activePage.activePage();
    if (page === null) return;
    const vb = getPageViewBox(page);
    if (vb === null) return;
    const start = this.screenToDoc(event);
    if (start === null) return;
    event.stopPropagation();
    capturePointer(event);
    this._drag.set({
      kind: 'move',
      anchor: null,
      pageId: page.id,
      startViewBox: { x: vb.x, y: vb.y, width: vb.width, height: vb.height },
      startPoint: start,
      currentPoint: start,
    });
  }

  /**
   * Pointer-down on a resize handle. Same capture pattern as move; the
   * `anchor` field tells the preview computer which side(s) of the
   * viewBox to update during the drag.
   */
  protected onResizeHandlePointerDown(event: PointerEvent, anchor: ResizeAnchor): void {
    const page = this.activePage.activePage();
    if (page === null) return;
    const vb = getPageViewBox(page);
    if (vb === null) return;
    const start = this.screenToDoc(event);
    if (start === null) return;
    event.stopPropagation();
    capturePointer(event);
    this._drag.set({
      kind: 'resize',
      anchor,
      pageId: page.id,
      startViewBox: { x: vb.x, y: vb.y, width: vb.width, height: vb.height },
      startPoint: start,
      currentPoint: start,
    });
  }

  /**
   * Shared pointermove handler — updates `_drag.currentPoint`. The
   * `overlay()` computed picks this up and renders the preview at the
   * new geometry. Page content stays at its committed position until
   * pointerup.
   */
  protected onHandlePointerMove(event: PointerEvent): void {
    const ds = this._drag();
    if (ds === null) return;
    const next = this.screenToDoc(event);
    if (next === null) return;
    this._drag.set({ ...ds, currentPoint: next });
  }

  /**
   * Shared pointerup handler — commits the drag via a single command
   * dispatch (MovePageCommand for kind='move', ResizePageCommand for
   * kind='resize'), then clears the drag state. Pointer capture is
   * released defensively.
   */
  protected onHandlePointerUp(event: PointerEvent): void {
    const ds = this._drag();
    if (ds === null) return;
    const final = this.computeFinalViewBox(ds);
    this._drag.set(null);
    releasePointer(event);
    if (ds.kind === 'move') {
      this.bus.dispatch(new MovePageCommand(ds.pageId, { x: final.x, y: final.y }));
    } else {
      this.bus.dispatch(new ResizePageCommand(ds.pageId, final));
    }
  }

  // ── Internals ────────────────────────────────────────────────────

  /**
   * Compute the previewed viewBox based on the in-progress drag (if
   * any). When no drag, returns the stored viewBox unchanged.
   */
  private previewViewBox(stored: { x: number; y: number; width: number; height: number }): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const ds = this._drag();
    if (ds === null) return stored;
    return this.computeFinalViewBox(ds);
  }

  /**
   * Apply the drag delta to the start viewBox according to the anchor.
   * Clamps width/height to {@link MIN_PAGE_DIM} so the user can't
   * collapse the page to zero. Pure function — uses only the drag
   * state, doesn't read or mutate any signal.
   */
  private computeFinalViewBox(ds: DragState): {
    x: number;
    y: number;
    width: number;
    height: number;
  } {
    const dx = ds.currentPoint.x - ds.startPoint.x;
    const dy = ds.currentPoint.y - ds.startPoint.y;
    const sv = ds.startViewBox;
    if (ds.kind === 'move') {
      return { x: sv.x + dx, y: sv.y + dy, width: sv.width, height: sv.height };
    }
    // Resize — branch by anchor. For each side touched: shift origin
    // and/or change dimension. Min-dim clamp prevents degenerate boxes.
    let x = sv.x;
    let y = sv.y;
    let w = sv.width;
    let h = sv.height;
    const x2 = sv.x + sv.width;
    const y2 = sv.y + sv.height;
    switch (ds.anchor) {
      case 'tl': {
        x = Math.min(sv.x + dx, x2 - MIN_PAGE_DIM);
        y = Math.min(sv.y + dy, y2 - MIN_PAGE_DIM);
        w = x2 - x;
        h = y2 - y;
        break;
      }
      case 't': {
        y = Math.min(sv.y + dy, y2 - MIN_PAGE_DIM);
        h = y2 - y;
        break;
      }
      case 'tr': {
        y = Math.min(sv.y + dy, y2 - MIN_PAGE_DIM);
        h = y2 - y;
        w = Math.max(sv.width + dx, MIN_PAGE_DIM);
        break;
      }
      case 'r': {
        w = Math.max(sv.width + dx, MIN_PAGE_DIM);
        break;
      }
      case 'br': {
        w = Math.max(sv.width + dx, MIN_PAGE_DIM);
        h = Math.max(sv.height + dy, MIN_PAGE_DIM);
        break;
      }
      case 'b': {
        h = Math.max(sv.height + dy, MIN_PAGE_DIM);
        break;
      }
      case 'bl': {
        x = Math.min(sv.x + dx, x2 - MIN_PAGE_DIM);
        w = x2 - x;
        h = Math.max(sv.height + dy, MIN_PAGE_DIM);
        break;
      }
      case 'l': {
        x = Math.min(sv.x + dx, x2 - MIN_PAGE_DIM);
        w = x2 - x;
        break;
      }
      case null:
        // Never reached for kind='resize' — anchor is required there.
        break;
    }
    return { x, y, width: w, height: h };
  }

  /**
   * Convert a pointer event's client coordinates to document units
   * via the canonical {@link screenToDoc} util. Returns `null` when
   * the SVG host isn't reachable (defensive: jsdom / SSR / mid-detach).
   */
  private screenToDoc(event: PointerEvent): { x: number; y: number } | null {
    const target = event.target;
    if (!(target instanceof Element)) return null;
    // ownerSVGElement only exists on SVGElement instances — narrow
    // explicitly because TS doesn't infer it from Element alone.
    if (!(target instanceof SVGElement)) return null;
    return screenToDoc(target.ownerSVGElement, event.clientX, event.clientY);
  }
}
