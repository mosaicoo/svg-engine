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
   * The set of `<line>` records to render. Iterates from the lowest
   * grid index intersecting the viewBox's left/top edge up to the
   * one past its right/bottom. `key` is stable across pan so Angular's
   * `@for` track avoids re-creating DOM nodes when scrolling.
   */
  protected readonly lines = computed(() => {
    const grid = this.ws.grid();
    if (!grid.enabled) return [];
    const vb = this.viewport.viewBox();
    const out: {
      key: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      major: boolean;
    }[] = [];
    const { spacing, majorEvery } = grid;
    // Snap lowest grid index to the floor of viewBox / spacing so the
    // first line drawn is at-or-just-before the left/top edge.
    const startCol = Math.floor(vb.x / spacing);
    const endCol = Math.ceil((vb.x + vb.width) / spacing);
    const startRow = Math.floor(vb.y / spacing);
    const endRow = Math.ceil((vb.y + vb.height) / spacing);
    for (let col = startCol; col <= endCol; col++) {
      const x = col * spacing;
      out.push({
        key: `v${col}`,
        x1: x,
        y1: vb.y,
        x2: x,
        y2: vb.y + vb.height,
        major: col % majorEvery === 0,
      });
    }
    for (let row = startRow; row <= endRow; row++) {
      const y = row * spacing;
      out.push({
        key: `h${row}`,
        x1: vb.x,
        y1: y,
        x2: vb.x + vb.width,
        y2: y,
        major: row % majorEvery === 0,
      });
    }
    return out;
  });
}
