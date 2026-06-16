import { Directive, input } from '@angular/core';
import type { TextNode } from 'svg-engine/core';

/**
 * Apply to `<svg:text>` to bind attributes from a {@link TextNode}.
 *
 * The `<svg:text>` element's text **content** is set in the dispatcher's
 * template, because directives cannot inject child nodes. The dispatcher
 * splits `node.content` on `\n` and emits one `<tspan dy>` per line, so
 * multi-line text is rendered by simply embedding line breaks in the
 * `content` field. Explicit `<tspan>` runs with per-run styling are
 * still not modelled at the data layer — that would require an extra
 * `runs` field on `TextNode`.
 */
@Directive({
  selector: '[svgeText]',
  standalone: true,
  host: {
    // When wrapped in <textPath>, the geometry is dictated by the
    // referenced path — x/y on the parent <text> are ignored. We still
    // emit them so existing snapshots stay stable + so removing the
    // textPathRef "rolls back" to standard positioning without other
    // attr changes. Same reasoning for text-anchor (works either way).
    '[attr.x]': 'node().x',
    '[attr.y]': 'node().y',
    '[attr.font-size]': 'node().fontSize ?? null',
    '[attr.font-family]': 'node().fontFamily ?? null',
    '[attr.font-weight]': 'node().fontWeight ?? null',
    '[attr.text-anchor]': 'node().textAnchor ?? null',
    // D-069 — typography basics. `font-style` and `text-decoration` are
    // standard SVG attributes (CSS works too; attr form keeps parity
    // with `font-family`/`font-weight` already on this directive).
    // `line-height` lives in the multi-line tspan dy logic (node-renderer
    // component) because SVG <text> doesn't honor `line-height` directly —
    // it's a CSS property that browsers apply only to flow layout, not
    // SVG text. tspan `dy` is the canonical way to control leading.
    '[attr.font-style]': 'node().fontStyle ?? null',
    '[attr.text-decoration]': 'node().textDecoration ?? null',
    // D-053 Variable fonts + OpenType + letter spacing. These are CSS
    // properties (no native SVG attributes), so they go via `style.*`
    // bindings — same trick used for `mix-blend-mode` in D-049.
    //
    // **font-variation-settings**: opt-in to variable-font axes
    //   (`'wght' 650, 'wdth' 95, ...`). Inert when the loaded font is
    //   static — the browser silently ignores axes the font doesn't
    //   expose, so emitting always is safe.
    // **font-feature-settings**: enable OpenType features (ligatures,
    //   small caps, stylistic sets, tabular figures, etc).
    // **letter-spacing**: surfaced as a CSS prop for consistency with
    //   the other typography knobs — SVG also accepts a `letter-spacing`
    //   attribute but the CSS form gives identical results and unifies
    //   how every text knob is bound.
    '[style.font-variation-settings]': 'node().fontVariationSettings ?? null',
    '[style.font-feature-settings]': 'node().fontFeatureSettings ?? null',
    '[style.letter-spacing]':
      "node().letterSpacing !== undefined ? node().letterSpacing + 'px' : null",
    '[attr.fill]': 'node().style.fill ?? null',
    '[attr.fill-rule]': 'node().style.fillRule ?? null',
    '[attr.fill-opacity]': 'node().style.fillOpacity ?? null',
    '[attr.stroke]': 'node().style.stroke ?? null',
    '[attr.stroke-width]': 'node().style.strokeWidth ?? null',
    '[attr.stroke-opacity]': 'node().style.strokeOpacity ?? null',
    '[attr.stroke-linecap]': 'node().style.strokeLinecap ?? null',
    '[attr.stroke-linejoin]': 'node().style.strokeLinejoin ?? null',
    '[attr.stroke-miterlimit]': 'node().style.strokeMiterlimit ?? null',
    '[attr.stroke-dasharray]': 'node().style.strokeDasharray?.join(" ") ?? null',
    '[attr.stroke-dashoffset]': 'node().style.strokeDashoffset ?? null',
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
