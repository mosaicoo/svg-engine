import { Directive, input } from '@angular/core';
import type { ImageNode } from '@mosaicoo/svg-engine/core';

/** Apply to `<svg:image>` to bind attributes from an {@link ImageNode}. */
@Directive({
  selector: '[svgeImage]',
  standalone: true,
  host: {
    '[attr.x]': 'node().x',
    '[attr.y]': 'node().y',
    '[attr.width]': 'node().width',
    '[attr.height]': 'node().height',
    '[attr.href]': 'node().href',
    '[attr.preserveAspectRatio]': 'node().preserveAspectRatio ?? null',
    '[attr.opacity]': 'node().style.opacity ?? null',
    '[attr.visibility]': 'node().style.visibility ?? null',
    '[attr.filter]': 'node().style.filter ?? null',
  },
})
export class SvgeImageDirective {
  readonly node = input.required<ImageNode>({ alias: 'svgeImage' });
}
