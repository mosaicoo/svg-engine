import type { EditorPlugin, PluginContext } from '../plugin/plugin';
import { PLUGIN_API_VERSION } from '../plugin/plugin';
import { BUILTIN_EFFECTS } from './builtin-effects';
import { EffectRegistry } from './effect-registry.service';

/**
 * Built-in effects plugin — registers the 4 default SVG filter
 * presets (`blur`, `drop-shadow`, `grayscale`, `sepia`) into the
 * {@link EffectRegistry}.
 *
 * Ship as a separate plugin (not bundled into a "kitchen sink"
 * builtin) for the same reason `pngExporterPlugin` ships separately:
 * apps that don't need effects (read-only viewers, headless renderers)
 * simply don't provision this plugin and the EffectRegistry stays
 * empty — renderer's defs injection becomes a no-op, zero cost.
 *
 * Bootstrap:
 * ```ts
 * import { builtinEffectsPlugin, provideSvgEnginePlugin } from 'svg-engine/edit';
 * providers: [provideSvgEnginePlugin(builtinEffectsPlugin)];
 * ```
 */
export const builtinEffectsPlugin: EditorPlugin = {
  id: 'svge.builtin.effects',
  version: '1.0.0',
  name: 'Built-in effects (blur, drop-shadow, grayscale, sepia)',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const reg = ctx.injector.get(EffectRegistry);
    for (const effect of BUILTIN_EFFECTS) {
      ctx.track(reg.register(effect));
    }
  },
};
