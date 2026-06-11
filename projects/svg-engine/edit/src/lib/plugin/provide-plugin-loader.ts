import { type EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import {
  type PluginModuleLoader,
  SVGE_PLUGIN_MODULE_LOADER,
  SVGE_PLUGIN_TRUSTED_ORIGINS,
} from './plugin-loader.service';

/** Configuration for {@link providePluginLoader}. */
export interface PluginLoaderConfig {
  /**
   * Origins (`scheme://host[:port]`) a plugin's `entry` URL may come
   * from. **Required and meaningful** — `PluginLoader` rejects any
   * manifest whose entry origin isn't listed (an empty array disables
   * loading entirely). This is the consumer's trust boundary.
   */
  readonly trustedOrigins: readonly string[];
  /**
   * How a validated manifest becomes a module namespace. This is where
   * the actual `import()` (and any SRI fetch/verify) lives — kept in
   * consumer code on purpose, so the library never ships a "load any
   * URL" primitive. Minimal form: `(m) => import(m.entry)`.
   */
  readonly moduleLoader: PluginModuleLoader;
}

/**
 * **Opt-in runtime external-plugin loading** (D-083 Fase 2). Wire this
 * into `bootstrapApplication({ providers: [...] })` to let
 * `PluginLoader.load(manifest)` fetch + install third-party plugins from
 * origins **you** trust. Without this provider, `PluginLoader` is
 * fail-closed (no trusted origins, no module loader) and refuses every
 * load — by design.
 *
 * ```ts
 * providePluginLoader({
 *   trustedOrigins: ['https://plugins.my-cdn.com'],
 *   moduleLoader: (m) => import(/* @vite-ignore *\/ m.entry),
 * });
 * ```
 */
export function providePluginLoader(config: PluginLoaderConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: SVGE_PLUGIN_TRUSTED_ORIGINS, useValue: config.trustedOrigins },
    { provide: SVGE_PLUGIN_MODULE_LOADER, useValue: config.moduleLoader },
  ]);
}
