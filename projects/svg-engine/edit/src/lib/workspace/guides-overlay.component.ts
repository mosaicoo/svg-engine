import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  type OnDestroy,
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
export class GuidesOverlay implements OnDestroy {
  private readonly ws = inject(WorkspaceService);
  private readonly viewport = inject(ViewportService);
  private readonly elRef = inject(ElementRef<SVGGElement>);
  private readonly document = inject(DOCUMENT);

  constructor() {
    // CLAUDE.md proíbe @HostListener; document-level keydown precisa
    // de listener manual. Removido em ngOnDestroy.
    this.document.addEventListener('keydown', this.onDocumentKeyDown);
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('keydown', this.onDocumentKeyDown);
  }

  private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    if (this.dragState === null) return;
    this.ws.moveGuide(this.dragState.guideId, this.dragState.startPosition);
    this.dragState = null;
  };

  protected readonly guides = this.ws.guides;

  /**
   * Guide line span — clipped to the **intersection of viewport and
   * page bounds** so guides stay within the editable canvas (matches
   * the grid-clip behaviour, Fase 6 UX polish). When the page extends
   * beyond the viewport, the visible portion shrinks; when the viewport
   * extends beyond the page (zoom-out), the guide stops at the page
   * edge so the pasteboard area remains visually empty.
   *
   * Falls back to the viewport bounds when page has zero dims
   * (defensive — patchPage validation rejects that, but tests may
   * inject a stub).
   */
  private readonly clipBounds = computed(() => {
    const vb = this.viewport.viewBox();
    const page = this.ws.page();
    const pageW = page.width > 0 ? page.width : vb.width;
    const pageH = page.height > 0 ? page.height : vb.height;
    // Page starts at origin (matches page-overlay anchor).
    const left = Math.max(vb.x, 0);
    const top = Math.max(vb.y, 0);
    const right = Math.min(vb.x + vb.width, pageW);
    const bottom = Math.min(vb.y + vb.height, pageH);
    return { left, top, right, bottom };
  });

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
