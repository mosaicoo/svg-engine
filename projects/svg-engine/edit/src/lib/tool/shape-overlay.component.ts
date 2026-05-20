import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { boundsOfDraft, DEFAULT_POLYGON_SIDES, regularPolygonPoints } from './shape-tool.service';
import { ShapeToolService } from './shape-tool.service';

/**
 * Visual preview for the {@link ShapeTool} family — renders the shape
 * being drawn (rect/ellipse/polygon) as a dashed primary outline so
 * the user can see what they're going to commit before releasing.
 *
 * **Render gating**: only renders when `ShapeToolService.isDrafting()`
 * is true. Hidden otherwise — overlay clutter only appears during the
 * gesture itself.
 *
 * **Style**: dashed primary blue stroke, no fill. Matches the
 * convention used by other "creation in progress" overlays (Pen tool
 * rubber band, Marquee). Stroke is `non-scaling-stroke` so it stays
 * hair-thin at any zoom.
 *
 * **Pointer-events disabled**: the overlay is decorative; the actual
 * pointer routing lives in the active tool, dispatched via the
 * playground canvas pointer handlers.
 *
 * Usage (inside an `<svge-renderer>`):
 * ```html
 * <svg:g svgeShapeOverlay></svg:g>
 * ```
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeShapeOverlay]',
  standalone: true,
  // Decorative — pointer-events disabled, no semantic value to SR
  // (the resulting node insertion is communicated via the EditorState
  // change).
  host: { 'aria-hidden': 'true' },
  template: `
    @if (visible(); as v) {
      @switch (v.kind) {
        @case ('rect') {
          <svg:rect
            class="shape-draft"
            [attr.x]="v.bounds.x"
            [attr.y]="v.bounds.y"
            [attr.width]="v.bounds.w"
            [attr.height]="v.bounds.h"
          />
        }
        @case ('ellipse') {
          <svg:ellipse
            class="shape-draft"
            [attr.cx]="v.bounds.x + v.bounds.w / 2"
            [attr.cy]="v.bounds.y + v.bounds.h / 2"
            [attr.rx]="v.bounds.w / 2"
            [attr.ry]="v.bounds.h / 2"
          />
        }
        @case ('polygon') {
          <svg:polygon class="shape-draft" [attr.points]="v.pointsAttr" />
        }
      }
    }
  `,
  styles: `
    .shape-draft {
      fill: none;
      stroke: #1976d2;
      stroke-width: 1;
      stroke-dasharray: 4 3;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
      opacity: 0.8;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShapeOverlay {
  private readonly shapes = inject(ShapeToolService);

  /**
   * Pre-computed render data for the template — kind + bounds (rect/
   * ellipse use `bounds.{x,y,w,h}` directly) + pre-serialised polygon
   * points (so the template doesn't have to call a function in the
   * binding, which would re-run on every CD).
   *
   * Returns `null` when there's no draft — the `@if (visible(); as v)`
   * gate hides the entire overlay.
   */
  protected readonly visible = computed<{
    kind: import('./shape-tool.service').ShapeKind;
    bounds: { x: number; y: number; w: number; h: number };
    pointsAttr: string;
  } | null>(() => {
    const draft = this.shapes.draft();
    if (draft === null) return null;
    const bounds = boundsOfDraft(draft);
    let pointsAttr = '';
    if (draft.kind === 'polygon') {
      const pts = regularPolygonPoints(bounds, DEFAULT_POLYGON_SIDES);
      pointsAttr = pts.map((p) => `${p.x},${p.y}`).join(' ');
    }
    return { kind: draft.kind, bounds, pointsAttr };
  });
}
