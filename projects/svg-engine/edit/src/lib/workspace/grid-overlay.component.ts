import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { getPageViewBox } from '@mosaicoo/svg-engine/core';
import { ViewportService } from '@mosaicoo/svg-engine/render';
import { ActivePageService } from '../pages/active-page.service';
import { PageDragService } from '../pages/page-drag.service';
import { type PageRect, resolvePageBounds, WorkspaceService } from './workspace.service';

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
  // Decorative reference grid — pointer-events: none + no interaction.
  // Hidden from accessibility tree so SR users don't hear hundreds of
  // unnamed "graphic" elements when zooming over a dense grid.
  //
  // ⚠ Z-order: consumers MUST write `<svg:g svgeGridOverlay
  // svgeBehind>` literally so SvgeRenderer projects it under content.
  // Host bindings don't affect Angular's compile-time projection slot
  // resolution — see `docs/internal/08-historico-de-alteracoes.md` and the
  // sibling PageOverlay for the same caveat.
  host: { 'aria-hidden': 'true' },
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
      /*
       * Grid lines are axis-aligned 1px hairlines. At fractional zoom (e.g.
       * 201%) anti-aliased hairlines land on sub-pixel boundaries and fade
       * out in periodic bands (both axes). crispEdges snaps them to the
       * device-pixel grid so every line renders as a solid pixel — no
       * vanishing bands. Safe here precisely because the lines are H/V only.
       */
      shape-rendering: crispEdges;
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
  // **Grid-anchor fix** — the grid must anchor to the SAME page rectangle as
  // the page paper (PageOverlay). Both injected optionally so the overlay still
  // works in a headless / pre-D-079 harness (falls back to WorkspaceService).
  private readonly activePage = inject(ActivePageService, { optional: true });
  private readonly pageDrag = inject(PageDragService, { optional: true });

  protected readonly visible = computed(() => this.ws.grid().enabled);

  /** Color binding — read once per render so all lines share it. */
  protected readonly lineColor = computed(() => this.ws.grid().color);

  /**
   * The page rectangle the grid anchors to — resolved via the SAME precedence
   * as the page paper ({@link resolvePageBounds}): live Page-tool (Shift+O)
   * drag preview → the active D-079 page's current viewBox → legacy
   * `WorkspaceService.page()`. This is the fix for the grid staying glued to
   * the legacy origin while the page rect followed the active page, and it
   * makes the grid **adapt to page resizes** (the page can change dimensions
   * via the Page tool). Returns `null` when no positive bounds exist.
   */
  protected readonly pageBounds = computed<PageRect | null>(() => {
    const active = this.activePage?.activePage() ?? null;
    const activeViewBox = active !== null ? getPageViewBox(active) : null;
    const dragPreview = active !== null ? (this.pageDrag?.previewFor(active.id) ?? null) : null;
    return resolvePageBounds(
      activeViewBox,
      dragPreview,
      this.ws.page(),
      this.viewport.contentBox(),
    );
  });

  /**
   * The `<line>` records to render — the **entire page** grid, in document
   * coordinates. **Not** windowed to the viewport: the grid is generated once
   * per page/grid change and the renderer's SVG `viewBox` transforms + clips it
   * for free, so the grid is **uniform across the whole page at any zoom/pan**
   * (the previous viewport-windowing left visible gaps/bands at high zoom and
   * regenerated on every pan). Lines span edge-to-edge of the page.
   *
   * Depends only on `grid` + `pageBounds()` (NOT `viewBox()`), so panning/
   * zooming never regenerates the DOM — the SVG transform handles it.
   */
  protected readonly lines = computed<GridLine[]>(() => {
    const grid = this.ws.grid();
    if (!grid.enabled) return [];
    const pb = this.pageBounds();
    if (pb === null) return [];
    return buildGridLines(pb, grid.spacing, grid.majorEvery);
  });
}

/** One grid `<line>` in document coordinates. */
export interface GridLine {
  readonly key: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly major: boolean;
}

/**
 * Generate the FULL-page grid (doc coordinates): every column
 * `0..⌈width/spacing⌉` and row `0..⌈height/spacing⌉`, each line spanning the
 * page edge-to-edge. Covers the **whole page regardless of zoom/pan** — the SVG
 * `viewBox` transforms and clips offscreen lines for free, so there's no
 * viewport windowing that could leave visible gaps. `key`s are page-relative
 * (stable across pan) so Angular's `@for` track reuses DOM nodes.
 *
 * Returns `[]` for non-positive spacing/page, or when the line count would be
 * pathological (e.g. spacing 1 on a 10000px page) — better no grid than a
 * frozen tab. Realistic grids are far below the cap.
 */
export function buildGridLines(
  pb: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  spacing: number,
  majorEvery: number,
): GridLine[] {
  if (spacing <= 0 || pb.width <= 0 || pb.height <= 0) return [];
  const cols = Math.round(pb.width / spacing);
  const rows = Math.round(pb.height / spacing);
  if (cols + rows > 8000) return []; // pathological-grid guard
  const safeMajor = majorEvery > 0 ? majorEvery : 1;
  const left = pb.x;
  const top = pb.y;
  const right = pb.x + pb.width;
  const bottom = pb.y + pb.height;
  const out: GridLine[] = [];
  for (let col = 0; col <= cols; col++) {
    const x = left + col * spacing;
    out.push({ key: `v${col}`, x1: x, y1: top, x2: x, y2: bottom, major: col % safeMajor === 0 });
  }
  for (let row = 0; row <= rows; row++) {
    const y = top + row * spacing;
    out.push({ key: `h${row}`, x1: left, y1: y, x2: right, y2: y, major: row % safeMajor === 0 });
  }
  return out;
}
