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
  /** Stroke opacity in `[0, 1]`. */
  readonly strokeOpacity?: number;
  /** Dash pattern (alternating dash/gap lengths in user units). */
  readonly strokeDasharray?: readonly number[];
  /** Endpoint cap style. */
  readonly strokeLinecap?: 'butt' | 'round' | 'square';
  /** Corner join style. */
  readonly strokeLinejoin?: 'miter' | 'round' | 'bevel';
  /** Visibility (separate from {@link SvgMetadata.visible} which is editor-only). */
  readonly visibility?: 'visible' | 'hidden';
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
