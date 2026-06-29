import { type Effect, type EffectParams, resolveEffectParams } from './effect';

/**
 * Built-in effects shipped with the library (Fase 6d / D-047, parametric
 * em D-118 2026-06-28). Each effect is an SVG `<filter>` factory with an
 * optional typed `params` schema so the `<svge-effects-panel>` can expose
 * sliders / color pickers / selects per knob.
 *
 * **Backwards compatible**: every `buildFilterMarkup()` called with no
 * argument reproduces the original fixed visual (defaults equal the old
 * hard-coded values), so existing documents referencing `url(#id)` render
 * unchanged. Custom values are encoded statelessly into the `style.filter`
 * URL (see `effect-instance.ts`).
 *
 * **Param coverage**: knobs are added where they are meaningful and safe
 * (blur radius, shadow/glow offset·blur·color·opacity, brightness/contrast/
 * saturate/hue amounts, noise/displacement intensity, posterize levels…).
 * A few effects are intentionally fixed toggles with no params: emboss,
 * grayscale, sepia, invert.
 *
 * **Picker-friendly groupings**: each effect declares a `category` so the
 * panel can render named sections (`blur`, `shadow`, `glow`, `stylize`,
 * `color`, `adjustment`, `distortion`).
 *
 * **Filter region** (`x/y/width/height`): effects that produce halos
 * (blur, shadow, glow) widen the filter region beyond the default 110%
 * padding so the result isn't clipped at the bounding box.
 */

/** Format a number for markup: integers bare, floats trimmed to 4dp. */
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1e4) / 1e4);
}

/**
 * Evenly-spaced discrete levels in `[0, 1]` for `feFunc*` `tableValues`,
 * e.g. `discrete(4)` → `"0 0.333 0.667 1"`. `levels <= 1` collapses to a
 * single mid value so the filter stays valid.
 */
function discrete(levels: number): string {
  const n = Math.max(2, Math.round(levels));
  return Array.from({ length: n }, (_, i) => fmt(Math.round((i / (n - 1)) * 1e3) / 1e3)).join(' ');
}

// ── BLUR ─────────────────────────────────────────────────────────────

/** @internal Soft Gaussian blur; `radius` drives `stdDeviation`. */
export const blurEffect: Effect = {
  id: 'svge.builtin.effect.blur',
  name: 'Blur',
  category: 'blur',
  params: [
    {
      key: 'radius',
      label: 'Radius',
      type: 'number',
      default: 3,
      min: 0,
      max: 50,
      step: 0.5,
      unit: 'px',
    },
  ],
  presets: [
    { id: 'soft', name: 'Soft', params: { radius: 1.5 } },
    { id: 'medium', name: 'Medium', params: { radius: 3 } },
    { id: 'strong', name: 'Strong', params: { radius: 8 } },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    // x/y/width/height extended so the blur halo isn't clipped at the
    // default 110% filter region.
    return `<filter id="${this.id}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${fmt(p['radius'] as number)}" />
    </filter>`;
  },
};

// ── SHADOWS ─────────────────────────────────────────────────────────

