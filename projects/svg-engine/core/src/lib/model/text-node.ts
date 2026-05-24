import type { NodeId } from '../types/node-id';
import type { SvgNodeBase } from './svg-node-base';

/**
 * Text element. Maps to SVG `<text>`. The `content` field is a single
 * string — multi-line is expressed by embedding `\n` characters in
 * `content` and the renderer (see `svg-engine/render` text dispatcher)
 * splits on `\n` into a sequence of `<tspan dy>` runs. Explicit
 * `<tspan>` runs with per-run styling are still not modelled at the
 * data layer — they would require extending this interface with an
 * optional `runs` field.
 *
 * **D-053 — Variable Fonts + OpenType + Text on Path (Item 6.5 / 6.6)**:
 *
 * - `fontVariationSettings`: CSS `font-variation-settings` value, e.g.
 *   `"'wght' 650, 'wdth' 95, 'opsz' 24"`. Activates variable-font axes
 *   on font families that ship them (Inter, Roboto Flex, Recursive,
 *   etc). Inert when the loaded font is static — the browser silently
 *   ignores axes the font doesn't expose.
 * - `fontFeatureSettings`: CSS `font-feature-settings` value, e.g.
 *   `"'liga' on, 'smcp' on, 'ss01' on"`. OpenType features (ligatures,
 *   small caps, stylistic sets, tabular figures, etc). Same
 *   no-op-when-unsupported semantics as variation settings.
 * - `letterSpacing`: SVG `letter-spacing` attribute (in document units).
 *   Surfaced because the Inspector's text section is the natural home
 *   for typography controls, and consumers asked for it.
 *
 * **Text on path** (`<textPath>`):
 *
 * - `textPathRef`: optional {@link NodeId} of a path node in the same
 *   document. When set, the renderer wraps `content` in a
 *   `<textPath href="#<id>">`, making the text follow that path's
 *   curvature. Setting it to a non-existent id is harmless — the
 *   browser falls back to rendering on a straight baseline at `x,y`.
 * - `textPathStartOffset`: starting offset along the referenced path,
 *   as a CSS length string (e.g. `'50%'` for the path midpoint, `'40'`
 *   for 40 user units from the start). When omitted, the text starts
 *   at the beginning of the path. Honored only when `textPathRef` is
 *   set; otherwise ignored.
 *
 * **Multi-line + textPath interplay**: `<textPath>` does NOT honor
 * `\n` for line wrapping (SVG limitation). When `textPathRef` is set,
 * the renderer renders `content` as a single run regardless of
 * embedded newlines — line breaks are silently flattened to spaces.
 * For multi-line text on a path the user must place separate text
 * nodes on separate paths.
 */
export interface TextNode extends SvgNodeBase {
  readonly type: 'text';
  readonly x: number;
  readonly y: number;
  readonly content: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly fontWeight?: number | 'normal' | 'bold';
  readonly textAnchor?: 'start' | 'middle' | 'end';
  // D-053
  readonly fontVariationSettings?: string;
  readonly fontFeatureSettings?: string;
  readonly letterSpacing?: number;
  readonly textPathRef?: NodeId;
  readonly textPathStartOffset?: string;
}
