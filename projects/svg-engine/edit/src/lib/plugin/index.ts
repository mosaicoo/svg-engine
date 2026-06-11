export {
  type Disposable,
  type EditorPlugin,
  type InstalledPlugin,
  type PluginCategory,
  type PluginContext,
  type PluginDisplayMeta,
  type PluginManifest,
  type PluginSource,
  PLUGIN_API_VERSION,
  withPluginMeta,
} from './plugin';
export { PluginRegistry } from './plugin-registry.service';
export { provideSvgEnginePlugin } from './provide-plugin';
// Fase 1 — plugin management layer (D-083): catalog of known plugins,
// persisted enable/disable preference, and the manager façade the
// `<svge-plugin-manager>` UI consumes.
export { type CatalogEntry, PluginCatalog } from './plugin-catalog.service';
export { PluginStateStore } from './plugin-state-store.service';
export { type PluginActionResult, PluginManagerService } from './plugin-manager.service';
// Fase 2 — runtime loading of external (third-party) plugins from
// consumer-trusted origins (D-083): manifest contract + validator, the
// fail-closed PluginLoader (allowlist + apiVersion gate), and the opt-in
// providePluginLoader (the consumer supplies origins + the module loader).
export {
  type ExternalPluginManifest,
  validateExternalPluginManifest,
} from './external-plugin-manifest';
export {
  PluginLoader,
  type PluginModuleLoader,
  SVGE_PLUGIN_MODULE_LOADER,
  SVGE_PLUGIN_TRUSTED_ORIGINS,
} from './plugin-loader.service';
export { type PluginLoaderConfig, providePluginLoader } from './provide-plugin-loader';
