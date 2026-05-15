import { Directive, input } from '@angular/core';
import type { LineNode } from 'svg-engine/core';

/** Apply to `<svg:line>` to bind attributes from a {@link LineNode}. */
@Directive({
  selector: '[svgeLine]',
  standalone: true,
  host: {
    '[attr.x1]': 'node().x1',
    '[attr.y1]': 'node().y1',
    '[attr.x2]': 'node().x2',
    '[attr.y2]': 'node().y2',
    '[attr.stroke]': 'node().style.stroke ?? null',
    '[attr.stroke-width]': 'node().style.strokeWidth ?? null',
    '[attr.stroke-linecap]': 'node().style.strokeLinecap ?? null',
    '[attr.opacity]': 'node().style.opacity ?? null',
    '[attr.stroke-opacity]': 'node().style.strokeOpacity ?? null',
    '[attr.visibility]': 'node().style.visibility ?? null',
  },
})
export class SvgeLineDirective {
  readonly node = input.required<LineNode>({ alias: 'svgeLine' });
}
