import type { Effect } from './effect';

/**
 * Built-in effects shipped with the library (Fase 6d expandido em D-047,
 * 2026-05-23). Each is a fixed visual — for parametric variants
 * (slider-driven blur, custom shadow color), consumers register
 * additional effects with different ids.
 *
 * **Why fixed-visual builtins instead of parameter dialogs**:
 * - Proves the `EffectRegistry` contract works end-to-end (D-023 cat 7).
 * - 19 ready-to-use effects (4 originais + 15 D-047) cobrem o vocabulário
 *   visual mais usado em editores de SVG: blur, sombras, glows, color
 *   adjustments, distortion, pixel art.
 * - Parametric effects need a UI for the param input — out of scope
 *   for the v1 panel. Once the panel grows a slider, plugins can
 *   define parametric effects via a future `paramsSchema` extension.
 *
 * **Picker-friendly groupings**: each effect declares a `category`
 * so `<svge-effects-panel>` can render them in named sections (`blur`,
 * `shadow`, `glow`, `color`, `adjustment`, `distortion`, `stylize`).
 *
 * **Filter region** (`x/y/width/height`): effects that produce halos
 * (blur, shadow, glow) widen the filter region beyond the default
 * 110% padding so the result doesn't get clipped at the bounding box.
 * Effects that only re-color in-place (grayscale, sepia, invert)
 * leave the region at its default — no wasted GPU pixels.
 */

// ── BLUR ─────────────────────────────────────────────────────────────

/** Soft Gaussian blur. stdDeviation tuned for "noticeable but not destroying detail". */
export const blurEffect: Effect = {
  id: 'svge.builtin.effect.blur',
  name: 'Blur',
  category: 'blur',
  buildFilterMarkup(): string {
    // x/y/width/height extended (-50%/200%) so the blur halo doesn't
    // get clipped at the filter region's default 110% padding.
    return `<filter id="${this.id}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
    </filter>`;
  },
};

// ── SHADOWS ─────────────────────────────────────────────────────────

/**
 * Drop shadow at 4px offset, 4px blur, semi-transparent black. Default
 * direction matches most design tools (light from top-left).
 */
export const dropShadowEffect: Effect = {
  id: 'svge.builtin.effect.drop-shadow',
  name: 'Drop shadow',
  category: 'shadow',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
      <feOffset dx="4" dy="4" result="offsetblur" />
      <feComponentTransfer><feFuncA type="linear" slope="0.5" /></feComponentTransfer>
      <feMerge>
        <feMergeNode />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>`;
  },
};

/**
 * Inner shadow — shadow CAST INTO the shape (Photoshop-style "inner
 * shadow" layer effect). Technique: invert alpha, blur, offset, then
 * intersect with original source so the shadow only appears inside the
 * shape's bounds.
 */
export const innerShadowEffect: Effect = {
  id: 'svge.builtin.effect.inner-shadow',
  name: 'Inner shadow',
  category: 'shadow',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
      <feOffset dx="3" dy="3" />
      <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="shadowDiff" />
      <feFlood flood-color="black" flood-opacity="0.6" />
      <feComposite in2="shadowDiff" operator="in" />
      <feComposite in2="SourceGraphic" operator="over" />
    </filter>`;
  },
};

// ── GLOWS ───────────────────────────────────────────────────────────

/**
 * Outer glow — soft white halo around the shape (UI hover hint style).
 * Technique: blur the alpha, flood with glow color, composite on top of
 * the original source.
 */
export const outerGlowEffect: Effect = {
  id: 'svge.builtin.effect.outer-glow',
  name: 'Outer glow',
  category: 'glow',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="blur" />
      <feFlood flood-color="white" flood-opacity="0.9" />
      <feComposite in2="blur" operator="in" result="glow" />
      <feMerge>
        <feMergeNode in="glow" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>`;
  },
};

/**
 * Inner glow — soft white halo on the INSIDE edges of the shape (the
 * "lit from within" look). Mirrors innerShadow's technique but with a
 * bright flood instead of dark.
 */
export const innerGlowEffect: Effect = {
  id: 'svge.builtin.effect.inner-glow',
  name: 'Inner glow',
  category: 'glow',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
      <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="glowDiff" />
      <feFlood flood-color="white" flood-opacity="0.8" />
      <feComposite in2="glowDiff" operator="in" />
      <feComposite in2="SourceGraphic" operator="over" />
    </filter>`;
  },
};

