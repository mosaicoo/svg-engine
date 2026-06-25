import { Directive, input } from '@angular/core';
import type { SymbolUseNode } from '@mosaicoo/svg-engine/core';

/**
 * Apply to `<svg:use>` to bind attributes from a {@link SymbolUseNode}
 * (D-059). The `<symbol id="{symbolId}">` definition that this `<use>`
 * references is contributed to `<defs>` by `ActiveSymbolsService`
 * (in `svg-engine/edit`).
 *
 * **Style inheritance**: `fill`/`stroke`/`opacity` set on the `<use>`
 * cascade into the shadow tree (the master's contents) for any inner
 * element that didn't specify those values explicitly. Editing the
 * master overrides everywhere; editing the instance customizes a
 * single occurrence.
 *
 * **Filter on `<use>`** applies to the rendered output, AFTER the
 * symbol expansion — useful for "glow that one instance" without
 * touching the master.
 *
 * **width/height optional**: when omitted, the symbol renders at its
 * master's natural size (from the `<symbol>`'s `viewBox`).
 */
@Directive({
  selector: '[svgeSymbolUse]',
  standalone: true,
  host: {
    '[attr.href]': "'#' + node().symbolId",
    '[attr.x]': 'node().x',
    '[attr.y]': 'node().y',
    '[attr.width]': 'node().width ?? null',
    '[attr.height]': 'node().height ?? null',
    '[attr.fill]': 'node().style.fill ?? null',
    '[attr.stroke]': 'node().style.stroke ?? null',
    '[attr.stroke-width]': 'node().style.strokeWidth ?? null',
    '[attr.opacity]': 'node().style.opacity ?? null',
    '[attr.visibility]': 'node().style.visibility ?? null',
    '[attr.filter]': 'node().style.filter ?? null',
  },
})
export class SvgeSymbolUseDirective {
  readonly node = input.required<SymbolUseNode>({ alias: 'svgeSymbolUse' });
}