/** @internal Drop shadow — colored, blurred, offset copy behind the source. */
export const dropShadowEffect: Effect = {
  id: 'svge.builtin.effect.drop-shadow',
  name: 'Drop shadow',
  category: 'shadow',
  params: [
    {
      key: 'offsetX',
      label: 'Offset X',
      type: 'number',
      default: 4,
      min: -50,
      max: 50,
      step: 1,
      unit: 'px',
    },
    {
      key: 'offsetY',
      label: 'Offset Y',
      type: 'number',
      default: 4,
      min: -50,
      max: 50,
      step: 1,
      unit: 'px',
    },
    {
      key: 'blur',
      label: 'Blur',
      type: 'number',
      default: 4,
      min: 0,
      max: 50,
      step: 0.5,
      unit: 'px',
    },
    { key: 'color', label: 'Color', type: 'color', default: '#000000' },
    { key: 'opacity', label: 'Opacity', type: 'percent', default: 0.5, min: 0, max: 1, step: 0.05 },
  ],
  presets: [
    { id: 'soft', name: 'Soft', params: { offsetX: 2, offsetY: 2, blur: 6, opacity: 0.35 } },
    { id: 'hard', name: 'Hard', params: { offsetX: 3, offsetY: 3, blur: 0, opacity: 0.6 } },
    { id: 'long', name: 'Long', params: { offsetX: 10, offsetY: 10, blur: 8, opacity: 0.4 } },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    return `<filter id="${this.id}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${fmt(p['blur'] as number)}" result="blur" />
      <feOffset in="blur" dx="${fmt(p['offsetX'] as number)}" dy="${fmt(p['offsetY'] as number)}" result="off" />
      <feFlood flood-color="${p['color'] as string}" flood-opacity="${fmt(p['opacity'] as number)}" result="color" />
      <feComposite in="color" in2="off" operator="in" result="shadow" />
      <feMerge>
        <feMergeNode in="shadow" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>`;
  },
};

/** @internal Inner shadow — shadow cast INTO the shape (Photoshop-style). */
export const innerShadowEffect: Effect = {
  id: 'svge.builtin.effect.inner-shadow',
  name: 'Inner shadow',
  category: 'shadow',
  params: [
    {
      key: 'offsetX',
      label: 'Offset X',
      type: 'number',
      default: 3,
      min: -50,
      max: 50,
      step: 1,
      unit: 'px',
    },
    {
      key: 'offsetY',
      label: 'Offset Y',
      type: 'number',
      default: 3,
      min: -50,
      max: 50,
      step: 1,
      unit: 'px',
    },
    {
      key: 'blur',
      label: 'Blur',
      type: 'number',
      default: 3,
      min: 0,
      max: 50,
      step: 0.5,
      unit: 'px',
    },
    { key: 'color', label: 'Color', type: 'color', default: '#000000' },
    { key: 'opacity', label: 'Opacity', type: 'percent', default: 0.6, min: 0, max: 1, step: 0.05 },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    return `<filter id="${this.id}" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${fmt(p['blur'] as number)}" />
      <feOffset dx="${fmt(p['offsetX'] as number)}" dy="${fmt(p['offsetY'] as number)}" />
      <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="shadowDiff" />
      <feFlood flood-color="${p['color'] as string}" flood-opacity="${fmt(p['opacity'] as number)}" />
      <feComposite in2="shadowDiff" operator="in" />
      <feComposite in2="SourceGraphic" operator="over" />
    </filter>`;
  },
};

// ── GLOWS ───────────────────────────────────────────────────────────

/** @internal Outer glow — soft colored halo around the shape. */
export const outerGlowEffect: Effect = {
  id: 'svge.builtin.effect.outer-glow',
  name: 'Outer glow',
  category: 'glow',
  params: [
    {
      key: 'blur',
      label: 'Blur',
      type: 'number',
      default: 5,
      min: 0,
      max: 50,
      step: 0.5,
      unit: 'px',
    },
    { key: 'color', label: 'Color', type: 'color', default: '#ffffff' },
    { key: 'opacity', label: 'Opacity', type: 'percent', default: 0.9, min: 0, max: 1, step: 0.05 },
  ],
  presets: [
    { id: 'subtle', name: 'Subtle', params: { blur: 3, opacity: 0.6 } },
    { id: 'intense', name: 'Intense', params: { blur: 9, opacity: 1 } },
    { id: 'neon', name: 'Neon', params: { blur: 6, color: '#00e5ff', opacity: 1 } },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    return `<filter id="${this.id}" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${fmt(p['blur'] as number)}" result="blur" />
      <feFlood flood-color="${p['color'] as string}" flood-opacity="${fmt(p['opacity'] as number)}" />
      <feComposite in2="blur" operator="in" result="glow" />
      <feMerge>
        <feMergeNode in="glow" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>`;
  },
};