// ── 3D / STYLIZE ────────────────────────────────────────────────────

/**
 * Bevel — illusion of raised edges via light + shadow casting on the
 * inside boundary. Uses feSpecularLighting + a blurred alpha as the
 * height map (classic Photoshop "Bevel and Emboss" technique).
 */
export const bevelEffect: Effect = {
  id: 'svge.builtin.effect.bevel',
  name: 'Bevel',
  category: 'stylize',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur" />
      <feSpecularLighting in="blur" surfaceScale="3" specularConstant="1" specularExponent="20"
                          lighting-color="white" result="spec">
        <feDistantLight azimuth="225" elevation="45" />
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specCut" />
      <feComposite in="SourceGraphic" in2="specCut" operator="arithmetic"
                   k1="0" k2="1" k3="1" k4="0" />
    </filter>`;
  },
};

/**
 * Emboss — flatter, grayscale "engraved" look. Convolves the source
 * with a diagonal kernel that emphasises NW→SE edges. Final result is
 * neutral gray with highlights/shadows on the relief edges.
 */
export const embossEffect: Effect = {
  id: 'svge.builtin.effect.emboss',
  name: 'Emboss',
  category: 'stylize',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}">
      <feConvolveMatrix order="3" preserveAlpha="true"
                        kernelMatrix="-2 -1 0
                                      -1  1 1
                                       0  1 2" />
    </filter>`;
  },
};

// ── COLOR (re-color in place) ───────────────────────────────────────

/**
 * Convert to grayscale via standard luminance weights (CIE 1931).
 * Identity on alpha (preserves transparency).
 */
export const grayscaleEffect: Effect = {
  id: 'svge.builtin.effect.grayscale',
  name: 'Grayscale',
  category: 'color',
  buildFilterMarkup(): string {
    // Matrix rows = [r, g, b, a, additive] for each channel
    return `<filter id="${this.id}">
      <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0
                                            0.2126 0.7152 0.0722 0 0
                                            0.2126 0.7152 0.0722 0 0
                                            0      0      0      1 0" />
    </filter>`;
  },
};

/**
 * Sepia tone — classic vintage filter. Standard matrix from the W3C
 * SVG filters note.
 */
export const sepiaEffect: Effect = {
  id: 'svge.builtin.effect.sepia',
  name: 'Sepia',
  category: 'color',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}">
      <feColorMatrix type="matrix" values="0.393 0.769 0.189 0 0
                                            0.349 0.686 0.168 0 0
                                            0.272 0.534 0.131 0 0
                                            0     0     0     1 0" />
    </filter>`;
  },
};

/**
 * Invert colors — RGB inverted, alpha untouched. `1 - channel` via
 * negative slope + intercept on each feFuncRGB.
 */
export const invertEffect: Effect = {
  id: 'svge.builtin.effect.invert',
  name: 'Invert',
  category: 'color',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}">
      <feComponentTransfer>
        <feFuncR type="table" tableValues="1 0" />
        <feFuncG type="table" tableValues="1 0" />
        <feFuncB type="table" tableValues="1 0" />
      </feComponentTransfer>
    </filter>`;
  },
};

// ── ADJUSTMENTS (color correction primitives) ───────────────────────

/**
 * Brightness +30% — additive lift on each RGB channel via feFuncRGB
 * `intercept`. Caps at 1.0 automatically (filter clamps).
 */
