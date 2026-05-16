import { Directive, input } from '@angular/core';
import type { EllipseNode } from 'svg-engine/core';

/** Apply to `<svg:ellipse>` to bind attributes from an {@link EllipseNode}. */
@Directive({
  selector: '[svgeEllipse]',
  standalone: true,
  host: {
    '[attr.cx]': 'node().cx',
    '[attr.cy]': 'node().cy',
    '[attr.rx]': 'node().rx',
    '[attr.ry]': 'node().ry',
    '[attr.fill]': 'node().style.fill ?? null',
    '[attr.stroke]': 'node().style.stroke ?? null',
    '[attr.stroke-width]': 'node().style.strokeWidth ?? null',
    '[attr.opacity]': 'node().style.opacity ?? null',
    '[attr.fill-opacity]': 'node().style.fillOpacity ?? null',
    '[attr.stroke-opacity]': 'node().style.strokeOpacity ?? null',
    '[attr.visibility]': 'node().style.visibility ?? null',
    // Bloco 4-R4: avoid stroke distortion when scale lives in transform
    '[attr.vector-effect]': '"non-scaling-stroke"',
  },
})
export class SvgeEllipseDirective {
  readonly node = input.required<EllipseNode>({ alias: 'svgeEllipse' });
}
