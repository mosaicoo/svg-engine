import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EditorStateService } from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';
import type { SnapGuide } from '../snap/snap-resolver';
import { SnapService } from '../snap/snap.service';

/**
 * Visual snap guides (Bloco 4b). Renders the lines that the
 * {@link SnapService} marked as active during the current gesture.
 *
 * Each guide is a single thin line spanning the visible viewport on the
 * opposite axis (vertical for `axis: 'x'`, horizontal for `axis: 'y'`),
 * coloured magenta regardless of source (grid or object) — the colour
 * convention is "magenta = snap is active" so the user learns the
 * single signal rather than having to discriminate sources mid-drag.
 *
 * Pointer-events disabled: this is purely decorative.
 *
 * Usage (inside a `<svge-renderer>`):
 * ```html
 * <svg:g svgeSnapGuides></svg:g>
 * ```
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeSnapGuides]',
  standalone: true,
  // Decorative-only feedback during a drag gesture (snap alignment
  // lines). Hidden from accessibility tree — the resulting snapped
  // position is communicated via the drag itself.
  host: { 'aria-hidden': 'true' },
  template: `
    @for (g of lines(); track $index) {
      @if (g.axis === 'x') {
        <svg:line
          class="guide"
          [class.grid]="g.source === 'grid'"
          [class.object]="g.source === 'object'"
          [attr.x1]="g.value"
          [attr.y1]="span().y"
          [attr.x2]="g.value"
          [attr.y2]="span().y + span().height"
        ></svg:line>
      } @else {
        <svg:line
          class="guide"
          [class.grid]="g.source === 'grid'"
          [class.object]="g.source === 'object'"
          [attr.x1]="span().x"
          [attr.y1]="g.value"
          [attr.x2]="span().x + span().width"
          [attr.y2]="g.value"
        ></svg:line>
      }
    }
  `,
  styles: `
    .guide {
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    .guide.grid {
      stroke: #d81b60;
      stroke-dasharray: 2 2;
    }
    .guide.object {
      stroke: #d81b60;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SnapGuides {
  private readonly snap = inject(SnapService);
  private readonly viewport = inject(ViewportService);
  private readonly state = inject(EditorStateService);

  protected readonly lines = computed<readonly SnapGuide[]>(() => this.snap.activeGuides());

  /**
   * Span of the guides — covers the union of the document's viewBox and
   * the viewport's viewBox so a guide stays visible even when the user
   * has panned/zoomed away from the document origin.
   */
  protected readonly span = computed(() => {
    const v = this.viewport.viewBox();
    const doc = this.state.document().viewBox;
    const minX = Math.min(v.x, doc.x);
    const minY = Math.min(v.y, doc.y);
    const maxX = Math.max(v.x + v.width, doc.x + doc.width);
    const maxY = Math.max(v.y + v.height, doc.y + doc.height);
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  });
}
