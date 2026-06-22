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
    '[attr.fill-rule]': 'node().style.fillRule ?? null',
    '[attr.stroke]': 'node().style.stroke ?? null',
    '[attr.stroke-width]': 'node().style.strokeWidth ?? null',
    '[attr.stroke-linecap]': 'node().style.strokeLinecap ?? null',
    '[attr.stroke-linejoin]': 'node().style.strokeLinejoin ?? null',
    '[attr.stroke-miterlimit]': 'node().style.strokeMiterlimit ?? null',
    '[attr.stroke-dasharray]': 'node().style.strokeDasharray?.join(" ") ?? null',
    '[attr.stroke-dashoffset]': 'node().style.strokeDashoffset ?? null',
    '[attr.opacity]': 'node().style.opacity ?? null',
    '[attr.fill-opacity]': 'node().style.fillOpacity ?? null',
    '[attr.stroke-opacity]': 'node().style.strokeOpacity ?? null',
    '[attr.visibility]': 'node().style.visibility ?? null',
    '[attr.filter]': 'node().style.filter ?? null',
    // D-099 — respect node vector-effect; default non-scaling (resize-safe).
    '[attr.vector-effect]': 'node().style.vectorEffect ?? "non-scaling-stroke"',
  },
})
export class SvgeEllipseDirective {
  readonly node = input.required<EllipseNode>({ alias: 'svgeEllipse' });
}
