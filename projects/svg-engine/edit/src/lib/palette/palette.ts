/**
 * A named set of color swatches surfaced in pickers (color inspector,
 * future fill/stroke contextual menus). Palettes are headless data —
 * the rendering belongs to `svg-engine/ui` (`<svge-color-palette>`).
 *
 * **Field semantics**:
 * - `id`: globally unique identifier. Convention: dash-separated
 *   `<source>-<theme>` (e.g., `material-primary`, `tailwind-pastels`).
 * - `name`: human-readable label shown in palette pickers.
 * - `category`: optional grouping for UIs that organize palettes by
 *   intent (e.g., `'brand'`, `'semantic'`, `'utility'`). Plugins can
 *   choose any string; consumers treat unknown categories as `'other'`.
 * - `swatches`: ordered list of CSS color strings. Any valid CSS color
 *   format is accepted (hex, `rgb()`, `hsl()`, named). The UI
 *   normalizes to hex via `cssColorToHex6` when binding to a native
 *   color picker.
 *
 * **Design**: keeping `swatches` as opaque strings (not parsed RGB
 * tuples) lets palettes carry alpha, semantic names, or even CSS
 * variables in the future without breaking the type. The UI is the
 * one place that needs to interpret them.
 */
export interface Palette {
  readonly id: string;
  readonly name: string;
  readonly category?: string;
  readonly swatches: readonly string[];
}
