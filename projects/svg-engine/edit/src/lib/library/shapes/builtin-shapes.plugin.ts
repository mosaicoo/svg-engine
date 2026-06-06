import { type EditorPlugin, PLUGIN_API_VERSION, type PluginContext } from '../../plugin/plugin';
import { BUILTIN_SHAPES } from './builtin-shapes';
import { ShapeLibraryService } from './shape-library.service';

/**
 * Built-in shapes plugin — registers the 24 default shapes (D-048
 * Shape Library) into {@link ShapeLibraryService}.
 *
 * Bootstrap:
 * ```ts
 * import { builtinShapesPlugin, provideSvgEnginePlugin } from 'svg-engine/edit';
 * providers: [provideSvgEnginePlugin(builtinShapesPlugin)];
 * ```
 *
 * Apps that don't need a shape library (read-only viewers, headless
 * renderers) simply don't provision this plugin and the registry
 * stays empty — the panel hides itself, zero cost.
 */
export const builtinShapesPlugin: EditorPlugin = {
  id: 'svge.builtin.shapes',
  version: '1.0.0',
  name: 'Built-in shapes library (24 shapes: star, arrow, heart, etc.)',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const reg = ctx.injector.get(ShapeLibraryService);
    for (const shape of BUILTIN_SHAPES) {
      ctx.track(reg.register(shape));
    }
  },
};
