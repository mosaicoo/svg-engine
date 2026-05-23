import type { EditorPlugin, PluginContext } from '../plugin/plugin';
import { PLUGIN_API_VERSION } from '../plugin/plugin';
import { BUILTIN_EFFECTS } from './builtin-effects';
import { EffectRegistry } from './effect-registry.service';

/**
 * Built-in effects plugin — registers the 19 default SVG filter presets
 * (4 originals + 15 added in D-047, 2026-05-23) into the
 * {@link EffectRegistry}.
 *
 * Presets covered: blur, drop-shadow, inner-shadow, outer-glow,
 * inner-glow, bevel, emboss, grayscale, sepia, invert, brightness,
 * contrast, saturate, hue-rotate, noise, displacement-map, chromatic-
 * aberration, pixelate, posterize.
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
  version: '2.0.0',
  name: 'Built-in effects (19 presets — blur, shadows, glows, color, distortion, pixel art)',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const reg = ctx.injector.get(EffectRegistry);
    for (const effect of BUILTIN_EFFECTS) {
      ctx.track(reg.register(effect));
    }
  },
};
