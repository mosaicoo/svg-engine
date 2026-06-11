export {
  type Disposable,
  type EditorPlugin,
  type InstalledPlugin,
  type PluginCategory,
  type PluginContext,
  type PluginManifest,
  type PluginSource,
  PLUGIN_API_VERSION,
} from './plugin';
export { PluginRegistry } from './plugin-registry.service';
export { provideSvgEnginePlugin } from './provide-plugin';
// Fase 1 — plugin management layer (D-083): catalog of known plugins,
// persisted enable/disable preference, and the manager façade the
// `<svge-plugin-manager>` UI consumes.
export { type CatalogEntry, PluginCatalog } from './plugin-catalog.service';
export { PluginStateStore } from './plugin-state-store.service';
export { type PluginActionResult, PluginManagerService } from './plugin-manager.service';
