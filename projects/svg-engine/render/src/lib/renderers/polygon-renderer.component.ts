import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PolygonNode } from 'svg-engine/core';
import { renderTransformAttr } from '../util/transform-attr';

@Component({
  selector: 'svge-polygon',
  standalone: true,
  template: `
    <svg:g [attr.data-node-id]="node().id" [attr.transform]="transformAttr()">
      <svg:polygon
        [attr.points]="pointsAttr()"
        [attr.fill]="node().style.fill ?? null"
        [attr.stroke]="node().style.stroke ?? null"
        [attr.stroke-width]="node().style.strokeWidth ?? null"
        [attr.stroke-linejoin]="node().style.strokeLinejoin ?? null"
        [attr.opacity]="node().style.opacity ?? null"
        [attr.fill-opacity]="node().style.fillOpacity ?? null"
        [attr.stroke-opacity]="node().style.strokeOpacity ?? null"
        [attr.visibility]="node().style.visibility ?? null"
      />
    </svg:g>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgePolygonRenderer {
  readonly node = input.required<PolygonNode>();
  protected readonly transformAttr = computed(() => renderTransformAttr(this.node().transform));
  protected readonly pointsAttr = computed(() =>
    this.node()
      .points.map((p) => `${p.x},${p.y}`)
      .join(' '),
  );
}
