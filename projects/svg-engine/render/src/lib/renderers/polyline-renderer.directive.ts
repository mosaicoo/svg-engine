import { computed, Directive, input } from '@angular/core';
import type { PolylineNode } from 'svg-engine/core';

/** Apply to `<svg:polyline>` to bind attributes from a {@link PolylineNode}. */
@Directive({
  selector: '[svgePolyline]',
  standalone: true,
  host: {
    '[attr.points]': 'pointsAttr()',
    // Polylines default to fill=none in editors so the stroke path reads
    // unambiguously; consumers can override via `style.fill`.
    '[attr.fill]': "node().style.fill ?? 'none'",
    '[attr.stroke]': 'node().style.stroke ?? null',
    '[attr.stroke-width]': 'node().style.strokeWidth ?? null',
    '[attr.stroke-linecap]': 'node().style.strokeLinecap ?? null',
    '[attr.stroke-linejoin]': 'node().style.strokeLinejoin ?? null',
    '[attr.opacity]': 'node().style.opacity ?? null',
    '[attr.stroke-opacity]': 'node().style.strokeOpacity ?? null',
    '[attr.visibility]': 'node().style.visibility ?? null',
  },
})
export class SvgePolylineDirective {
  readonly node = input.required<PolylineNode>({ alias: 'svgePolyline' });

  protected readonly pointsAttr = computed(() =>
    this.node()
      .points.map((p) => `${p.x},${p.y}`)
      .join(' '),
  );
}
