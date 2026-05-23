import { type EditorPlugin, PLUGIN_API_VERSION, type PluginContext } from '../../plugin/plugin';
import { PaletteRegistry } from '../../palette/palette-registry.service';

/**
 * Extra palettes plugin (D-048) — augments the 3 base palettes
 * shipped via `builtinPalettesPlugin` (greys, material-primary,
 * tailwind-pastels) with 4 additional opinionated palettes that
 * round out the Palette Library:
 *
 * 1. **`ibm-design`** — IBM Design Language brand colors (carbon design
 *    system). Useful for enterprise apps.
 * 2. **`brand-warm`** — warm tones (reds/oranges/yellows) for energetic
 *    designs.
 * 3. **`brand-cool`** — cool tones (blues/teals/purples) for calm /
 *    professional designs.
 * 4. **`neon`** — saturated neon colors for cyberpunk / 80s aesthetic.
 *
 * **Why a separate plugin vs adding to `builtinPalettesPlugin`**:
 * keeping these in a separate opt-in plugin lets consumers stay with
 * the smaller default set (3 palettes) if bundle size matters, OR
 * install both for the full library (7 palettes total). Following the
 * same pattern as `pngExporterPlugin` vs `builtinIoPlugin`.
 */
export const extraPalettesPlugin: EditorPlugin = {
  id: 'svge.builtin.palettes.extra',
  version: '1.0.0',
  name: 'Extra palettes library (IBM, warm, cool, neon)',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const reg = ctx.injector.get(PaletteRegistry);

    ctx.track(
      reg.register({
        id: 'ibm-design',
        name: 'IBM Design',
        category: 'brand',
        swatches: [
          '#0f62fe', // blue 60
          '#393939', // gray 80
          '#8a3ffc', // purple 60
          '#007d79', // teal 70
          '#fa4d56', // red 50
          '#ff832b', // orange 60
          '#f1c21b', // yellow 30
          '#198038', // green 60
          '#161616', // gray 100
        ],
      }),
    );

    ctx.track(
      reg.register({
        id: 'brand-warm',
        name: 'Warm',
        category: 'brand',
        swatches: [
          '#b71c1c', // deep red
          '#d32f2f', // red
          '#e64a19', // deep orange
          '#f57c00', // orange
          '#fbc02d', // yellow
          '#ffa000', // amber
          '#8d6e63', // brown light
          '#5d4037', // brown dark
        ],
      }),
    );

    ctx.track(
      reg.register({
        id: 'brand-cool',
        name: 'Cool',
        category: 'brand',
        swatches: [
          '#0d47a1', // deep blue
          '#1976d2', // blue
          '#0097a7', // cyan
          '#00796b', // teal
          '#388e3c', // green
          '#7b1fa2', // purple
          '#512da8', // deep purple
          '#283593', // indigo
        ],
      }),
    );

    ctx.track(
      reg.register({
        id: 'neon',
        name: 'Neon',
        category: 'utility',
        swatches: [
          '#ff006e', // hot pink
          '#fb5607', // neon orange
          '#ffbe0b', // electric yellow
          '#8338ec', // electric purple
          '#3a86ff', // electric blue
          '#06ffa5', // electric green
          '#ffffff',
          '#000000',
        ],
      }),
    );
  },
};
