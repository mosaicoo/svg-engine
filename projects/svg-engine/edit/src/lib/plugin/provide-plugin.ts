import {
  ENVIRONMENT_INITIALIZER,
  type EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
} from '@angular/core';
import type { EditorPlugin } from './plugin';
import { PluginCatalog } from './plugin-catalog.service';
import { PluginRegistry } from './plugin-registry.service';
import { PluginStateStore } from './plugin-state-store.service';

/**
 * Bootstrap a plugin from Angular DI configuration. Returns
 * `EnvironmentProviders` for use in `bootstrapApplication({ providers: [...] })`
 * or any standalone-component injector.
 *
 * **Multiple plugins**: call once per plugin and spread into the
 * providers array. Plugins are installed in array order — useful when a
 * plugin lists `dependencies` on another plugin (declare deps first).
 *
 * **Catalog-aware**: every plugin provided this way self-registers in
 * the {@link PluginCatalog} as `'internal'`, so the plugin manager can
 * list it (and re-install it when re-enabled) even while it's disabled.
 * The user's disable preference ({@link PluginStateStore}) is honored at
 * boot — a disabled plugin is registered in the catalog but its
 * `install()` is **never** run. Enabled plugins install exactly as
 * before (fail-fast per D-020).
 *
 * **Hot-loading at runtime** (e.g., user enables a plugin from a UI
 * panel) does **not** use this function — go through
 * `PluginManagerService.enable(id)` / `installExternal(plugin)`, which
 * orchestrates the catalog, the registry and the state store together.
 *
 * Example:
 * ```typescript
 * bootstrapApplication(App, {
 *   providers: [
 *     provideSvgEnginePlugin(selectToolPlugin),
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
        // Make the plugin manageable: the catalog tracks it even while
        // disabled (the registry only tracks what's installed right now).
        inject(PluginCatalog).register(plugin, 'internal');
        // Honor the persisted disable preference — a disabled plugin must
        // never run install() (skip at boot). Enabled → install as before.
        if (inject(PluginStateStore).isDisabled(plugin.id)) return;
        inject(PluginRegistry).install(plugin);
      },
    },
  ]);
}
