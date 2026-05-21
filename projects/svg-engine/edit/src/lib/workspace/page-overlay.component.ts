import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ViewportService } from 'svg-engine/render';
import { pageBoundsIn, WorkspaceService } from './workspace.service';

/**
 * SVG overlay that draws a visible **page marker** (the printable area)
 * inside the canvas — fixes the débito where `WorkspaceService.page()`
 * was orphaned state nobody rendered.
 *
 * **Design (Illustrator/Affinity parity)**: the page is a presentation
 * concept distinct from `document.viewBox`. A consumer might author a
 * doc whose viewBox spans 800×600 of "pasteboard" but whose target
 * output ("page") is 400×400 centered. The marker shows where that
 * page is so the user knows what'll be exported.
 *
 * **Where it renders**: as a centered-or-positioned `<svg:rect>` at
 * page origin (0,0) with width/height from `workspace.page()`. Order
 * decided by orientation: when `'portrait'`, page is `height × width`
 * (swap). When `'landscape'`, page is `width × height`.
 *
 * **Margins**: when any margin is > 0, an inner dashed rect outlines
 * the safe area (`x = left`, `y = top`, `width = pageW - left - right`,
 * etc.). Cosmetic only — doesn't affect rendering or export.
 *
 * **Non-interactive**: `pointer-events: none` so clicks pass through
 * to the actual content. The page marker is informational.
 *
 * **Opt-in**: like grid/guides/snap overlays, attach via attribute
 * selector projected into `<svge-renderer>`'s `<ng-content>`:
 *
 * ```html
 * <svge-renderer [tree]="tree()" [viewBox]="viewBox()">
 *   <svg:g svgePageOverlay></svg:g>
 *   <svg:g svgeGridOverlay></svg:g>
 *   <svg:g svgeSelectionOverlay></svg:g>
 * </svge-renderer>
 * ```
 *
 * Order convention: page-overlay BELOW grid (so the grid lines render
 * on top of the page outline), and grid BELOW selection.
 *
 * **Why it lives in `edit/lib/workspace/` not `render/`**: the page
 * is editor presentation state owned by `WorkspaceService`. `render`
 * stays headless / read-only.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgePageOverlay]',
  standalone: true,
  // Decorative page marker — pointer-events: none, purely visual
  // reference. Page dimensions are surfaced semantically via the
  // Inspector's page section (when implemented).
  //
  // ⚠ Z-order via content projection: the page rect carries a semi-
  // transparent white fill (the "paper"), so it MUST render UNDER the
  // document content. SvgeRenderer exposes a `<ng-content
  // select="[svgeBehind]">` slot for that. **Every consumer that
  // includes this overlay must write `<svg:g svgePageOverlay
  // svgeBehind>` literally** in their template — Angular content
  // projection is compile-time and only matches static template
  // attributes, NOT host bindings. We tried auto-tagging via
  // `host: { svgeBehind: '' }` and it doesn't work (the attribute
  // appears in the DOM but the projection slot was already decided).
  // See `docs/08-historico-de-alteracoes.md` for the bug history.
  host: { 'aria-hidden': 'true' },
  template: `
    @if (pageBounds(); as p) {
      <!--
        Outer page rectangle — the visible "paper" of the canvas.
        Anchored at the page's computed origin (centered inside the
        viewport contentBox via the pageBoundsIn helper). Grid and
        guides overlays use the same helper so they stay aligned to
        the same rectangle.
      -->
      <svg:rect
        class="page-rect"
        [attr.x]="p.x"
        [attr.y]="p.y"
        [attr.width]="p.width"
        [attr.height]="p.height"
      />
      @if (marginsRect(); as m) {
        <!--
          Inner safe-area rectangle (dashed) — only emitted when any
          margin > 0 so default zero-margin pages don't pay for an
          extra DOM node.
        -->
        <svg:rect
          class="margin-rect"
          [attr.x]="m.x"
          [attr.y]="m.y"
          [attr.width]="m.width"
          [attr.height]="m.height"
        />
      }
    }
  `,
  styles: `
    .page-rect {
      fill: var(--svge-page-fill, rgba(255, 255, 255, 0.5));
      stroke: var(--svge-page-stroke, #1976d2);
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    .margin-rect {
      fill: none;
      stroke: var(--svge-page-margin-stroke, #1976d2);
      stroke-width: 1;
      stroke-dasharray: 4 3;
      vector-effect: non-scaling-stroke;
      opacity: 0.6;
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageOverlay {
  private readonly ws = inject(WorkspaceService);
  private readonly viewport = inject(ViewportService);

  /**
   * Page rectangle (in document coordinates) centered inside the
   * viewport's contentBox via the shared {@link pageBoundsIn} helper.
   * Returns null when page has zero dims (defensive — patchPage
   * validation rejects that, but tests may stub).
   */
  protected readonly pageBounds = computed<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(() => {
    const page = this.ws.page();
    if (page.width <= 0 || page.height <= 0) return null;
    return pageBoundsIn(this.viewport.contentBox(), page);
  });

  /**
   * Inner safe-area rect dimensions, OR null when all margins are zero
   * (skip rendering the dashed inset rect entirely). Anchored to the
   * page's resolved origin so it slides with the centered page.
   */
  protected readonly marginsRect = computed<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(() => {
    const m = this.ws.page().margins;
    const bounds = this.pageBounds();
    if (bounds === null) return null;
    if (m.top === 0 && m.right === 0 && m.bottom === 0 && m.left === 0) return null;
    const width = bounds.width - m.left - m.right;
    const height = bounds.height - m.top - m.bottom;
    if (width <= 0 || height <= 0) return null;
    return { x: bounds.x + m.left, y: bounds.y + m.top, width, height };
  });
}
