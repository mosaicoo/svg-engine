import {
  ENVIRONMENT_INITIALIZER,
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import type { EditorPlugin } from './plugin';
import { PluginRegistry } from './plugin-registry.service';

/**
 * Bootstrap a plugin from Angular DI configuration. Returns
 * `EnvironmentProviders` for use in `bootstrapApplication({ providers: [...] })`
 * or any standalone-component injector.
 *
 * **Multiple plugins**: call once per plugin and spread into the
 * providers array. Plugins are installed in array order — useful when a
 * plugin lists `dependencies` on another plugin (declare deps first).
 *
 * **Hot-loading at runtime** (e.g., user enables a plugin from a UI
 * panel) does **not** use this function — call
 * `PluginRegistry.install(plugin)` directly via DI.
 *
 * Example:
 * ```typescript
 * bootstrapApplication(App, {
 *   providers: [
 *     provideSvgEnginePlugin(builtinSelectToolPlugin),
 *     provideSvgEnginePlugin(pencilToolPlugin),
 *     provideSvgEnginePlugin(myCustomOptimizerPlugin),
 *   ],
 * });
 * ```
 */
export function provideSvgEnginePlugin(plugin: EditorPlugin): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: ENVIRONMENT_INITIALIZER,
      multi: true,
      useValue: () => {
        inject(PluginRegistry).install(plugin);
      },
    },
  ]);
}
