/**
 * Generic contract for a "library item" — a registry-backed,
 * categorizable, named entry. D-048 introduces 8 library types
 * (shapes, palettes, graphic styles, patterns, gradients, templates,
 * symbols, brushes) that all share this shape.
 *
 * **Why one generic interface vs N specific ones**: every library has
 * the same 3 fields (`id` reverse-DNS, `name` for UI, optional
 * `category` for grouping). The DIFFERENCE is the payload — a shape
 * has a builder function returning an `SvgNode`, a palette has a
 * `swatches[]`, a gradient has a `<linearGradient>` markup. By
 * parameterizing only the payload type, we avoid 8 near-identical
 * interfaces and 8 near-identical registries.
 *
 * **Convention**:
 * - `id`: reverse-DNS + kebab (e.g., `svge.builtin.shape.star`).
 * - `name`: human-readable, used in pickers.
 * - `category`: optional grouping inside pickers (`'arrows'`,
 *   `'symbols'`, `'brand'`, etc.). Unknown categories surface as
 *   `'other'` in the UI.
 *
 * Concrete library types extend `LibraryItem` by adding their specific
 * payload field — see `ShapeLibraryItem`, `GraphicStyleLibraryItem`,
 * etc.
 */
export interface LibraryItem {
  readonly id: string;
  readonly name: string;
  readonly category?: string;
}
