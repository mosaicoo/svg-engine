import { type EditorPlugin, PLUGIN_API_VERSION, type PluginContext } from '../../plugin/plugin';
import { BUILTIN_CLIP_PATHS } from './builtin-clip-paths';
import { ClipPathLibraryService } from './clip-path-library.service';

/**
 * Built-in clipPaths plugin — registers the 5 default clip-path
 * shapes (D-049 Item 4) into {@link ClipPathLibraryService}.
 *
 * Bootstrap:
 * ```ts
 * providers: [provideSvgEnginePlugin(builtinClipPathsPlugin)];
 * ```
 *
 * Apps that don't need clip paths (read-only viewers) simply don't
 * provision this — registry stays empty, zero render cost.
 */
export const builtinClipPathsPlugin: EditorPlugin = {
  id: 'svge.builtin.clip-paths',
  version: '1.0.0',
  name: 'Built-in clipPath library (5 presets)',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const reg = ctx.injector.get(ClipPathLibraryService);
    for (const cp of BUILTIN_CLIP_PATHS) {
      ctx.track(reg.register(cp));
    }
  },
};
