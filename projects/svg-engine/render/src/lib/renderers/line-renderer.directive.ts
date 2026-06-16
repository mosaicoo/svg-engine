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
    '[attr.stroke-linejoin]': 'node().style.strokeLinejoin ?? null',
    '[attr.stroke-miterlimit]': 'node().style.strokeMiterlimit ?? null',
    '[attr.stroke-dasharray]': 'node().style.strokeDasharray?.join(" ") ?? null',
    '[attr.stroke-dashoffset]': 'node().style.strokeDashoffset ?? null',
    '[attr.opacity]': 'node().style.opacity ?? null',
    '[attr.stroke-opacity]': 'node().style.strokeOpacity ?? null',
    '[attr.visibility]': 'node().style.visibility ?? null',
    '[attr.filter]': 'node().style.filter ?? null',
    // Bloco 4-R4: avoid stroke distortion when scale lives in transform
    '[attr.vector-effect]': '"non-scaling-stroke"',
  },
})
export class SvgeLineDirective {
  readonly node = input.required<LineNode>({ alias: 'svgeLine' });
}
