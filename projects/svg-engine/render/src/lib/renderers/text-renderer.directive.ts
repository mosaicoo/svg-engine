import { Directive, input } from '@angular/core';
import type { TextNode } from 'svg-engine/core';

/**
 * Apply to `<svg:text>` to bind attributes from a {@link TextNode}.
 *
 * The `<svg:text>` element's text **content** is set in the dispatcher's
 * template via interpolation (`{{ node.content }}`), because directives
 * cannot inject child nodes. Multi-line text and `<tspan>` runs are not
 * modelled in v0.
 */
@Directive({
  selector: '[svgeText]',
  standalone: true,
  host: {
    '[attr.x]': 'node().x',
    '[attr.y]': 'node().y',
    '[attr.font-size]': 'node().fontSize ?? null',
    '[attr.font-family]': 'node().fontFamily ?? null',
    '[attr.font-weight]': 'node().fontWeight ?? null',
    '[attr.text-anchor]': 'node().textAnchor ?? null',
    '[attr.fill]': 'node().style.fill ?? null',
    '[attr.stroke]': 'node().style.stroke ?? null',
    '[attr.stroke-width]': 'node().style.strokeWidth ?? null',
    '[attr.opacity]': 'node().style.opacity ?? null',
    '[attr.visibility]': 'node().style.visibility ?? null',
    '[attr.filter]': 'node().style.filter ?? null',
    // Bloco 4-R4: avoid stroke distortion when scale lives in transform
    '[attr.vector-effect]': '"non-scaling-stroke"',
  },
})
export class SvgeTextDirective {
  readonly node = input.required<TextNode>({ alias: 'svgeText' });
}
