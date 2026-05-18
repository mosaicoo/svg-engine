import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ViewportService } from 'svg-engine/render';
import { WorkspaceService } from './workspace.service';

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
    // Page bounds in document space, starting at origin (matches
    // page-overlay which also anchors at 0,0). When page has zero
    // dims (shouldn't happen via patchPage validation, but defensive),
    // fall back to full viewBox.
    const pageW = page.width > 0 ? page.width : vb.width;
    const pageH = page.height > 0 ? page.height : vb.height;
    // Intersection of viewport and page rectangles. If they don't
    // overlap, the grid simply isn't visible.
    const ix1 = Math.max(vb.x, 0);
    const iy1 = Math.max(vb.y, 0);
    const ix2 = Math.min(vb.x + vb.width, pageW);
    const iy2 = Math.min(vb.y + vb.height, pageH);
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
    // Snap lowest grid index to the floor of intersection / spacing so
    // the first line drawn is at-or-just-after the page's left/top edge.
    // We clamp to >= 0 because pages start at origin — no grid line at
    // negative coords for now (origin = page corner).
    const startCol = Math.max(0, Math.floor(ix1 / spacing));
    const endCol = Math.ceil(ix2 / spacing);
    const startRow = Math.max(0, Math.floor(iy1 / spacing));
    const endRow = Math.ceil(iy2 / spacing);
    for (let col = startCol; col <= endCol; col++) {
      const x = col * spacing;
      if (x > pageW) break; // clip horizontally to page right edge
      out.push({
        key: `v${col}`,
        x1: x,
        y1: iy1,
        x2: x,
        y2: iy2,
        major: col % majorEvery === 0,
      });
    }
    for (let row = startRow; row <= endRow; row++) {
      const y = row * spacing;
      if (y > pageH) break; // clip vertically to page bottom edge
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
