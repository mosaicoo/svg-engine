import { Directive, input } from '@angular/core';
import type { PathNode } from 'svg-engine/core';

/** Apply to `<svg:path>` to bind attributes from a {@link PathNode}. */
@Directive({
  selector: '[svgePath]',
  standalone: true,
  host: {
    '[attr.d]': 'node().d',
    '[attr.fill]': 'node().style.fill ?? null',
    '[attr.stroke]': 'node().style.stroke ?? null',
    '[attr.stroke-width]': 'node().style.strokeWidth ?? null',
    '[attr.stroke-linecap]': 'node().style.strokeLinecap ?? null',
    '[attr.stroke-linejoin]': 'node().style.strokeLinejoin ?? null',
    '[attr.opacity]': 'node().style.opacity ?? null',
    '[attr.fill-opacity]': 'node().style.fillOpacity ?? null',
    '[attr.stroke-opacity]': 'node().style.strokeOpacity ?? null',
    '[attr.visibility]': 'node().style.visibility ?? null',
    // Bloco 4-R4: avoid stroke distortion when scale lives in transform
    '[attr.vector-effect]': '"non-scaling-stroke"',
  },
})
export class SvgePathDirective {
  readonly node = input.required<PathNode>({ alias: 'svgePath' });
}
