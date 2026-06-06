import { type EditorPlugin, PLUGIN_API_VERSION, type PluginContext } from '../../plugin/plugin';
import { BUILTIN_PATTERNS } from './builtin-patterns';
import { PatternLibraryService } from './pattern-library.service';

/**
 * Built-in patterns plugin — registers 30 default patterns (D-048
 * Item 2) into {@link PatternLibraryService}.
 */
export const builtinPatternsPlugin: EditorPlugin = {
  id: 'svge.builtin.patterns',
  version: '1.0.0',
  name: 'Built-in patterns library (30 presets)',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const reg = ctx.injector.get(PatternLibraryService);
    for (const pattern of BUILTIN_PATTERNS) {
      ctx.track(reg.register(pattern));
    }
  },
};
