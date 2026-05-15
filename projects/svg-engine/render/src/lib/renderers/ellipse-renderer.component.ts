import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { EllipseNode } from 'svg-engine/core';
import { renderTransformAttr } from '../util/transform-attr';

@Component({
  selector: 'svge-ellipse',
  standalone: true,
  template: `
    <svg:g [attr.data-node-id]="node().id" [attr.transform]="transformAttr()">
      <svg:ellipse
        [attr.cx]="node().cx"
        [attr.cy]="node().cy"
        [attr.rx]="node().rx"
        [attr.ry]="node().ry"
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
export class SvgeEllipseRenderer {
  readonly node = input.required<EllipseNode>();
  protected readonly transformAttr = computed(() => renderTransformAttr(this.node().transform));
}
