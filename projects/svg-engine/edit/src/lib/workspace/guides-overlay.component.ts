import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ViewportService } from 'svg-engine/render';
import { WorkspaceService } from './workspace.service';

/**
 * SVG overlay that renders user-drawn guide lines (Bloco 4f). Each
 * guide is a single full-canvas stroked line — horizontal (constant y)
 * or vertical (constant x). Lives inside the renderer's `<ng-content/>`
 * slot so it shares the SVG user coordinate system with the document.
 *
 * **No interaction in v1**: guides are display-only. A future block
 * can add drag-to-move (pointerdown → `WorkspaceService.moveGuide`)
 * and Esc-cancel; for now management happens via the workspace API
 * (`addGuide` / `removeGuide` from a settings panel).
 *
 * **Non-scaling stroke**: keeps guides hair-thin regardless of zoom.
 * Distinctive cyan color so they don't blend with grid lines.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeGuidesOverlay]',
  standalone: true,
  template: `
    @for (g of guides(); track g.id) {
      @if (g.axis === 'h') {
        <svg:line
          class="guide horizontal"
          [attr.x1]="viewBoxLeft()"
          [attr.y1]="g.position"
          [attr.x2]="viewBoxRight()"
          [attr.y2]="g.position"
        />
      } @else {
        <svg:line
          class="guide vertical"
          [attr.x1]="g.position"
          [attr.y1]="viewBoxTop()"
          [attr.x2]="g.position"
          [attr.y2]="viewBoxBottom()"
        />
      }
    }
  `,
  styles: `
    .guide {
      stroke: #00bcd4;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuidesOverlay {
  private readonly ws = inject(WorkspaceService);
  private readonly viewport = inject(ViewportService);

  protected readonly guides = this.ws.guides;

  protected readonly viewBoxLeft = computed(() => this.viewport.viewBox().x);
  protected readonly viewBoxTop = computed(() => this.viewport.viewBox().y);
  protected readonly viewBoxRight = computed(() => {
    const vb = this.viewport.viewBox();
    return vb.x + vb.width;
  });
  protected readonly viewBoxBottom = computed(() => {
    const vb = this.viewport.viewBox();
    return vb.y + vb.height;
  });
}
