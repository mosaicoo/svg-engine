import type { GraphicStyleLibraryItem } from './graphic-style-library.service';

/**
 * 6 built-in graphic style presets (D-048). Each is a hand-tuned
 * combination of fill + stroke + filter that gives the target a
 * recognizable visual identity in one click.
 *
 * Categories:
 * - `'flat'`: solid colors, no effects.
 * - `'effects'`: leverages D-047 effects (drop-shadow, glow, bevel).
 * - `'outline'`: stroke-only or stroke-heavy looks.
 *
 * Each preset references effects by their `svge.builtin.effect.*` id
 * — so installing `builtinEffectsPlugin` is recommended (otherwise
 * the filter reference resolves to nothing and renders unstyled, but
 * NOT broken).
 */

/** Filled with a flat green + dark green stroke. Friendly app look. */
export const sketchStyle: GraphicStyleLibraryItem = {
  id: 'svge.builtin.graphic-style.sketch',
  name: 'Sketch',
  category: 'flat',
  style: {
    fill: '#a5d6a7',
    stroke: '#2e7d32',
    strokeWidth: 2,
    opacity: 1,
    filter: undefined,
  },
};

/** Bright pink with neon glow effect — 80s cyberpunk. */
export const neonStyle: GraphicStyleLibraryItem = {
  id: 'svge.builtin.graphic-style.neon',
  name: 'Neon',
  category: 'effects',
  style: {
    fill: '#ff006e',
    stroke: '#ffbe0b',
    strokeWidth: 2,
    opacity: 0.95,
    filter: 'url(#svge.builtin.effect.outer-glow)',
  },
};

/** Translucent white with blur backdrop — glassmorphism. */
export const glassStyle: GraphicStyleLibraryItem = {
  id: 'svge.builtin.graphic-style.glass',
  name: 'Glass',
  category: 'effects',
  style: {
    fill: '#ffffff',
    stroke: '#ffffff',
    strokeWidth: 1,
    opacity: 0.45,
    filter: 'url(#svge.builtin.effect.blur)',
  },
};

/** Beige fill with embossed 3D look — classic Photoshop bevel. */
export const embossedStyle: GraphicStyleLibraryItem = {
  id: 'svge.builtin.graphic-style.embossed',
  name: 'Embossed',
  category: 'effects',
  style: {
    fill: '#e0c9a6',
    stroke: '#a68a64',
    strokeWidth: 1,
    opacity: 1,
    filter: 'url(#svge.builtin.effect.bevel)',
  },
};

/** No fill, thick black outline. For technical / wireframe looks. */
export const outlineStyle: GraphicStyleLibraryItem = {
  id: 'svge.builtin.graphic-style.outline',
  name: 'Outline',
  category: 'outline',
  style: {
    fill: 'none',
    stroke: '#212121',
    strokeWidth: 3,
    opacity: 1,
    filter: undefined,
  },
};

/** Filled blue with drop-shadow — material design card look. */
export const filled3DStyle: GraphicStyleLibraryItem = {
  id: 'svge.builtin.graphic-style.filled-3d',
  name: 'Filled 3D',
  category: 'effects',
  style: {
    fill: '#2196f3',
    stroke: '#0d47a1',
    strokeWidth: 1,
    opacity: 1,
    filter: 'url(#svge.builtin.effect.drop-shadow)',
  },
};

/** Ordered list of all 6 builtins, in picker order. */
export const BUILTIN_GRAPHIC_STYLES: readonly GraphicStyleLibraryItem[] = [
  sketchStyle,
  outlineStyle,
  filled3DStyle,
  embossedStyle,
  glassStyle,
  neonStyle,
];
