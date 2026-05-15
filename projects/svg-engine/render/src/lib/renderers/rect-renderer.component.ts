import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { RectNode } from 'svg-engine/core';
import { renderTransformAttr } from '../util/transform-attr';

/**
 * SVG `<rect>` renderer. Wraps the rect in a `<g>` so the node `transform`
 * applies to the whole shape (including any future decorations / handles
 * mounted by sibling layers).
 */
@Component({
  selector: 'svge-rect',
  standalone: true,
  template: `
    <svg:g [attr.data-node-id]="node().id" [attr.transform]="transformAttr()">
      <svg:rect
        [attr.x]="node().x"
        [attr.y]="node().y"
        [attr.width]="node().width"
        [attr.height]="node().height"
        [attr.rx]="node().rx ?? null"
        [attr.ry]="node().ry ?? null"
        [attr.fill]="node().style.fill ?? null"
        [attr.stroke]="node().style.stroke ?? null"
        [attr.stroke-width]="node().style.strokeWidth ?? null"
        [attr.opacity]="node().style.opacity ?? null"
        [attr.fill-opacity]="node().style.fillOpacity ?? null"
        [attr.stroke-opacity]="node().style.strokeOpacity ?? null"
        [attr.visibility]="node().style.visibility ?? null"
      />
    </svg:g>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeRectRenderer {
  readonly node = input.required<RectNode>();
  protected readonly transformAttr = computed(() => renderTransformAttr(this.node().transform));
}
