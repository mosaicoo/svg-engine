/**
 * Subset of SVG presentation attributes treated as visual style.
 *
 * All fields are optional — `undefined` means "inherit from parent or
 * use the SVG default". Use {@link DEFAULT_STYLE} as a baseline when
 * an explicit value is required.
 */
export interface SvgStyle {
  /** CSS color, gradient/pattern reference, or `'none'`. */
  readonly fill?: string;
  /** CSS color, gradient/pattern reference, or `'none'`. */
  readonly stroke?: string;
  /** Stroke width in user units. Must be `>= 0`. */
  readonly strokeWidth?: number;
  /** Overall opacity in `[0, 1]`. */
  readonly opacity?: number;
  /** Fill opacity in `[0, 1]`. */
  readonly fillOpacity?: number;
  /**
   * Fill rule for self-intersecting / compound paths (paths with holes).
   * `'nonzero'` (the SVG default) vs `'evenodd'` (holes cut out). Common
   * in editor exports (Illustrator/CorelDRAW emit `fill-rule="evenodd"`
   * on most paths). Undefined = SVG default (`nonzero`).
   */
  readonly fillRule?: 'nonzero' | 'evenodd';
  /** Stroke opacity in `[0, 1]`. */
  readonly strokeOpacity?: number;
  /** Dash pattern (alternating dash/gap lengths in user units). */
  readonly strokeDasharray?: readonly number[];
  /** Offset into the dash pattern (user units). Pairs with {@link strokeDasharray}. */
  readonly strokeDashoffset?: number;
  /** Endpoint cap style. */
  readonly strokeLinecap?: 'butt' | 'round' | 'square';
  /** Corner join style. */
  readonly strokeLinejoin?: 'miter' | 'round' | 'bevel';
  /**
   * Miter-length limit for `strokeLinejoin: 'miter'` — beyond this ratio
   * the join falls back to a bevel. SVG default is `4`. Must be `>= 1`.
   */
  readonly strokeMiterlimit?: number;
  /** Visibility (separate from {@link SvgMetadata.visible} which is editor-only). */
  readonly visibility?: 'visible' | 'hidden';
  /**
   * **D-099 — `vector-effect`.** Controls whether the stroke is subject to the
   * element's (and ancestors') transform:
   * - `'none'` (SVG default): the stroke **scales** with the transform — the
   *   faithful behavior for imported artwork that carries a `scale()` transform.
   * - `'non-scaling-stroke'`: the stroke keeps a constant device width
   *   regardless of transform — what the editor wants while resizing a
   *   **rotated** shape (its `ResizeNodeCommand` fallback bakes a scale matrix).
   *
   * **Default semantics (important):** `undefined` is treated by the renderer
   * as `'non-scaling-stroke'` so editor-created shapes keep the resize-safe
   * behavior with zero changes. The **importer** sets this explicitly (file
   * value, or `'none'` when absent) so imported art renders per the SVG spec
   * instead of being forced non-scaling. Persisted in import/export round-trip.
   */
  readonly vectorEffect?: 'non-scaling-stroke' | 'none';
  /**
   * SVG `filter` attribute — typically `url(#id)` referencing a
   * `<filter>` element in `<defs>`. Set by consumers to apply effects
   * registered in `EffectRegistry` (Fase 6d). Persisted in import /
   * export round-trip like any other presentation attribute.
   */
  readonly filter?: string;
  /**
   * SVG `clip-path` attribute — typically `url(#id)` referencing a
   * `<clipPath>` element in `<defs>`. Clipping restricts the painted
   * area of the node to the union of the clipPath's children. Set by
   * consumers via the Composition section of the Inspector (D-049).
   * The library catalog for clipPaths is {@link ClipPathLibraryService}.
   */
  readonly clipPath?: string;
  /**
   * SVG `mask` attribute — typically `url(#id)` referencing a `<mask>`
   * element in `<defs>`. Unlike `clipPath` (binary inclusion), masks
   * use the luminance/alpha of their children to attenuate pixels.
   * Pairs with {@link MaskLibraryService} (D-049).
   */
  readonly mask?: string;
  /**
   * CSS `mix-blend-mode` — composites the node against the background
   * using a non-source-over blend operator. Renderer emits this as a
   * `style="mix-blend-mode: ..."` since SVG has no dedicated attribute
   * (it's a CSS property). Supported per CSS spec: `normal`,
   * `multiply`, `screen`, `overlay`, `darken`, `lighten`, `color-dodge`,
   * `color-burn`, `hard-light`, `soft-light`, `difference`, `exclusion`,
   * `hue`, `saturation`, `color`, `luminosity`, `plus-darker`,
   * `plus-lighter`. Validated at the UI layer; the engine itself
   * passes the string through as-is.
   */
  readonly mixBlendMode?: string;
}

/** Empty style (no overrides; all SVG defaults apply). */
export const EMPTY_STYLE: SvgStyle = Object.freeze({});

/** Sensible default style for newly-created shapes via factories. */
export const DEFAULT_STYLE: SvgStyle = Object.freeze({
  fill: '#cccccc',
  stroke: '#333333',
  strokeWidth: 1,
});
