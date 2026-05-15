import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PathNode } from 'svg-engine/core';
import { renderTransformAttr } from '../util/transform-attr';

@Component({
  selector: 'svge-path',
  standalone: true,
  template: `
    <svg:g [attr.data-node-id]="node().id" [attr.transform]="transformAttr()">
      <svg:path
        [attr.d]="node().d"
        [attr.fill]="node().style.fill ?? null"
        [attr.stroke]="node().style.stroke ?? null"
        [attr.stroke-width]="node().style.strokeWidth ?? null"
        [attr.stroke-linecap]="node().style.strokeLinecap ?? null"
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
export class SvgePathRenderer {
  readonly node = input.required<PathNode>();
  protected readonly transformAttr = computed(() => renderTransformAttr(this.node().transform));
}
