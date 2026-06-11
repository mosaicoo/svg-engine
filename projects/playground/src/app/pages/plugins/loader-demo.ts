import {
  type EditorPlugin,
  type ExternalPluginManifest,
  PLUGIN_API_VERSION,
  type PluginModuleLoader,
} from 'svg-engine/edit';

/**
 * **Fase 2 loader demo (playground only).** Exercises the real
 * `PluginLoader` end-to-end **without a network**: a fake trusted origin
 * plus an in-memory `moduleLoader` that maps a manifest `entry` to a
 * module namespace (`{ default: plugin }`). This is exactly the contract
 * a real consumer's `import(m.entry)` would satisfy — only the transport
 * is faked, so the guard chain (validate → apiVersion → origin allowlist
 * → shape-check) runs for real.
 */
export const LOADER_DEMO_ORIGIN = 'https://demo.plugins.local';
const DEMO_ENTRY = `${LOADER_DEMO_ORIGIN}/hello-plugin.js`;

/** The plugin the demo "module" exports as its default. */
const helloLoaderPlugin: EditorPlugin = {
  id: 'com.demo.loaded.hello',
  name: 'Hello (loaded via PluginLoader)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  description: 'Third-party plugin loaded at runtime by PluginLoader (Fase 2).',
  author: 'External Demo',
  icon: 'cloud_download',
  category: 'other',
  install: () => undefined,
};

/** In-memory "CDN": entry URL → module namespace. No real fetch. */
const MODULES: Readonly<Record<string, unknown>> = {
  [DEMO_ENTRY]: { default: helloLoaderPlugin },
};

/**
 * The consumer-provided module loader, wired in `app.config` via
 * `providePluginLoader`. A production app would `import(m.entry)` (and
 * verify `m.integrity`) here instead of reading an in-memory map.
 */
export const loaderDemoModuleLoader: PluginModuleLoader = (m) => {
  const mod = MODULES[m.entry];
  return mod === undefined
    ? Promise.reject(new Error(`demo: no module registered for ${m.entry}`))
    : Promise.resolve(mod);
};

/** A manifest whose `entry` is on the trusted origin → loads successfully. */
export function trustedManifest(): ExternalPluginManifest {
  return {
    id: 'com.demo.loaded.hello',
    name: 'Hello (loaded via PluginLoader)',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    entry: DEMO_ENTRY,
    description: 'Third-party plugin loaded at runtime by PluginLoader (Fase 2).',
    author: 'External Demo',
    icon: 'cloud_download',
    category: 'other',
  };
}

/** A manifest whose `entry` is NOT on the allowlist → refused by the loader. */
export function untrustedManifest(): ExternalPluginManifest {
  return {
    ...trustedManifest(),
    id: 'com.demo.loaded.untrusted',
    entry: 'https://evil.example.com/payload.js',
  };
}