export const brightnessEffect: Effect = {
  id: 'svge.builtin.effect.brightness',
  name: 'Brightness +30%',
  category: 'adjustment',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}">
      <feComponentTransfer>
        <feFuncR type="linear" slope="1" intercept="0.3" />
        <feFuncG type="linear" slope="1" intercept="0.3" />
        <feFuncB type="linear" slope="1" intercept="0.3" />
      </feComponentTransfer>
    </filter>`;
  },
};

/**
 * Contrast +50% — multiplicative slope (1.5) centered on mid-gray
 * (intercept = -(slope-1)/2 = -0.25). Above mid gets brighter, below
 * gets darker.
 */
export const contrastEffect: Effect = {
  id: 'svge.builtin.effect.contrast',
  name: 'Contrast +50%',
  category: 'adjustment',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}">
      <feComponentTransfer>
        <feFuncR type="linear" slope="1.5" intercept="-0.25" />
        <feFuncG type="linear" slope="1.5" intercept="-0.25" />
        <feFuncB type="linear" slope="1.5" intercept="-0.25" />
      </feComponentTransfer>
    </filter>`;
  },
};

/**
 * Saturate 200% — boost color saturation via feColorMatrix
 * `type="saturate"` (built-in shortcut, no manual matrix math).
 */
export const saturateEffect: Effect = {
  id: 'svge.builtin.effect.saturate',
  name: 'Saturate 200%',
  category: 'adjustment',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}">
      <feColorMatrix type="saturate" values="2" />
    </filter>`;
  },
};

/**
 * Hue rotate 90° — shift hue by quarter-turn around the color wheel
 * via feColorMatrix `type="hueRotate"`. Useful for chromatic theming.
 */
export const hueRotateEffect: Effect = {
  id: 'svge.builtin.effect.hue-rotate',
  name: 'Hue rotate 90°',
  category: 'adjustment',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}">
      <feColorMatrix type="hueRotate" values="90" />
    </filter>`;
  },
};

// ── DISTORTION ──────────────────────────────────────────────────────

/**
 * Noise / turbulence — Perlin noise texture composited on top of the
 * source via "in" (texture only appears where the source is opaque).
 * Subtle film-grain look.
 */
export const noiseEffect: Effect = {
  id: 'svge.builtin.effect.noise',
  name: 'Noise',
  category: 'distortion',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="5"
                    stitchTiles="stitch" result="noise" />
      <feColorMatrix in="noise" type="matrix"
                     values="0 0 0 0 0
                             0 0 0 0 0
                             0 0 0 0 0
                             0 0 0 0.4 0" result="noiseAlpha" />
      <feComposite in="noiseAlpha" in2="SourceAlpha" operator="in" result="grain" />
      <feMerge>
        <feMergeNode in="SourceGraphic" />
        <feMergeNode in="grain" />
      </feMerge>
    </filter>`;
  },
};

/**
 * Displacement map — uses a turbulence noise texture as the displacement
 * source to warp the original graphic (wavy/distorted look). Scale
 * controls intensity of the warp.
 */
export const displacementMapEffect: Effect = {
  id: 'svge.builtin.effect.displacement-map',
  name: 'Displacement map',
  category: 'distortion',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="turbulence" baseFrequency="0.05" numOctaves="2" seed="2"
                    result="turb" />
      <feDisplacementMap in="SourceGraphic" in2="turb" scale="10"
                         xChannelSelector="R" yChannelSelector="G" />
    </filter>`;
  },
};

/**
 * Chromatic aberration — RGB split (classic glitch / lo-fi look).
 * Splits each channel via feColorMatrix and offsets them slightly in
 * different directions, then merges.
 */