/** @internal Inner glow — colored halo on the INSIDE edges of the shape. */
export const innerGlowEffect: Effect = {
  id: 'svge.builtin.effect.inner-glow',
  name: 'Inner glow',
  category: 'glow',
  params: [
    {
      key: 'blur',
      label: 'Blur',
      type: 'number',
      default: 4,
      min: 0,
      max: 50,
      step: 0.5,
      unit: 'px',
    },
    { key: 'color', label: 'Color', type: 'color', default: '#ffffff' },
    { key: 'opacity', label: 'Opacity', type: 'percent', default: 0.8, min: 0, max: 1, step: 0.05 },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    return `<filter id="${this.id}" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${fmt(p['blur'] as number)}" />
      <feComposite in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="glowDiff" />
      <feFlood flood-color="${p['color'] as string}" flood-opacity="${fmt(p['opacity'] as number)}" />
      <feComposite in2="glowDiff" operator="in" />
      <feComposite in2="SourceGraphic" operator="over" />
    </filter>`;
  },
};

// ── 3D / STYLIZE ────────────────────────────────────────────────────

/** @internal Bevel — raised-edge illusion via specular lighting on a height map. */
export const bevelEffect: Effect = {
  id: 'svge.builtin.effect.bevel',
  name: 'Bevel',
  category: 'stylize',
  params: [
    {
      key: 'blur',
      label: 'Smoothness',
      type: 'number',
      default: 2,
      min: 0.5,
      max: 15,
      step: 0.5,
      unit: 'px',
    },
    { key: 'depth', label: 'Depth', type: 'number', default: 3, min: 1, max: 20, step: 1 },
    {
      key: 'lightAngle',
      label: 'Light angle',
      type: 'angle',
      default: 225,
      min: 0,
      max: 360,
      step: 5,
      unit: '°',
    },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    return `<filter id="${this.id}" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="${fmt(p['blur'] as number)}" result="blur" />
      <feSpecularLighting in="blur" surfaceScale="${fmt(p['depth'] as number)}" specularConstant="1" specularExponent="20"
                          lighting-color="white" result="spec">
        <feDistantLight azimuth="${fmt(p['lightAngle'] as number)}" elevation="45" />
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specCut" />
      <feComposite in="SourceGraphic" in2="specCut" operator="arithmetic"
                   k1="0" k2="1" k3="1" k4="0" />
    </filter>`;
  },
};

/** @internal Emboss — grayscale "engraved" look via a diagonal convolution. Fixed. */
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

// ── COLOR (re-color in place — fixed toggles) ───────────────────────

/** @internal Grayscale via CIE 1931 luminance weights; alpha preserved. */
export const grayscaleEffect: Effect = {
  id: 'svge.builtin.effect.grayscale',
  name: 'Grayscale',
  category: 'color',
  buildFilterMarkup(): string {
    return `<filter id="${this.id}">
      <feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0
                                            0.2126 0.7152 0.0722 0 0
                                            0.2126 0.7152 0.0722 0 0
                                            0      0      0      1 0" />
    </filter>`;
  },
};

/** @internal Sepia tone — standard matrix from the W3C SVG filters note. */
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

/** @internal Invert RGB; alpha untouched. */
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

/** @internal Brightness — additive lift on each RGB channel (`amount`). */
export const brightnessEffect: Effect = {
  id: 'svge.builtin.effect.brightness',
  name: 'Brightness',
  category: 'adjustment',
  params: [
    { key: 'amount', label: 'Amount', type: 'number', default: 0.3, min: -1, max: 1, step: 0.05 },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    const a = fmt(p['amount'] as number);
    return `<filter id="${this.id}">
      <feComponentTransfer>
        <feFuncR type="linear" slope="1" intercept="${a}" />
        <feFuncG type="linear" slope="1" intercept="${a}" />
        <feFuncB type="linear" slope="1" intercept="${a}" />
      </feComponentTransfer>
    </filter>`;
  },
};

