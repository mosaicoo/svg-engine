import { ChangeDetectionStrategy, Component, computed, HostListener, inject } from '@angular/core';
import { type BoundingBox, type Point } from 'svg-engine/core';
import { screenToDoc, ViewportService } from 'svg-engine/render';

import { capturePointer, releasePointer } from '../pointer';
import { ImportPlacementService } from './import-placement.service';

/**
 * **D-107** — `<svg:g svgeImportPlacementOverlay>` — the interactive
 * placement surface for `File ▸ Import ▸ SVG` in *place* mode (Illustrator's
 * *Place*).
 *
 * **Self-capturing**: when a placement is pending
 * ({@link ImportPlacementService.pending}) it renders a transparent
 * full-viewport `<rect>` with `pointer-events: all` (a crosshair cursor)
 * that captures its OWN pointer drag — so it never touches the central
 * selection/marquee directive ([svgeShellInteractions]); when nothing is
 * pending it renders no DOM at all (zero footprint). The dashed band shows
 * the drawn rectangle; `Esc` cancels.
 *
 * Project it FRONT-most inside an `<svge-renderer>` (after content + other
 * overlays) so the capture surface sits on top during placement:
 *
 * ```html
 * <svg:g svgeImportPlacementOverlay></svg:g>
 * ```
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeImportPlacementOverlay]',
  standalone: true,
  host: { 'aria-hidden': 'true' },
  template: `
    @if (pending()) {
      <svg:rect
        class="ip-capture"
        [attr.x]="capture().x"
        [attr.y]="capture().y"
        [attr.width]="capture().width"
        [attr.height]="capture().height"
        (pointerdown)="onDown($event)"
        (pointermove)="onMove($event)"
        (pointerup)="onUp($event)"
      />
      @if (rect(); as r) {
        <svg:rect
          class="ip-band"
          [attr.x]="r.x"
          [attr.y]="r.y"
          [attr.width]="r.width"
          [attr.height]="r.height"
        />
      }
    }
  `,
  styles: `
    .ip-capture {
      fill: transparent;
      pointer-events: all;
      cursor: crosshair;
    }
    .ip-band {
      fill: color-mix(in srgb, #1976d2 8%, transparent);
      stroke: #1976d2;
      stroke-width: 1;
      stroke-dasharray: 4 3;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeImportPlacementOverlay {
  private readonly placement = inject(ImportPlacementService);
  private readonly viewport = inject(ViewportService);

  protected readonly pending = this.placement.pending;
  protected readonly rect = this.placement.rect;
  /** Capture surface covers the currently-visible viewport (doc coords). */
  protected readonly capture = computed<BoundingBox>(() => this.viewport.viewBox());

  protected onDown(e: PointerEvent): void {
    const p = this.toDoc(e);
    if (p === null) return;
    e.preventDefault();
    e.stopPropagation();
    capturePointer(e);
    this.placement.beginDrag(p);
  }

  protected onMove(e: PointerEvent): void {
    const p = this.toDoc(e);
    if (p === null) return;
    this.placement.updateDrag(p);
  }

  protected onUp(e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    releasePointer(e);
    this.placement.commitDrag();
  }

  /** Esc aborts an in-progress placement (matches the canvas Esc convention). */
  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.placement.isActive) this.placement.cancel();
  }

  private toDoc(e: PointerEvent): Point | null {
    const svg = (e.target as SVGElement).ownerSVGElement;
    return screenToDoc(svg, e.clientX, e.clientY);
  }
}
