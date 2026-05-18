import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WorkspaceService } from './workspace.service';

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
  template: `
    @if (effectivePage(); as p) {
      <!--
        Outer page rectangle — the visible "paper" of the canvas. Subtle
        drop shadow via SVG filter would require <defs> coordination;
        kept simple with a plain outline + faint fill so consumers can
        style further via CSS variables on host.
      -->
      <svg:rect
        class="page-rect"
        [attr.x]="0"
        [attr.y]="0"
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

  /**
   * Effective page dimensions after orientation swap. `portrait` swaps
   * width/height so the displayed rect always matches the user's
   * intuition (portrait = tall, landscape = wide).
   */
  protected readonly effectivePage = computed<{ width: number; height: number } | null>(() => {
    const p = this.ws.page();
    if (p.width <= 0 || p.height <= 0) return null;
    if (p.orientation === 'portrait') {
      // Swap only when the supplied dims are landscape-oriented (w > h).
      // If user typed taller-than-wide AND chose 'portrait', already correct.
      return p.width > p.height
        ? { width: p.height, height: p.width }
        : { width: p.width, height: p.height };
    }
    // 'landscape': inverse condition.
    return p.height > p.width
      ? { width: p.height, height: p.width }
      : { width: p.width, height: p.height };
  });

  /**
   * Inner safe-area rect dimensions, OR null when all margins are zero
   * (skip rendering the dashed inset rect entirely).
   */
  protected readonly marginsRect = computed<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(() => {
    const m = this.ws.page().margins;
    const effective = this.effectivePage();
    if (effective === null) return null;
    if (m.top === 0 && m.right === 0 && m.bottom === 0 && m.left === 0) return null;
    const width = effective.width - m.left - m.right;
    const height = effective.height - m.top - m.bottom;
    if (width <= 0 || height <= 0) return null;
    return { x: m.left, y: m.top, width, height };
  });
}
