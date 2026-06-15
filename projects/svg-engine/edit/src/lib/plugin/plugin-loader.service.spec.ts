import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type EditorPlugin, PLUGIN_API_VERSION } from './plugin';
import type { ExternalPluginManifest } from './external-plugin-manifest';
import {
  PluginLoader,
  type PluginModuleLoader,
  SVGE_PLUGIN_TRUSTED_ORIGINS,
} from './plugin-loader.service';
import { PluginManagerService } from './plugin-manager.service';
import { providePluginLoader } from './provide-plugin-loader';

const STORAGE_KEY = 'svge:plugins:state';
const TRUSTED = 'https://plugins.acme.com';

const FAKE_PLUGIN: EditorPlugin = {
  id: 'com.acme.demo',
  name: 'Acme Demo',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  install: () => undefined,
};

const okLoader: PluginModuleLoader = () => Promise.resolve({ default: FAKE_PLUGIN });

function manifest(over: Partial<ExternalPluginManifest> = {}): ExternalPluginManifest {
  return {
    id: 'com.acme.demo',
    name: 'Acme Demo',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    entry: `${TRUSTED}/demo.js`,
    ...over,
  };
}

interface Harness {
  readonly loader: PluginLoader;
  readonly manager: PluginManagerService;
}

function configure(
  opts: { trustedOrigins?: readonly string[]; moduleLoader?: PluginModuleLoader | 'omit' } = {},
): Harness {
  TestBed.resetTestingModule();
  const providers =
    opts.moduleLoader === 'omit'
      ? []
      : [
          providePluginLoader({
            trustedOrigins: opts.trustedOrigins ?? [TRUSTED],
            moduleLoader: opts.moduleLoader ?? okLoader,
          }),
        ];
  TestBed.configureTestingModule({ providers });
  return { loader: TestBed.inject(PluginLoader), manager: TestBed.inject(PluginManagerService) };
}

describe('PluginLoader', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  });
  afterEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  });

  it('loads + installs a plugin from a trusted origin', async () => {
    const h = configure();
    const res = await h.loader.load(manifest());
    expect(res.ok).toBe(true);
    const m = h.manager.plugins().find((p) => p.id === 'com.acme.demo');
    expect(m).toBeDefined();
    expect(m?.source).toBe('external');
    expect(m?.installed).toBe(true);
  });

  it('falls back to manifest display metadata when the plugin omits it', async () => {
    const h = configure();
    await h.loader.load(manifest({ description: 'From manifest', icon: 'star', category: 'tool' }));
    const m = h.manager.plugins().find((p) => p.id === 'com.acme.demo');
    expect(m?.description).toBe('From manifest');
    expect(m?.icon).toBe('star');
    expect(m?.category).toBe('tool');
  });

  it('refuses an entry from a non-allowlisted origin', async () => {
    const h = configure({ trustedOrigins: ['https://other.example'] });
    const res = await h.loader.load(manifest());
    expect(res.ok).toBe(false);
    expect(res.error).toContain('allowlist');
    expect(h.manager.plugins().some((p) => p.id === 'com.acme.demo')).toBe(false);
  });

  it('refuses a major apiVersion mismatch before loading any code', async () => {
    let loaded = false;
    const h = configure({
      moduleLoader: () => {
        loaded = true;
        return Promise.resolve({ default: FAKE_PLUGIN });
      },
    });
    const res = await h.loader.load(manifest({ apiVersion: '2.0.0' }));
    expect(res.ok).toBe(false);
    expect(res.error).toContain('host is');
    expect(loaded).toBe(false); // gate fired before fetch
  });

  it('refuses an invalid manifest', async () => {
    const h = configure();
    const res = await h.loader.load(manifest({ entry: 'not-a-url' }));
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Invalid manifest');
  });

  it('refuses when the loaded plugin id does not match the manifest', async () => {
    const h = configure();
    const res = await h.loader.load(manifest({ id: 'com.acme.other' }));
    expect(res.ok).toBe(false);
    expect(res.error).toContain('does not match manifest id');
  });

  it('surfaces an error when the module loader throws', async () => {
    const h = configure({ moduleLoader: () => Promise.reject(new Error('network boom')) });
    const res = await h.loader.load(manifest());
    expect(res.ok).toBe(false);
    expect(res.error).toContain('network boom');
  });

  it('is fail-closed when nothing is configured', async () => {
    const h = configure({ moduleLoader: 'omit' });
    expect(h.loader.isEnabled).toBe(false);
    const res = await h.loader.load(manifest());
    expect(res.ok).toBe(false);
    expect(res.error).toContain('allowlist');
  });

  it('reports "not configured" when origins are set but no module loader', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: SVGE_PLUGIN_TRUSTED_ORIGINS, useValue: [TRUSTED] }],
    });
    const loader = TestBed.inject(PluginLoader);
    const res = await loader.load(manifest());
    expect(res.ok).toBe(false);
    expect(res.error).toContain('not configured');
  });

  it('isOriginTrusted + isEnabled reflect the configured allowlist', () => {
    const h = configure();
    expect(h.loader.isEnabled).toBe(true);
    expect(h.loader.isOriginTrusted(`${TRUSTED}/x.js`)).toBe(true);
    expect(h.loader.isOriginTrusted('https://evil.example/x.js')).toBe(false);
    expect(h.loader.isOriginTrusted('not-a-url')).toBe(false);
  });
});

