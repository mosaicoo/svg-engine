import { computed, Directive, input } from '@angular/core';
import type { PolygonNode } from '@mosaicoo/svg-engine/core';

/** Apply to `<svg:polygon>` to bind attributes from a {@link PolygonNode}. */
@Directive({
  selector: '[svgePolygon]',
  standalone: true,
  host: {
    '[attr.points]': 'pointsAttr()',
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
export class SvgePolygonDirective {
  readonly node = input.required<PolygonNode>({ alias: 'svgePolygon' });

  protected readonly pointsAttr = computed(() =>
    this.node()
      .points.map((p) => `${p.x},${p.y}`)
      .join(' '),
  );
}
