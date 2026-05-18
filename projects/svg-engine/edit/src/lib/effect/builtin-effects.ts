import type { Effect } from './effect';

/**
 * Built-in effects shipped with the library (Fase 6d). Each is a
 * fixed visual — for parametric variants (slider-driven blur, custom
 * shadow color), consumers register additional effects with different
 * ids.
 *
 * **Why fixed-visual builtins instead of parameter dialogs**:
 * - The point of the registry is to PROVE the contract works end-to-end
 *   (D-023 cat 7). Four ready-to-use effects cover the common visual
 *   needs (blur, shadow, desaturate, vintage).
 * - Parametric effects need a UI for the param input — out of scope
 *   for the v1 panel. Once the panel grows a slider, plugins can
 *   define parametric effects via a future `paramsSchema` extension.
 *
 * **Picker-friendly groupings**: each effect declares a `category`
 * so `<svge-effects-panel>` can render them in named sections (`Blur`,
 * `Shadow`, `Color`).
 */

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

/** The four builtin effects, in the order they'll appear in the picker. */
export const BUILTIN_EFFECTS: readonly Effect[] = [
  blurEffect,
  dropShadowEffect,
  grayscaleEffect,
  sepiaEffect,
];
