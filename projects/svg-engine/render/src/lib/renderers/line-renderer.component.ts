import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { LineNode } from 'svg-engine/core';
import { renderTransformAttr } from '../util/transform-attr';

@Component({
  selector: 'svge-line',
  standalone: true,
  template: `
    <svg:g [attr.data-node-id]="node().id" [attr.transform]="transformAttr()">
      <svg:line
        [attr.x1]="node().x1"
        [attr.y1]="node().y1"
        [attr.x2]="node().x2"
        [attr.y2]="node().y2"
        [attr.stroke]="node().style.stroke ?? null"
        [attr.stroke-width]="node().style.strokeWidth ?? null"
        [attr.stroke-linecap]="node().style.strokeLinecap ?? null"
        [attr.opacity]="node().style.opacity ?? null"
        [attr.stroke-opacity]="node().style.strokeOpacity ?? null"
        [attr.visibility]="node().style.visibility ?? null"
      />
    </svg:g>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeLineRenderer {
  readonly node = input.required<LineNode>();
  protected readonly transformAttr = computed(() => renderTransformAttr(this.node().transform));
}
