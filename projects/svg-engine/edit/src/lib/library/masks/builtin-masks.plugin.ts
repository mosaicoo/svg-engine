import { type EditorPlugin, PLUGIN_API_VERSION, type PluginContext } from '../../plugin/plugin';
import { BUILTIN_MASKS } from './builtin-masks';
import { MaskLibraryService } from './mask-library.service';

/**
 * Built-in masks plugin — registers the 4 default masks (D-049 Item
 * 4) into {@link MaskLibraryService}.
 */
export const builtinMasksPlugin: EditorPlugin = {
  id: 'svge.builtin.masks',
  version: '1.0.0',
  name: 'Built-in mask library (4 presets)',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const reg = ctx.injector.get(MaskLibraryService);
    for (const m of BUILTIN_MASKS) {
      ctx.track(reg.register(m));
    }
  },
};