/** @internal Contrast — slope `amount` centered on mid-gray. */
export const contrastEffect: Effect = {
  id: 'svge.builtin.effect.contrast',
  name: 'Contrast',
  category: 'adjustment',
  params: [
    { key: 'amount', label: 'Amount', type: 'number', default: 1.5, min: 0, max: 4, step: 0.1 },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    const slope = p['amount'] as number;
    const intercept = fmt(-(slope - 1) / 2);
    return `<filter id="${this.id}">
      <feComponentTransfer>
        <feFuncR type="linear" slope="${fmt(slope)}" intercept="${intercept}" />
        <feFuncG type="linear" slope="${fmt(slope)}" intercept="${intercept}" />
        <feFuncB type="linear" slope="${fmt(slope)}" intercept="${intercept}" />
      </feComponentTransfer>
    </filter>`;
  },
};

/** @internal Saturate — `feColorMatrix type="saturate"` amount. */
export const saturateEffect: Effect = {
  id: 'svge.builtin.effect.saturate',
  name: 'Saturate',
  category: 'adjustment',
  params: [
    { key: 'amount', label: 'Amount', type: 'number', default: 2, min: 0, max: 4, step: 0.1 },
  ],
  presets: [
    { id: 'muted', name: 'Muted', params: { amount: 0.5 } },
    { id: 'vivid', name: 'Vivid', params: { amount: 2.5 } },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    return `<filter id="${this.id}">
      <feColorMatrix type="saturate" values="${fmt(p['amount'] as number)}" />
    </filter>`;
  },
};

/** @internal Hue rotate — `feColorMatrix type="hueRotate"` by `angle`. */
export const hueRotateEffect: Effect = {
  id: 'svge.builtin.effect.hue-rotate',
  name: 'Hue rotate',
  category: 'adjustment',
  params: [
    {
      key: 'angle',
      label: 'Angle',
      type: 'angle',
      default: 90,
      min: 0,
      max: 360,
      step: 5,
      unit: '°',
    },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    return `<filter id="${this.id}">
      <feColorMatrix type="hueRotate" values="${fmt(p['angle'] as number)}" />
    </filter>`;
  },
};

// ── DISTORTION ──────────────────────────────────────────────────────

/** @internal Noise / film grain — turbulence composited onto the source. */
export const noiseEffect: Effect = {
  id: 'svge.builtin.effect.noise',
  name: 'Noise',
  category: 'distortion',
  params: [
    {
      key: 'frequency',
      label: 'Frequency',
      type: 'number',
      default: 0.9,
      min: 0.05,
      max: 2,
      step: 0.05,
    },
    { key: 'amount', label: 'Amount', type: 'percent', default: 0.4, min: 0, max: 1, step: 0.05 },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    return `<filter id="${this.id}">
      <feTurbulence type="fractalNoise" baseFrequency="${fmt(p['frequency'] as number)}" numOctaves="2" seed="5"
                    stitchTiles="stitch" result="noise" />
      <feColorMatrix in="noise" type="matrix"
                     values="0 0 0 0 0
                             0 0 0 0 0
                             0 0 0 0 0
                             0 0 0 ${fmt(p['amount'] as number)} 0" result="noiseAlpha" />
      <feComposite in="noiseAlpha" in2="SourceAlpha" operator="in" result="grain" />
      <feMerge>
        <feMergeNode in="SourceGraphic" />
        <feMergeNode in="grain" />
      </feMerge>
    </filter>`;
  },
};

/** @internal Displacement map — warp the source using a turbulence texture. */
export const displacementMapEffect: Effect = {
  id: 'svge.builtin.effect.displacement-map',
  name: 'Displacement map',
  category: 'distortion',
  params: [
    { key: 'scale', label: 'Scale', type: 'number', default: 10, min: 0, max: 100, step: 1 },
    {
      key: 'frequency',
      label: 'Frequency',
      type: 'number',
      default: 0.05,
      min: 0.005,
      max: 0.5,
      step: 0.005,
    },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    return `<filter id="${this.id}" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="turbulence" baseFrequency="${fmt(p['frequency'] as number)}" numOctaves="2" seed="2"
                    result="turb" />
      <feDisplacementMap in="SourceGraphic" in2="turb" scale="${fmt(p['scale'] as number)}"
                         xChannelSelector="R" yChannelSelector="G" />
    </filter>`;
  },
};

