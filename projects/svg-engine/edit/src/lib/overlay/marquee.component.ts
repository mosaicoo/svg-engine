import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MarqueeService } from '../marquee/marquee.service';

/**
 * Visual marquee rectangle (Bloco 4a). Renders a dashed selection box
 * that follows the live `MarqueeService.rect()` signal — no input, no
 * output, no DOM events of its own. Pointer-handling lives in the
 * consumer (the playground / host application) so consumers can choose
 * between marquee-on-background, marquee-on-modifier, etc.
 *
 * Renders **inside the same `<svg>`** as the document via the renderer's
 * `<ng-content />` slot, so it shares viewBox + coordinate system.
 *
 * Pointer-events disabled (the rect is purely visual; the consumer's
 * pointermove on the canvas drives the gesture).
 *
 * Usage:
 * ```html
 * <svge-renderer [tree]="tree" [viewBox]="viewBox">
 *   <svg:g svgeMarquee></svg:g>
 * </svge-renderer>
 * ```
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeMarquee]',
  standalone: true,
  // Decorative SVG layer — pointer-events disabled, no semantic info
  // for assistive tech (the act of marquee-selecting is announced via
  // the resulting selection change in the SelectionService). Hide the
  // host group from the accessibility tree so SR users don't hear
  // "graphic" noise during drag.
  host: { 'aria-hidden': 'true' },
  template: `
    @if (rect(); as r) {
      <svg:rect
        class="marquee"
        [attr.x]="r.x"
        [attr.y]="r.y"
        [attr.width]="r.width"
        [attr.height]="r.height"
      ></svg:rect>
    }
  `,
  styles: `
    .marquee {
      fill: rgba(25, 118, 210, 0.08);
      stroke: #1976d2;
      stroke-width: 1;
      stroke-dasharray: 4 2;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Marquee {
  protected readonly rect = inject(MarqueeService).rect;
}
