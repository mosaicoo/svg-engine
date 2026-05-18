/**
 * Visual effect — categoria 7 do D-023 (`EffectRegistry`).
 *
 * Each effect contributes a self-contained SVG `<filter>` element that
 * gets injected into the renderer's `<defs>` block. Nodes opt into an
 * effect by setting `style.filter = 'url(#<effect-id>)'` via the normal
 * command flow (no separate "applied effect" model — filter is a CSS/SVG
 * presentation attribute like fill/stroke).
 *
 * **Field semantics**:
 *
 * - `id`: globally unique. Convention: reverse-DNS + kebab (e.g.,
 *   `svge.builtin.effect.blur`). The id is what consumers will reference
 *   via `url(#id)`.
 * - `name`: human-readable label shown in effect pickers.
 * - `category`: optional grouping (`'blur'`, `'shadow'`, `'color'`,
 *   `'distortion'`). UIs organize the picker by category; unknown
 *   categories are treated as `'other'`.
 * - `buildFilterMarkup`: returns the **complete** `<filter ...>…</filter>`
 *   XML string. The id must be embedded in the returned markup (use
 *   {@link Effect.id} as the filter element id so references match).
 *
 * **Why `buildFilterMarkup` instead of a structured representation**:
 * SVG filters have ~20 primitive elements (`<feGaussianBlur>`,
 * `<feOffset>`, `<feMerge>`, …) plus `result` chaining. Modelling them
 * as TypeScript types reproduces the entire filter algebra in the
 * editor — significant surface for very little gain. A raw markup
 * factory is what plugin authors actually want.
 *
 * **No params on v1**: each effect is a fixed visual (e.g., "Blur
 * (light)" with stdDeviation=2 vs "Blur (heavy)" with stdDeviation=5
 * are TWO separate registered effects). Parametric effects (slider for
 * blur radius, color picker for shadow) become possible later via an
 * `EffectInstance` / `paramsSchema` extension that doesn't break the
 * v1 contract — current effects keep working with empty params.
 */
export interface Effect {
  readonly id: string;
  readonly name: string;
  readonly category?: string;
  /**
   * Build the full `<filter>` element markup for this effect. The
   * returned XML MUST include the filter element with `id="<effect.id>"`
   * so that consumer nodes referencing `url(#id)` resolve correctly.
   */
  buildFilterMarkup(): string;
}