describe('PluginLoader.loadFromManifestUrl (D-099)', () => {
  const MANIFEST_URL = `${TRUSTED}/demo/plugin.json`;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  });

  /** Stub global fetch with a single canned response. */
  function stubFetch(impl: (url: string) => Partial<Response> & { json?: () => Promise<unknown> }) {
    vi.stubGlobal('fetch', (input: string) => Promise.resolve(impl(input) as Response));
  }

  it('fetches the manifest then loads + installs the plugin', async () => {
    const h = configure();
    stubFetch(() => ({ ok: true, status: 200, json: () => Promise.resolve(manifest()) }));
    const res = await h.loader.loadFromManifestUrl(MANIFEST_URL);
    expect(res.ok).toBe(true);
    expect(h.manager.plugins().some((p) => p.id === 'com.acme.demo')).toBe(true);
  });

  it('refuses a manifest URL whose origin is not trusted — without fetching', async () => {
    const h = configure();
    let fetched = false;
    stubFetch(() => {
      fetched = true;
      return { ok: true, status: 200, json: () => Promise.resolve(manifest()) };
    });
    const res = await h.loader.loadFromManifestUrl('https://evil.example/plugin.json');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('allowlist');
    expect(fetched).toBe(false); // fail-closed BEFORE the network call
  });

  it('fails when the loader is not configured (no module loader)', async () => {
    const h = configure({ moduleLoader: 'omit' });
    const res = await h.loader.loadFromManifestUrl(MANIFEST_URL);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('not configured');
  });

  it('surfaces an HTTP error from the manifest fetch', async () => {
    const h = configure();
    stubFetch(() => ({ ok: false, status: 404, json: () => Promise.resolve({}) }));
    const res = await h.loader.loadFromManifestUrl(MANIFEST_URL);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('404');
  });

  it('surfaces invalid JSON in the manifest body', async () => {
    const h = configure();
    stubFetch(() => ({
      ok: true,
      status: 200,
      json: () => Promise.reject(new Error('Unexpected token')),
    }));
    const res = await h.loader.loadFromManifestUrl(MANIFEST_URL);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('not valid JSON');
  });

  it('still gates the entry origin via load() even when the manifest URL is trusted', async () => {
    const h = configure();
    // Manifest fetched from a trusted origin, but its entry points elsewhere.
    stubFetch(
      () =>
        ({
          ok: true,
          status: 200,
          json: () => Promise.resolve(manifest({ entry: 'https://evil.example/x.js' })),
        }) as Partial<Response>,
    );
    const res = await h.loader.loadFromManifestUrl(MANIFEST_URL);
    expect(res.ok).toBe(false);
    expect(res.error).toContain('allowlist');
  });
});
