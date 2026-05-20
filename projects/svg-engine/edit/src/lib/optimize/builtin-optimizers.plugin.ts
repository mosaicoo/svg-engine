import {
  dropDefaultsOptimizer,
  OptimizerRegistry,
  precisionOptimizer,
  pruneEmptyGroupsOptimizer,
} from 'svg-engine/optimize';
import type { EditorPlugin, PluginContext } from '../plugin/plugin';
import { PLUGIN_API_VERSION } from '../plugin/plugin';

/**
 * Built-in optimizers plugin (Fase 5-Optimize). Registers the 3
 * conservative default passes via `ctx.track`:
 *
 * 1. {@link precisionOptimizer} (order 10) — round numerics to 3 decimals
 * 2. {@link dropDefaultsOptimizer} (order 50) — strip redundant defaults
 * 3. {@link pruneEmptyGroupsOptimizer} (order 90) — drop `<g></g>`
 *
 * "Conservative" here means: each pass is safe to run on any well-
 * formed document — never alters visual rendering, only file size /
 * cleanliness. Plugins that want aggressive passes (e.g., merging
 * adjacent rects, converting circles to paths) ship as separate
 * optimizer plugins.
 */
export const builtinOptimizersPlugin: EditorPlugin = {
  id: 'svge.builtin.optimizers',
  version: '1.0.0',
  name: 'Built-in SVG optimizers',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const reg = ctx.injector.get(OptimizerRegistry);
    ctx.track(reg.register(precisionOptimizer));
    ctx.track(reg.register(dropDefaultsOptimizer));
    ctx.track(reg.register(pruneEmptyGroupsOptimizer));
  },
};
