import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ImageNode } from 'svg-engine/core';
import { renderTransformAttr } from '../util/transform-attr';

@Component({
  selector: 'svge-image',
  standalone: true,
  template: `
    <svg:g [attr.data-node-id]="node().id" [attr.transform]="transformAttr()">
      <svg:image
        [attr.x]="node().x"
        [attr.y]="node().y"
        [attr.width]="node().width"
        [attr.height]="node().height"
        [attr.href]="node().href"
        [attr.preserveAspectRatio]="node().preserveAspectRatio ?? null"
        [attr.opacity]="node().style.opacity ?? null"
        [attr.visibility]="node().style.visibility ?? null"
      />
    </svg:g>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeImageRenderer {
  readonly node = input.required<ImageNode>();
  protected readonly transformAttr = computed(() => renderTransformAttr(this.node().transform));
}
