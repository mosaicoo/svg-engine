import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { TextNode } from 'svg-engine/core';
import { renderTransformAttr } from '../util/transform-attr';

@Component({
  selector: 'svge-text',
  standalone: true,
  template: `
    <svg:g [attr.data-node-id]="node().id" [attr.transform]="transformAttr()">
      <svg:text
        [attr.x]="node().x"
        [attr.y]="node().y"
        [attr.font-size]="node().fontSize ?? null"
        [attr.font-family]="node().fontFamily ?? null"
        [attr.font-weight]="node().fontWeight ?? null"
        [attr.text-anchor]="node().textAnchor ?? null"
        [attr.fill]="node().style.fill ?? null"
        [attr.stroke]="node().style.stroke ?? null"
        [attr.stroke-width]="node().style.strokeWidth ?? null"
        [attr.opacity]="node().style.opacity ?? null"
        [attr.visibility]="node().style.visibility ?? null"
      >
        {{ node().content }}
      </svg:text>
    </svg:g>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeTextRenderer {
  readonly node = input.required<TextNode>();
  protected readonly transformAttr = computed(() => renderTransformAttr(this.node().transform));
}
