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
import { PAGE_TOOL_ID } from '../tool/builtin-tools';
import { ToolHostService } from '../tool/tool-host.service';
import { ActivePageService } from './active-page.service';

/**
 * Bracket arm length in CSS pixels — the visible "L" extends this far
 * INWARD from each page corner. 16px reads as a crisp affordance at
 * default zoom without competing with the artboard content. Bumped
 * from 12 → 16 alongside the bracket-as-handle refactor so the click
 * target along the visible bracket is large enough to grab comfortably.
 */
const BRACKET_ARM_PX = 16;

// **PAGES-REFACTOR follow-up #3** — bracket-hit invisible stroke is
// `stroke-width: 14` in the .bracket-hit CSS rule (see styles block).
// We don't keep a JS-side constant because the rule is purely static
// (the engine uses `vector-effect: non-scaling-stroke` so the 14 CSS
// px hit zone is zoom-independent without needing JS-side scaling).

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
 * Minimum page dimension (doc units). Resize gestures clamp width/
 * height to this so the user can't drag a page down to zero (which
 * would make it un-selectable and visually invisible).
 */
const MIN_PAGE_DIM = 10;

/**
 * Resize anchor identifier. **PAGES-REFACTOR follow-up #3** — narrowed
 * from 8 anchors (4 corners + 4 edges) to **4 corners only** when the
 * 8 square resize handles + the move-handle square were dropped in
 * favor of "L-brackets only" visual. Each L-bracket is anchored at
 * a corner of the page, so only corner resize is wired up. Edge
 * resize was dropped (lower-frequency operation; Inspector Page tab
 * still exposes precise W/H input as the keyboard path).
 *
 * The drag-state union keeps `ResizeAnchor | null` so move-drag
 * (`anchor: null`) stays type-safe.
 */
