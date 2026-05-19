import { DOCUMENT } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  type OnDestroy,
  signal,
} from '@angular/core';
import { ViewportService } from 'svg-engine/render';
import { WorkspaceService } from './workspace.service';

/**
 * SVG overlay that renders user-drawn guide lines (Bloco 4f) with
 * drag-to-move + double-click-to-remove (Item 2 — débito 4f).
 *
 * **Two-line trick per guide**: the visible 1px line + an invisible
 * thicker hit-zone line on top. Hit-zone catches `pointerdown` even
 * when the user is a few pixels off — without it, hitting a hair-thin
 * line is a frustrating UX. The hit-zone uses `stroke: transparent`
 * (NOT `none`) so pointer events still register.
 *
 * **Drag**:
 * - `pointerdown` on hit-zone: capture pointer + snapshot start state
 * - `pointermove`: compute delta in doc coords, `moveGuide(id, pos)`
 * - `pointerup`: release capture
 * - `Esc`: revert to starting position
 * - `dblclick`: remove the guide (Photoshop/Affinity convention)
 *
 * **Cursor**: `ns-resize` for horizontal guides (drag vertically),
 * `ew-resize` for vertical guides (drag horizontally).
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeGuidesOverlay]',
  standalone: true,
  template: `
    @for (g of guides(); track g.id) {
      @if (g.axis === 'h') {
        <svg:line
          class="guide-hit ns"
          [attr.x1]="viewBoxLeft()"
          [attr.y1]="g.position"
          [attr.x2]="viewBoxRight()"
          [attr.y2]="g.position"
          [attr.stroke-width]="hitZoneDocUnits()"
          role="slider"
          [attr.aria-label]="'Horizontal guide at y=' + g.position"
          [attr.aria-valuenow]="g.position"
          aria-orientation="horizontal"
          (pointerdown)="onPointerDown($event, g.id, g.axis, g.position)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (dblclick)="onDoubleClick($event, g.id)"
        />
        <svg:line
          class="guide horizontal"
          [class.selected]="selectedGuideId() === g.id"
          [attr.x1]="viewBoxLeft()"
          [attr.y1]="g.position"
          [attr.x2]="viewBoxRight()"
          [attr.y2]="g.position"
        />
      } @else {
        <svg:line
          class="guide-hit ew"
          [attr.x1]="g.position"
          [attr.y1]="viewBoxTop()"
          [attr.x2]="g.position"
          [attr.y2]="viewBoxBottom()"
          [attr.stroke-width]="hitZoneDocUnits()"
          role="slider"
          [attr.aria-label]="'Vertical guide at x=' + g.position"
          [attr.aria-valuenow]="g.position"
          aria-orientation="vertical"
          (pointerdown)="onPointerDown($event, g.id, g.axis, g.position)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (dblclick)="onDoubleClick($event, g.id)"
        />
        <svg:line
          class="guide vertical"
          [class.selected]="selectedGuideId() === g.id"
          [attr.x1]="g.position"
          [attr.y1]="viewBoxTop()"
          [attr.x2]="g.position"
          [attr.y2]="viewBoxBottom()"
        />
      }
    }
  `,
  styles: `
    .guide {
      stroke: #00bcd4;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    /* Selected guide: thicker stroke + warm accent color so the user
       can confirm which guide will be removed by Delete. Stays
       non-scaling under zoom. */
    .guide.selected {
      stroke: #ff6f00;
      stroke-width: 2;
    }
    /* Hit-zone is invisible but pointer-targetable. transparent (NOT
       none) so events register. Per-axis cursor: ns-resize for
       horizontal lines (drag up/down), ew-resize for vertical. */
    .guide-hit {
      stroke: transparent;
      fill: none;
    }
    .guide-hit.ns {
      cursor: ns-resize;
    }
    .guide-hit.ew {
      cursor: ew-resize;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuidesOverlay implements AfterViewInit, OnDestroy {
  private readonly ws = inject(WorkspaceService);
  private readonly viewport = inject(ViewportService);
  private readonly elRef = inject(ElementRef<SVGGElement>);
  private readonly document = inject(DOCUMENT);

  constructor() {
    // CLAUDE.md proíbe @HostListener; document-level keydown precisa
    // de listener manual. Removido em ngOnDestroy.
    this.document.addEventListener('keydown', this.onDocumentKeyDown);
  }

  /**
   * Bumped whenever the SVG host element resizes (ResizeObserver) so
   * `clipBounds` re-runs with fresh CTM-derived bounds. Without this,
   * resizing the window leaves guides anchored to the old layout.
   */
  private readonly layoutVersion = signal(0);
  private resizeObserver: ResizeObserver | null = null;

  ngAfterViewInit(): void {
    // Walk to the owner <svg> and observe its size. The CTM-derived
    // clipBounds also depends on the SVG's CSS dimensions (not just
    // its viewBox), so layout changes that don't touch the viewport
    // signals must still invalidate the computed.
    const svg = this.elRef.nativeElement.ownerSVGElement;
    if (svg !== null && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.layoutVersion.update((v) => v + 1);
      });
      this.resizeObserver.observe(svg);
    }
    // Initial bump so the first frame after view-init recomputes
    // clipBounds with the now-attached SVG.
    this.layoutVersion.update((v) => v + 1);
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('keydown', this.onDocumentKeyDown);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (this.dragState === null) return;
    this.ws.moveGuide(this.dragState.guideId, this.dragState.startPosition);
    this.dragState = null;
  };

  protected readonly guides = this.ws.guides;

  /**
   * Reactive snapshot of the currently-selected guide id. Drives the
   * `.selected` class on the visible line; consumed by the template
   * binding `[class.selected]="selectedGuideId() === g.id"`.
   */
  protected readonly selectedGuideId = this.ws.selectedGuideId;

  /**
   * Guide line span — extends across the **entire CSS area** of the
   * host `<svg>`, matching the convention of professional editors
   * (Illustrator, Affinity, Photoshop). Guides are infinite reference
   * lines that span from ruler edge to ruler edge, including the
   * letterbox area created by `preserveAspectRatio="xMidYMid meet"`
   * when the viewBox aspect differs from the container aspect.
   *
   * **How it works**: project the four corners of the SVG element's
   * client rect through `getScreenCTM().inverse()` to recover the doc
   * coords that line up with the rect's pixel edges. The min/max of
   * the projected coords define the doc-space window that EXACTLY
   * covers the SVG's CSS area (letterbox included).
   *
   * **Why getScreenCTM and not viewport.viewBox()**: viewport.viewBox
   * is the value bound to the `<svg viewBox>` attribute. When the SVG
   * letterboxes, the rendered content area is NARROWER than the CSS
   * area on the constrained axis. A guide using viewBox bounds would
   * stop at the letterbox edge instead of spanning the full bar.
   *
   * **Pre-requisite for visibility**: the SVG must have `overflow:
   * visible` (set in `svge-renderer.component.ts`). Without it, any
   * geometry outside the viewBox is clipped — even with correct
   * coordinates the guides would still stop at the viewBox edge.
   *
   * **Fallback**: when the SVG isn't reachable or `getScreenCTM` is
   * unavailable (jsdom / SSR), fall back to `viewport.viewBox()` so
   * tests don't crash and the SSR render produces something sensible.
   *
   * **History**:
   * 1. Originally clipped to intersection of viewport and page.
   * 2. Then full page bounds — lines were doc-fixed but didn't extend
   *    into the pasteboard, breaking pro-tool convention.
   * 3. Then `viewport.viewBox()` — extended past the page but stopped
   *    at the SVG viewBox boundary, leaving the letterbox empty when
   *    aspect ratios differed (user-reported bug: "laterais das guias").
   * 4. Now: project SVG client rect via inverse CTM. Truly spans the
   *    full ruler-bar range on both axes regardless of letterbox.
   */
  private readonly clipBounds = computed(() => {
    // Touch reactive dependencies up-front so the computed re-runs
    // on any of: viewport change (pan/zoom), workspace change (zoom-fit),
    // or layout change (window resize).
    this.layoutVersion();
    this.viewport.viewBox();
    const ctmBounds = this.computeClipBoundsFromCtm();
    if (ctmBounds !== null) return ctmBounds;
    // Fallback for jsdom / SSR / detached SVG.
    const vb = this.viewport.viewBox();
    return { left: vb.x, top: vb.y, right: vb.x + vb.width, bottom: vb.y + vb.height };
  });

  /**
   * Project the SVG element's client rect to doc coordinates via
   * `getScreenCTM().inverse()`. Returns `null` when any precondition
   * fails (no SVG ref, jsdom without CTM impl, detached element, etc.)
   * — callers must apply a viewBox-based fallback.
   *
   * Two corner projection (TL + BR) is sufficient because the screen-
   * to-doc CTM contains no rotation in our use case (we only ever
   * translate + uniform scale), so the doc-space rect is axis-aligned.
   * If the CTM ever picks up rotation, switch to projecting all four
   * corners and using min/max — but at that point the whole "axis-
   * aligned guide" model breaks anyway, so YAGNI.
   */
  private computeClipBoundsFromCtm(): {
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null {
    const svg = this.elRef.nativeElement.ownerSVGElement;
    if (svg === null) return null;
    if (typeof svg.getScreenCTM !== 'function') return null;
    if (typeof svg.createSVGPoint !== 'function') return null;
    const ctm = svg.getScreenCTM() as DOMMatrix | null;
    if (ctm === null) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const inv = ctm.inverse();
    const tlPt = svg.createSVGPoint();
    tlPt.x = rect.left;
    tlPt.y = rect.top;
    const tl = tlPt.matrixTransform(inv);
    const brPt = svg.createSVGPoint();
    brPt.x = rect.right;
    brPt.y = rect.bottom;
    const br = brPt.matrixTransform(inv);
    if (!Number.isFinite(tl.x) || !Number.isFinite(br.x)) return null;
    if (!Number.isFinite(tl.y) || !Number.isFinite(br.y)) return null;
    return {
      left: Math.min(tl.x, br.x),
      top: Math.min(tl.y, br.y),
      right: Math.max(tl.x, br.x),
      bottom: Math.max(tl.y, br.y),
    };
  }

  protected readonly viewBoxLeft = computed(() => this.clipBounds().left);
  protected readonly viewBoxTop = computed(() => this.clipBounds().top);
  protected readonly viewBoxRight = computed(() => this.clipBounds().right);
  protected readonly viewBoxBottom = computed(() => this.clipBounds().bottom);

  /**
   * Hit-zone thickness in viewBox units, sized to approximate
   * ~12 CSS pixels at the current zoom. Falls back to a sane
   * constant if zoom is missing/zero (defensive — viewport always
   * reports zoom > 0 but tests may inject a stub).
   */
  protected readonly hitZoneDocUnits = computed(() => {
    const z = this.viewport.zoom();
    return z > 0 ? 12 / z : 12;
  });

  // ── Drag state ────────────────────────────────────────────────

  private dragState: {
    readonly guideId: string;
    readonly axis: 'h' | 'v';
    readonly startPosition: number;
    /** Cursor position along the dragged axis at gesture start (doc coords). */
    readonly startCursor: number;
  } | null = null;

  protected onPointerDown(
    event: PointerEvent,
    id: string,
    axis: 'h' | 'v',
    position: number,
  ): void {
    const docPoint = this.screenToDoc(event.clientX, event.clientY);
    if (docPoint === null) return;
    // Mark this guide as the active selection so the visible line
    // gets the .selected highlight and the Delete-key handler in
    // the playground knows which guide to remove.
    this.ws.selectGuide(id);
    this.dragState = {
      guideId: id,
      axis,
      startPosition: position,
      startCursor: axis === 'h' ? docPoint.y : docPoint.x,
    };
    (event.target as Element & { setPointerCapture?(id: number): void }).setPointerCapture?.(
      event.pointerId,
    );
    event.stopPropagation();
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragState === null) return;
    const docPoint = this.screenToDoc(event.clientX, event.clientY);
    if (docPoint === null) return;
    const cursor = this.dragState.axis === 'h' ? docPoint.y : docPoint.x;
    const delta = cursor - this.dragState.startCursor;
    this.ws.moveGuide(this.dragState.guideId, this.dragState.startPosition + delta);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.dragState === null) return;
    (
      event.target as Element & { releasePointerCapture?(id: number): void }
    ).releasePointerCapture?.(event.pointerId);
    this.dragState = null;
    event.stopPropagation();
  }

  protected onDoubleClick(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.ws.removeGuide(id);
  }

  private screenToDoc(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = this.elRef.nativeElement.ownerSVGElement;
    if (svg === null) return null;
    // jsdom doesn't implement getScreenCTM (returns nothing — not even
    // null), and some environments may return null for detached SVGs.
    // Defensive cast + guard against both cases.
    const ctm =
      typeof svg.getScreenCTM === 'function' ? (svg.getScreenCTM() as DOMMatrix | null) : null;
    if (ctm === null) return null;
    const inverse = ctm.inverse();
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const userSpace = pt.matrixTransform(inverse);
    return { x: userSpace.x, y: userSpace.y };
  }
}
