import { ExporterRegistry, pngExporter } from '@mosaicoo/svg-engine/io';
import type { EditorPlugin, PluginContext } from '../plugin/plugin';
import { PLUGIN_API_VERSION } from '../plugin/plugin';

/**
 * Reference plugin: registers the {@link pngExporter} (canvas-based
 * SVG → PNG rasterizer) as a separate, opt-in EditorPlugin.
 *
 * **Why a separate plugin (not bundled into {@link builtinIoPlugin})**:
 *
 * - Demonstrates the extensibility story end-to-end — third parties
 *   ship exporters the exact same way SVGEngine ships built-ins.
 * - PNG export needs a DOM (`<canvas>` + `Image`); consumers running
 *   the editor in headless / SSR contexts can simply not provide this
 *   plugin and avoid the cost.
 * - Apps that want a different raster pipeline (e.g., a worker-based
 *   `OffscreenCanvas` exporter for huge documents) opt out of this
 *   plugin and ship their own.
 *
 * **Install/uninstall**: registers the exporter via `ctx.track`, so the
 * `ExporterRegistry` removes it automatically on plugin uninstall — no
 * bookkeeping in the plugin body.
 */
export const pngExporterPlugin: EditorPlugin = {
  id: 'svge.builtin.exporter.png.plugin',
  version: '1.0.0',
  name: 'PNG exporter (canvas-based)',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    ctx.track(ctx.injector.get(ExporterRegistry).register(pngExporter));
  },
};
