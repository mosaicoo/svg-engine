import {
  ExporterRegistry,
  ImporterRegistry,
  svgExporter,
  svgImporter,
} from '@mosaicoo/svg-engine/io';
import type { EditorPlugin, PluginContext } from '../plugin/plugin';
import { PLUGIN_API_VERSION } from '../plugin/plugin';

/**
 * Built-in IO plugin (Fase 5-IO). Registers the sanitized
 * {@link svgImporter} and the deterministic {@link svgExporter} via
 * `ctx.track` so they auto-clean on uninstall.
 *
 * Shipping these as a separate plugin (rather than hard-coded in the
 * registries) means apps that want a different IO surface — e.g.,
 * stricter sanitization, a custom XML dialect, or no IO at all —
 * can opt out by NOT providing this plugin and providing their own.
 */
export const builtinIoPlugin: EditorPlugin = {
  id: 'svge.builtin.io',
  version: '1.0.0',
  name: 'Built-in SVG IO (import + export)',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    ctx.track(ctx.injector.get(ImporterRegistry).register(svgImporter));
    ctx.track(ctx.injector.get(ExporterRegistry).register(svgExporter));
  },
};