export const chromaticAberrationEffect: Effect = {
  id: 'svge.builtin.effect.chromatic-aberration',
  name: 'Chromatic aberration',
  category: 'distortion',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}" x="-10%" y="-10%" width="120%" height="120%">
      <feColorMatrix in="SourceGraphic" type="matrix"
                     values="1 0 0 0 0
                             0 0 0 0 0
                             0 0 0 0 0
                             0 0 0 1 0" result="r" />
      <feOffset in="r" dx="-2" dy="0" result="rShift" />
      <feColorMatrix in="SourceGraphic" type="matrix"
                     values="0 0 0 0 0
                             0 1 0 0 0
                             0 0 0 0 0
                             0 0 0 1 0" result="g" />
      <feColorMatrix in="SourceGraphic" type="matrix"
                     values="0 0 0 0 0
                             0 0 0 0 0
                             0 0 1 0 0
                             0 0 0 1 0" result="b" />
      <feOffset in="b" dx="2" dy="0" result="bShift" />
      <feBlend in="rShift" in2="g" mode="screen" result="rg" />
      <feBlend in="rg" in2="bShift" mode="screen" />
    </filter>`;
  },
};

// ── PIXEL ART ───────────────────────────────────────────────────────

/**
 * Pixelate — downsamples to ~8px blocks via feFlood + feComposite
 * trickery. Technically uses `feImage` would be cleaner but requires
 * data URIs; here we use a turbulence trick that gives a chunky look.
 *
 * Pure SVG filter pixelation requires `feColorMatrix` to quantize
 * AFTER a step-blur — but a single deterministic filter chain that
 * does true pixel-grid downsample isn't possible without CSS
 * `image-rendering: pixelated` on a bitmap. This filter uses a
 * coarse mosaic effect via feComponentTransfer step.
 */
export const pixelateEffect: Effect = {
  id: 'svge.builtin.effect.pixelate',
  name: 'Pixelate',
  category: 'stylize',
  buildFilterMarkup(): string {
    // True pixelation in pure SVG is constrained — we approximate via
    // a heavy quantize on each RGB channel (4 discrete steps per
    // channel) combined with a small blur. Visual is "chunky color
    // banding" which reads as pixel art on most subjects.
    return `<filter id="${this.id}">
      <feGaussianBlur stdDeviation="1.5" />
      <feComponentTransfer>
        <feFuncR type="discrete" tableValues="0 0.25 0.5 0.75 1" />
        <feFuncG type="discrete" tableValues="0 0.25 0.5 0.75 1" />
        <feFuncB type="discrete" tableValues="0 0.25 0.5 0.75 1" />
      </feComponentTransfer>
    </filter>`;
  },
};

/**
 * Posterize — quantizes RGB into 4 discrete levels per channel
 * (classic poster art look). Pure feComponentTransfer, no blur.
 * Distinct from pixelate (which adds blur to fake low-res).
 */
export const posterizeEffect: Effect = {
  id: 'svge.builtin.effect.posterize',
  name: 'Posterize',
  category: 'stylize',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}">
      <feComponentTransfer>
        <feFuncR type="discrete" tableValues="0 0.33 0.66 1" />
        <feFuncG type="discrete" tableValues="0 0.33 0.66 1" />
        <feFuncB type="discrete" tableValues="0 0.33 0.66 1" />
      </feComponentTransfer>
    </filter>`;
  },
};

/**
 * The 19 builtin effects, in the order they'll appear in the picker.
 *
 * Order rationale: group by category (blur → shadow → glow → stylize
 * → color → adjustment → distortion → pixel-art) so the picker's
 * `byCategory` grouping renders in an intuitive sequence even when
 * the panel UI iterates the flat array.
 */
export const BUILTIN_EFFECTS: readonly Effect[] = [
  // blur
  blurEffect,
  // shadows
  dropShadowEffect,
  innerShadowEffect,
  // glows
  outerGlowEffect,
  innerGlowEffect,
  // 3D / stylize
  bevelEffect,
  embossEffect,
  // color (re-color in place)
  grayscaleEffect,
  sepiaEffect,
  invertEffect,
  // adjustments
  brightnessEffect,
  contrastEffect,
  saturateEffect,
  hueRotateEffect,
  // distortion
  noiseEffect,
  displacementMapEffect,
  chromaticAberrationEffect,
  // pixel art
  pixelateEffect,
  posterizeEffect,
];
