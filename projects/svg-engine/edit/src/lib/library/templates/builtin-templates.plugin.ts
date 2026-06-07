import { type EditorPlugin, PLUGIN_API_VERSION, type PluginContext } from '../../plugin/plugin';
import { BUILTIN_TEMPLATES } from './builtin-templates';
import { TemplateLibraryService } from './template-library.service';

/**
 * Built-in templates plugin — registers 12 document templates (print:
 * A4 portrait/landscape, Letter, business card; social: Instagram
 * square/portrait/story, Pinterest, Facebook cover, Twitter card;
 * video/presentation: YouTube thumbnail, 16:9 slide) into
 * {@link TemplateLibraryService}.
 */
export const builtinTemplatesPlugin: EditorPlugin = {
  id: 'svge.builtin.templates',
  version: '1.0.0',
  name: 'Built-in document templates (12 print / social / video formats)',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const reg = ctx.injector.get(TemplateLibraryService);
    for (const template of BUILTIN_TEMPLATES) {
      ctx.track(reg.register(template));
    }
  },
};
