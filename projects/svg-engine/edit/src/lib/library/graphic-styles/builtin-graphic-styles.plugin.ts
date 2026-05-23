import { type EditorPlugin, PLUGIN_API_VERSION, type PluginContext } from '../../plugin/plugin';
import { BUILTIN_GRAPHIC_STYLES } from './builtin-graphic-styles';
import { GraphicStyleLibraryService } from './graphic-style-library.service';

/**
 * Built-in graphic styles plugin — registers the 6 default style
 * presets (sketch, outline, filled-3d, embossed, glass, neon) into
 * {@link GraphicStyleLibraryService}.
 *
 * **Effect dependency**: 4 of 6 presets reference effects from
 * `builtinEffectsPlugin` (drop-shadow, blur, bevel, outer-glow).
 * Installing this plugin without effects degrades gracefully — those
 * presets still apply the fill/stroke/opacity, but the filter URL
 * resolves to nothing.
 *
 * Bootstrap:
 * ```ts
 * providers: [
 *   provideSvgEnginePlugin(builtinEffectsPlugin), // recommended dep
 *   provideSvgEnginePlugin(builtinGraphicStylesPlugin),
 * ];
 * ```
 */
export const builtinGraphicStylesPlugin: EditorPlugin = {
  id: 'svge.builtin.graphic-styles',
  version: '1.0.0',
  name: 'Built-in graphic styles library (6 presets)',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const reg = ctx.injector.get(GraphicStyleLibraryService);
    for (const style of BUILTIN_GRAPHIC_STYLES) {
      ctx.track(reg.register(style));
    }
  },
};
