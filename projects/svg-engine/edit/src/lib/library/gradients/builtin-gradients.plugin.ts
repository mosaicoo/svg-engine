import { type EditorPlugin, PLUGIN_API_VERSION, type PluginContext } from '../../plugin/plugin';
import { BUILTIN_GRADIENTS } from './builtin-gradients';
import { GradientLibraryService } from './gradient-library.service';

/**
 * Built-in gradients plugin — registers the 6 default gradients
 * (D-048 Item 3) into {@link GradientLibraryService}.
 *
 * Bootstrap:
 * ```ts
 * providers: [provideSvgEnginePlugin(builtinGradientsPlugin)];
 * ```
 *
 * Apps that don't need gradients (read-only viewers) simply don't
 * provision this — the registry stays empty, the shell's
 * `resolvedDefs` injection becomes a no-op for gradients, zero cost.
 */
export const builtinGradientsPlugin: EditorPlugin = {
  id: 'svge.builtin.gradients',
  version: '1.0.0',
  name: 'Built-in gradients library (linear + radial, 6 presets)',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const reg = ctx.injector.get(GradientLibraryService);
    for (const gradient of BUILTIN_GRADIENTS) {
      ctx.track(reg.register(gradient));
    }
  },
};
