import { type EditorPlugin, PLUGIN_API_VERSION, type PluginContext } from '../../plugin/plugin';
import { BUILTIN_TEMPLATES } from './builtin-templates';
import { TemplateLibraryService } from './template-library.service';

/**
 * Built-in templates plugin — registers 4 document templates (A4,
 * Instagram, Twitter card, business card) into
 * {@link TemplateLibraryService}.
 */
export const builtinTemplatesPlugin: EditorPlugin = {
  id: 'svge.builtin.templates',
  version: '1.0.0',
  name: 'Built-in document templates (A4, Instagram, Twitter, business card)',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx: PluginContext): void {
    const reg = ctx.injector.get(TemplateLibraryService);
    for (const template of BUILTIN_TEMPLATES) {
      ctx.track(reg.register(template));
    }
  },
};
