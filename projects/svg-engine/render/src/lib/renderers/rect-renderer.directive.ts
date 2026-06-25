import { Directive, input } from '@angular/core';
import type { RectNode } from '@mosaicoo/svg-engine/core';

/**
 * Apply to a `<svg:rect>` element to bind its attributes from a
 * {@link RectNode}. Use the directive as both selector and value binding:
 *
 * ```html
 * <svg:rect [svgeRect]="rectNode" />
 * ```
 *
 * Why a directive (not a component): components inject a host element
 * created by `document.createElement(selector)` which lives in the HTML
 * namespace. Inside an `<svg>`, an HTML wrapper element breaks the SVG
 * render tree — the SVG painter does not traverse non-SVG elements. A
 * directive applied to an actual `<svg:rect>` element keeps the host in
 * the SVG namespace so geometry attributes paint correctly.
 */
@Directive({
  selector: '[svgeRect]',
  standalone: true,
  host: {
    '[attr.x]': 'node().x',
    '[attr.y]': 'node().y',
    '[attr.width]': 'node().width',
    '[attr.height]': 'node().height',
    '[attr.rx]': 'node().rx ?? null',
    '[attr.ry]': 'node().ry ?? null',
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
    // Bloco 4-Resize-Proper / R4: stroke must NOT scale visually when a
    // scale matrix lives in the node's `transform` (the rotated-node
    // fallback path of `ResizeNodeCommand`). For identity-or-translate
    // nodes the bake path keeps geometry truthful — `non-scaling-stroke`
    // is then a harmless no-op (no scale matrix to fight).
    // **D-099** — respect the node's `vector-effect`; default to non-scaling
    // (resize-safe) for editor-created shapes. Imported shapes carry an explicit
    // value (file's, or `'none'` per SVG default) so their strokes scale.
    '[attr.vector-effect]': 'node().style.vectorEffect ?? "non-scaling-stroke"',
  },
})
export class SvgeRectDirective {
  readonly node = input.required<RectNode>({ alias: 'svgeRect' });
}
