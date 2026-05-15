import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PolylineNode } from 'svg-engine/core';
import { renderTransformAttr } from '../util/transform-attr';

@Component({
  selector: 'svge-polyline',
  standalone: true,
  template: `
    <svg:g [attr.data-node-id]="node().id" [attr.transform]="transformAttr()">
      <svg:polyline
        [attr.points]="pointsAttr()"
        [attr.fill]="node().style.fill ?? 'none'"
        [attr.stroke]="node().style.stroke ?? null"
        [attr.stroke-width]="node().style.strokeWidth ?? null"
        [attr.stroke-linecap]="node().style.strokeLinecap ?? null"
        [attr.stroke-linejoin]="node().style.strokeLinejoin ?? null"
        [attr.opacity]="node().style.opacity ?? null"
        [attr.stroke-opacity]="node().style.strokeOpacity ?? null"
        [attr.visibility]="node().style.visibility ?? null"
      />
    </svg:g>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgePolylineRenderer {
  readonly node = input.required<PolylineNode>();
  protected readonly transformAttr = computed(() => renderTransformAttr(this.node().transform));
  protected readonly pointsAttr = computed(() =>
    this.node()
      .points.map((p) => `${p.x},${p.y}`)
      .join(' '),
  );
}
