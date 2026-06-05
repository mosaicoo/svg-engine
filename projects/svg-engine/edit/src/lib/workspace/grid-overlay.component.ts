import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { getPageViewBox } from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';
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
  // resolution — see `docs/08-historico-de-alteracoes.md` and the
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
    // Page bounds via the SHARED resolver (same source as the page paper):
    // the grid follows the active page's viewBox / live resize, instead of the
    // legacy origin-anchored WorkspaceService.page() it used to read (the bug
    // where the grid didn't track the page). Null → no positive page bounds →
    // no grid.
    const pb = this.pageBounds();
    if (pb === null) return [];
    const pageLeft = pb.x;
    const pageTop = pb.y;
    const pageRight = pb.x + pb.width;
    const pageBottom = pb.y + pb.height;
    // Intersection of viewport and page — used ONLY to decide WHICH
    // grid columns/rows to generate (perf: skip lines completely
    // outside the visible area). The line endpoints themselves use
    // the FULL page bounds so the line visually spans the page from
    // edge to edge regardless of pan/zoom. The previous version used
    // intersection bounds for endpoints, which made each line shrink
    // to match the visible viewport — they appeared "anchored" to
    // the viewport edges when panning, instead of moving with the
    // page as expected. (Fase 6 UX polish — bug reported via
    // screenshot of pan animation.)
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
    // Compute integer column/row count for the FULL page so the
    // rightmost/bottommost line at the exact page edge is always
    // included regardless of viewport pan. Then clip the iteration
    // window by the viewport intersection — but using the page-derived
    // max as the inclusive upper bound, never the viewport derived
    // value (otherwise floating-point drift at the lateral edge can
    // drop the boundary line, causing a visible "missing line" gap
    // on the right/bottom edges of the page during pan).
    const pageColMax = Math.round(pb.width / spacing);
    const pageRowMax = Math.round(pb.height / spacing);
    // Epsilon comparison so a column that lands within 1e-6 of pageRight
    // (i.e., logically AT the page edge) is treated as inside, not
    // beyond. Same reasoning for rows. Without this guard, FP drift
    // accumulated over ~50+ multiplications can make x === pageRight
    // resolve as x > pageRight.
    const EDGE_EPS = 1e-6;
    const colStartIdx = Math.max(0, Math.floor((ix1 - pageLeft) / spacing));
    const colEndIdx = Math.min(pageColMax, Math.ceil((ix2 - pageLeft) / spacing));
    const rowStartIdx = Math.max(0, Math.floor((iy1 - pageTop) / spacing));
    const rowEndIdx = Math.min(pageRowMax, Math.ceil((iy2 - pageTop) / spacing));
    for (let col = colStartIdx; col <= colEndIdx; col++) {
      const x = pageLeft + col * spacing;
      if (x - pageRight > EDGE_EPS) break;
      out.push({
        key: `v${col}`,
        x1: x,
        // Line spans the FULL page height in doc coords. SVG viewBox
        // clipping handles the offscreen portion for free — no perf
        // cost from "drawing past the edge" because the browser only
        // rasterizes visible pixels.
        y1: pageTop,
        x2: x,
        y2: pageBottom,
        major: col % majorEvery === 0,
      });
    }
    for (let row = rowStartIdx; row <= rowEndIdx; row++) {
      const y = pageTop + row * spacing;
      if (y - pageBottom > EDGE_EPS) break;
      out.push({
        key: `h${row}`,
        // Horizontal lines span the FULL page width (same reasoning).
        x1: pageLeft,
        y1: y,
        x2: pageRight,
        y2: y,
        major: row % majorEvery === 0,
      });
    }
    return out;
  });
}
