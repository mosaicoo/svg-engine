import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ViewportService } from 'svg-engine/render';
import { pageBoundsIn, WorkspaceService } from './workspace.service';

/**
 * SVG overlay that draws the editor grid (Bloco 4f) — vertical +
 * horizontal lines spaced per `WorkspaceService.grid().spacing`, with
 * every `majorEvery`-th line drawn slightly stronger. Lives inside
 * the renderer's `<ng-content/>` slot so it shares the SVG user
 * coordinate system with the document — no transform math needed.
 *
 * **Reactive sizing**: lines are generated to cover the current
 * `ViewportService.viewBox()` so panning/zooming reveals fresh grid
 * without re-creating the component. The computed re-runs only when
 * `viewBox`, `grid.enabled`, `grid.spacing`, or `grid.majorEvery`
 * change.
 *
 * **Non-scaling stroke** via `vector-effect`: keeps lines hair-thin
 * across zoom levels (otherwise they'd visually thicken as the user
 * zooms in).
 *
 * **No interaction**: `pointer-events: none` ensures the grid never
 * intercepts clicks intended for shapes / handles.
 *
 * Usage:
 * ```html
 * <svge-renderer [tree]="tree" [viewBox]="viewBox">
 *   <svg:g svgeGridOverlay></svg:g>
 *   <svg:g svgeSelectionOverlay></svg:g>
 * </svge-renderer>
 * ```
 * The order matters: grid below selection so handles render on top.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeGridOverlay]',
  standalone: true,
  template: `
    @if (visible()) {
      @for (line of lines(); track line.key) {
        <svg:line
          [class.major]="line.major"
          class="grid-line"
          [attr.x1]="line.x1"
          [attr.y1]="line.y1"
          [attr.x2]="line.x2"
          [attr.y2]="line.y2"
          [attr.stroke]="lineColor()"
        />
      }
    }
  `,
  styles: `
    .grid-line {
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
      opacity: 0.35;
    }
    .grid-line.major {
      opacity: 0.65;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GridOverlay {
  private readonly ws = inject(WorkspaceService);
  private readonly viewport = inject(ViewportService);

  protected readonly visible = computed(() => this.ws.grid().enabled);

  /** Color binding — read once per render so all lines share it. */
  protected readonly lineColor = computed(() => this.ws.grid().color);

  /**
   * The set of `<line>` records to render. Lines are constrained to the
   * **intersection of viewport and page bounds** — grid serves as an
   * alignment aid for content INSIDE the page, so showing it across
   * the pasteboard creates visual noise. When the intersection is empty
   * (page is entirely outside viewport, e.g., panned far away), no
   * lines render.
   *
   * `key` is stable across pan so Angular's `@for` track avoids
   * re-creating DOM nodes when scrolling.
   */
  protected readonly lines = computed(() => {
    const grid = this.ws.grid();
    if (!grid.enabled) return [];
    const vb = this.viewport.viewBox();
    const page = this.ws.page();
    if (page.width <= 0 || page.height <= 0) return [];
    // Page bounds in document space — centered inside contentBox via
    // the shared helper. Grid lines anchor at the page's origin so
    // they stay aligned with the page wherever it sits in the canvas.
    const pb = pageBoundsIn(this.viewport.contentBox(), page);
    const pageLeft = pb.x;
    const pageTop = pb.y;
    const pageRight = pb.x + pb.width;
    const pageBottom = pb.y + pb.height;
    // Intersection of viewport and page rectangles. If they don't
    // overlap, the grid simply isn't visible.
    const ix1 = Math.max(vb.x, pageLeft);
    const iy1 = Math.max(vb.y, pageTop);
    const ix2 = Math.min(vb.x + vb.width, pageRight);
    const iy2 = Math.min(vb.y + vb.height, pageBottom);
    if (ix2 <= ix1 || iy2 <= iy1) return [];

    const out: {
      key: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      major: boolean;
    }[] = [];
    const { spacing, majorEvery } = grid;
    // Grid lines are anchored at the page origin (pageLeft, pageTop) and
    // step `spacing` doc-units along each axis. Iterate by column/row
    // INDEX so the line at index 0 lands exactly on the page corner,
    // not at world origin. This is the key change from the previous
    // version which had lines on the absolute coord grid (0, 20, 40...)
    // — meaning a page positioned at (100, 80) had its first grid line
    // 100 px shifted from its own corner.
    const colStartIdx = Math.max(0, Math.floor((ix1 - pageLeft) / spacing));
    const colEndIdx = Math.ceil((ix2 - pageLeft) / spacing);
    const rowStartIdx = Math.max(0, Math.floor((iy1 - pageTop) / spacing));
    const rowEndIdx = Math.ceil((iy2 - pageTop) / spacing);
    for (let col = colStartIdx; col <= colEndIdx; col++) {
      const x = pageLeft + col * spacing;
      if (x > pageRight) break;
      out.push({
        key: `v${col}`,
        x1: x,
        y1: iy1,
        x2: x,
        y2: iy2,
        major: col % majorEvery === 0,
      });
    }
    for (let row = rowStartIdx; row <= rowEndIdx; row++) {
      const y = pageTop + row * spacing;
      if (y > pageBottom) break;
      out.push({
        key: `h${row}`,
        x1: ix1,
        y1: y,
        x2: ix2,
        y2: y,
        major: row % majorEvery === 0,
      });
    }
    return out;
  });
}