type ResizeAnchor = 'tl' | 'tr' | 'bl' | 'br';

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
        **PAGES-REFACTOR follow-up #3** — invisible MOVE area covering
        the page interior. Replaces the dedicated move-handle square
        (top-center) — the user asked for "brackets only" visually but
        we still need a drag affordance, so we use the page interior
        itself (Illustrator/Affinity convention: with Artboard Tool
        active, dragging anywhere on the artboard moves it).

        'fill: transparent' + 'pointer-events: all' makes the entire
        rect clickable while staying visually invisible. Cursor: move
        gives the affordance hint. Rendered BEFORE the brackets so the
        bracket hit-areas (rendered LATER → on top) intercept clicks
        near the corners → start a resize drag instead of a move drag.

        Because PageSelectionOverlay is mounted in the FRONT slot of
        SvgeRenderer, this rect sits ABOVE shape content. That's
        intentional: Page tool isn't for editing shapes, so click-
        through to shapes is undesirable — we want clicks on the page
        interior to move the page, not select a shape underneath.
      -->
      <svg:rect
        class="page-move-area"
        [attr.x]="o.x"
        [attr.y]="o.y"
        [attr.width]="o.width"
        [attr.height]="o.height"
        aria-label="Page move area — drag to reposition the page"
        role="button"
        (pointerdown)="onMoveHandlePointerDown($event)"
        (pointermove)="onHandlePointerMove($event)"
        (pointerup)="onHandlePointerUp($event)"
      ></svg:rect>

      <!--
        **PAGES-REFACTOR follow-up #3** — 4 corner L-brackets, each
        wrapped in an svg:g that owns the resize drag gesture. The
        bracket-hit path under each visible bracket gives a wider
        invisible stroke for comfortable click targeting (visible
        stroke is only ~3 CSS px wide). Cursor + anchor are corner-
        specific (nwse-resize for tl/br diagonal, nesw-resize for
        tr/bl anti-diagonal — Illustrator/Figma convention).

        Rendered AFTER the move-area so SVG hit-testing picks the
        bracket first when the pointer is near a corner → resize
        drag fires; everywhere else in the page interior → move drag.
      -->
      <svg:g
        class="bracket-group bracket-tl"
        aria-label="Page resize handle, top-left corner"
        role="button"
        (pointerdown)="onResizeHandlePointerDown($event, 'tl')"
        (pointermove)="onHandlePointerMove($event)"
        (pointerup)="onHandlePointerUp($event)"
      >
        <svg:path class="bracket-hit" [attr.d]="bracketTL(o)"></svg:path>
        <svg:path class="page-bracket" [attr.d]="bracketTL(o)"></svg:path>
      </svg:g>
      <svg:g
        class="bracket-group bracket-tr"
        aria-label="Page resize handle, top-right corner"
        role="button"
        (pointerdown)="onResizeHandlePointerDown($event, 'tr')"
        (pointermove)="onHandlePointerMove($event)"
        (pointerup)="onHandlePointerUp($event)"
      >
        <svg:path class="bracket-hit" [attr.d]="bracketTR(o)"></svg:path>
        <svg:path class="page-bracket" [attr.d]="bracketTR(o)"></svg:path>
      </svg:g>
      <svg:g
        class="bracket-group bracket-bl"
        aria-label="Page resize handle, bottom-left corner"
        role="button"
        (pointerdown)="onResizeHandlePointerDown($event, 'bl')"
        (pointermove)="onHandlePointerMove($event)"
        (pointerup)="onHandlePointerUp($event)"
      >
        <svg:path class="bracket-hit" [attr.d]="bracketBL(o)"></svg:path>
        <svg:path class="page-bracket" [attr.d]="bracketBL(o)"></svg:path>
      </svg:g>
      <svg:g
        class="bracket-group bracket-br"
        aria-label="Page resize handle, bottom-right corner"
        role="button"
        (pointerdown)="onResizeHandlePointerDown($event, 'br')"
        (pointermove)="onHandlePointerMove($event)"
        (pointerup)="onHandlePointerUp($event)"
      >
        <svg:path class="bracket-hit" [attr.d]="bracketBR(o)"></svg:path>
        <svg:path class="page-bracket" [attr.d]="bracketBR(o)"></svg:path>
      </svg:g>
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
    /*
     * **PAGES-REFACTOR follow-up #3** — visible bracket. Decorative
     * (pointer-events: none) — the bracket-hit sibling underneath
     * owns the click. Bumped from stroke-width 2 → 3 so the visible
     * affordance reads at parity with the wider invisible hit-area
     * (no jarring mismatch when the user hovers).
     */
    .page-bracket {
      fill: none;
      stroke: var(--svge-page-overlay-stroke, #1976d2);
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    /*
     * Invisible wider stroke painted under each visible bracket so
     * the click target is comfortable (~14 CSS px) without bloating
     * the visible mark. pointer-events: stroke makes only the
     * stroked path region clickable (not the empty interior of the L).
     */
    .bracket-hit {
      fill: none;
      stroke: transparent;
      stroke-width: 14;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
      pointer-events: stroke;
    }
    /*
     * Per-corner bracket groups — cursor signals the resize axis.
     * Illustrator/Figma convention: tl/br use the NW↘SE diagonal
     * cursor; tr/bl use the NE↗SW anti-diagonal cursor.
     */
    .bracket-group {
      touch-action: none;
    }
    .bracket-group.bracket-tl,
    .bracket-group.bracket-br {
      cursor: nwse-resize;
    }
    .bracket-group.bracket-tr,
    .bracket-group.bracket-bl {
      cursor: nesw-resize;
    }
    /*
     * **PAGES-REFACTOR follow-up #3** — invisible move area covering
     * the page interior. fill: transparent + pointer-events: all
     * keeps the rect visually absent while making the entire interior
     * draggable. Cursor: move gives the affordance hint as the user
     * hovers anywhere on the page surface (Illustrator parity).
     */
    .page-move-area {
      fill: transparent;
      cursor: move;
      pointer-events: all;
      touch-action: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgePageSelectionOverlay {
  private readonly activePage = inject(ActivePageService);
  private readonly selection = inject(SelectionService);
  private readonly viewport = inject(ViewportService);
  private readonly bus = inject(CommandBus);
  // PAGES-REFACTOR follow-up — overlay is GATED on the Page tool
  // being the active tool. Without the Page tool active, the user
  // can't accidentally trigger page resize/move handles while editing
  // shapes (the brackets/label/handles render nothing). Matches the
  // Illustrator "Artboard Tool" pattern.
  private readonly toolHost = inject(ToolHostService);

  /**
   * In-progress drag state. `null` when no drag is active. Set on
   * pointerdown, mutated on pointermove (updating `currentPoint`),
   * cleared on pointerup. Drives the preview rendering in {@link overlay}.
   */
  private readonly _drag = signal<DragState | null>(null);

  /**
   * Visual sizes are doc-unit values derived from CSS-pixel constants
   * divided by current zoom. Keeping the conversion in one `computed`
   * per dimension makes the template render path trivial (single
   * multiplication / sum per attribute) and avoids re-computing zoom
   * for every element.
   *
   * **PAGES-REFACTOR follow-up #3** — the `handleSizeDoc` / `handleHalfDoc`
   * / `handleOffsetDoc` computeds were dropped when the 8 square resize
   * handles + move-handle square were removed from the template. All
   * that remains is the bracket / label scale: brackets are paths (use
   * `bracketArmDoc`) and the label is a `<text>` element (uses
   * `labelOffsetDoc` + `labelFontSizeDoc`).
   */
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
    // **PAGES-REFACTOR follow-up** — Artboard Tool mode gate.
    // The overlay is INVISIBLE unless the user explicitly activates
    // the Page tool (via the tools palette or Shift+O). This
    // mirrors Illustrator's behavior: artboard handles only appear
    // when you're in Artboard Tool mode. Net result for the user:
    // clicking on the page paper with Select tool active = nothing
    // happens (selection clears via shell-interactions); clicking
    // with Page tool active = the page is selected and the
    // brackets+handles+label appear.
    if (this.toolHost.activeId() !== PAGE_TOOL_ID) return null;
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
    // **PAGES-REFACTOR follow-up #3** — only the 4 corner anchors
    // remain after the bracket-as-handle refactor. Edge resize was
    // dropped because there's no L-bracket on the edges to grab; the
    // Inspector Page tab is the keyboard/precision path for one-axis
    // resize when needed.
    switch (ds.anchor) {
      case 'tl': {
        x = Math.min(sv.x + dx, x2 - MIN_PAGE_DIM);
        y = Math.min(sv.y + dy, y2 - MIN_PAGE_DIM);
        w = x2 - x;
        h = y2 - y;
        break;
      }
      case 'tr': {
        y = Math.min(sv.y + dy, y2 - MIN_PAGE_DIM);
        h = y2 - y;
        w = Math.max(sv.width + dx, MIN_PAGE_DIM);
        break;
      }
      case 'br': {
        w = Math.max(sv.width + dx, MIN_PAGE_DIM);
        h = Math.max(sv.height + dy, MIN_PAGE_DIM);
        break;
      }
      case 'bl': {
        x = Math.min(sv.x + dx, x2 - MIN_PAGE_DIM);
        w = x2 - x;
        h = Math.max(sv.height + dy, MIN_PAGE_DIM);
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