/** @internal Chromatic aberration — RGB split by `offset` px (glitch look). */
export const chromaticAberrationEffect: Effect = {
  id: 'svge.builtin.effect.chromatic-aberration',
  name: 'Chromatic aberration',
  category: 'distortion',
  params: [
    {
      key: 'offset',
      label: 'Offset',
      type: 'number',
      default: 2,
      min: 0,
      max: 20,
      step: 0.5,
      unit: 'px',
    },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    const o = p['offset'] as number;
    return `<filter id="${this.id}" x="-10%" y="-10%" width="120%" height="120%">
      <feColorMatrix in="SourceGraphic" type="matrix"
                     values="1 0 0 0 0
                             0 0 0 0 0
                             0 0 0 0 0
                             0 0 0 1 0" result="r" />
      <feOffset in="r" dx="${fmt(-o)}" dy="0" result="rShift" />
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
      <feOffset in="b" dx="${fmt(o)}" dy="0" result="bShift" />
      <feBlend in="rShift" in2="g" mode="screen" result="rg" />
      <feBlend in="rg" in2="bShift" mode="screen" />
    </filter>`;
  },
};

// ── PIXEL ART ───────────────────────────────────────────────────────

/** @internal Pixelate — blur + per-channel quantization (`levels`). */
export const pixelateEffect: Effect = {
  id: 'svge.builtin.effect.pixelate',
  name: 'Pixelate',
  category: 'stylize',
  params: [
    {
      key: 'blur',
      label: 'Blur',
      type: 'number',
      default: 1.5,
      min: 0,
      max: 10,
      step: 0.5,
      unit: 'px',
    },
    { key: 'levels', label: 'Levels', type: 'number', default: 5, min: 2, max: 12, step: 1 },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    const steps = discrete(p['levels'] as number);
    return `<filter id="${this.id}">
      <feGaussianBlur stdDeviation="${fmt(p['blur'] as number)}" />
      <feComponentTransfer>
        <feFuncR type="discrete" tableValues="${steps}" />
        <feFuncG type="discrete" tableValues="${steps}" />
        <feFuncB type="discrete" tableValues="${steps}" />
      </feComponentTransfer>
    </filter>`;
  },
};

/** @internal Posterize — quantize RGB into `levels` discrete steps. */
export const posterizeEffect: Effect = {
  id: 'svge.builtin.effect.posterize',
  name: 'Posterize',
  category: 'stylize',
  params: [
    { key: 'levels', label: 'Levels', type: 'number', default: 4, min: 2, max: 10, step: 1 },
  ],
  buildFilterMarkup(params?: EffectParams): string {
    const p = resolveEffectParams(this, params);
    const steps = discrete(p['levels'] as number);
    return `<filter id="${this.id}">
      <feComponentTransfer>
        <feFuncR type="discrete" tableValues="${steps}" />
        <feFuncG type="discrete" tableValues="${steps}" />
        <feFuncB type="discrete" tableValues="${steps}" />
      </feComponentTransfer>
    </filter>`;
  },
};

/**
 * The 19 builtin effects, in picker order (grouped by category: blur →
 * shadow → glow → stylize → color → adjustment → distortion → pixel-art).
 */
export const BUILTIN_EFFECTS: readonly Effect[] = [
  blurEffect,
  dropShadowEffect,
  innerShadowEffect,
  outerGlowEffect,
  innerGlowEffect,
  bevelEffect,
  embossEffect,
  grayscaleEffect,
  sepiaEffect,
  invertEffect,
  brightnessEffect,
  contrastEffect,
  saturateEffect,
  hueRotateEffect,
  noiseEffect,
  displacementMapEffect,
  chromaticAberrationEffect,
  pixelateEffect,
  posterizeEffect,
];
