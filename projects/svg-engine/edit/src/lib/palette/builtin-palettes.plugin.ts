import type { EditorPlugin, PluginContext } from '../plugin/plugin';
import { PLUGIN_API_VERSION } from '../plugin/plugin';
import { PaletteRegistry } from './palette-registry.service';

/**
 * Built-in palette plugin — registers three opinionated palettes that
 * cover the common starting points for new documents:
 *
 * 1. **`default-greys`** — utility neutrals (transparent + 7 greys +
 *    black). Always present so users have *something* to click even
 *    before installing any color libraries. `'transparent'` is
 *    included as the first swatch because clearing fill/stroke is the
 *    second-most-common edit after picking a real color.
 * 2. **`material-primary`** — Google Material Design 500-line colors
 *    (one swatch per hue, 10 hues). Familiar to Angular Material users
 *    and a good baseline for app UIs.
 * 3. **`tailwind-pastels`** — Tailwind 200-line colors (light pastel
 *    tones). Pairs well with the default `randomPastel()` seeded fills
 *    in the playground.
 *
 * **Why ship these built-in instead of leaving them to user plugins**:
 * the inspector needs at least one palette to show a useful "swatches"
 * row immediately on first run. Asking every consumer to register
 * something would mean a blank palette area until the user installs
 * an extension — a poor first-impression. Plugins can still override
 * by registering palettes with HIGHER prominence (insertion order
 * preserved by `PaletteRegistry`).
 *
 * Built-in is wired via `provideSvgEnginePlugin(builtinPalettesPlugin)`
 * in the app bootstrap; uninstall removes the contributions via the
 * Disposables tracked at install time.
 */
export const builtinPalettesPlugin: EditorPlugin = {
  id: 'svge.builtin.palettes',
  version: '1.0.0',
  name: 'Built-in color palettes',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const reg = ctx.injector.get(PaletteRegistry);

    ctx.track(
      reg.register({
        id: 'default-greys',
        name: 'Greys',
        category: 'utility',
        swatches: [
          'transparent',
          '#ffffff',
          '#f5f5f5',
          '#e0e0e0',
          '#bdbdbd',
          '#9e9e9e',
          '#616161',
          '#424242',
          '#000000',
        ],
      }),
    );

    ctx.track(
      reg.register({
        id: 'material-primary',
        name: 'Material 500',
        category: 'brand',
        swatches: [
          '#f44336', // red
          '#e91e63', // pink
          '#9c27b0', // purple
          '#3f51b5', // indigo
          '#2196f3', // blue
          '#009688', // teal
          '#4caf50', // green
          '#ffc107', // amber
          '#ff9800', // orange
          '#795548', // brown
        ],
      }),
    );

    ctx.track(
      reg.register({
        id: 'tailwind-pastels',
        name: 'Pastels',
        category: 'brand',
        swatches: [
          '#fecaca', // red-200
          '#fed7aa', // orange-200
          '#fde68a', // amber-200
          '#bbf7d0', // green-200
          '#a7f3d0', // emerald-200
          '#bfdbfe', // blue-200
          '#c7d2fe', // indigo-200
          '#ddd6fe', // violet-200
          '#fbcfe8', // pink-200
        ],
      }),
    );
  },
};
