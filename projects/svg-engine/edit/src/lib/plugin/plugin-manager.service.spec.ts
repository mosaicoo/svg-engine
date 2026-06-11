import { TestBed } from '@angular/core/testing';
import { type EditorPlugin, PLUGIN_API_VERSION } from './plugin';
import { PluginCatalog } from './plugin-catalog.service';
import { PluginManagerService } from './plugin-manager.service';
import { PluginRegistry } from './plugin-registry.service';
import { PluginStateStore } from './plugin-state-store.service';
import { provideSvgEnginePlugin } from './provide-plugin';

const STORAGE_KEY = 'svge:plugins:state';

function makePlugin(overrides: Partial<EditorPlugin> = {}): EditorPlugin {
  return {
    id: 'mgr.test',
    name: 'Manager Test',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    install: () => undefined,
    ...overrides,
  };
}

interface Harness {
  readonly manager: PluginManagerService;
  readonly registry: PluginRegistry;
  readonly catalog: PluginCatalog;
  readonly state: PluginStateStore;
}

function configure(plugins: readonly EditorPlugin[] = []): Harness {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: plugins.map((p) => provideSvgEnginePlugin(p)),
  });
  // Injecting forces the environment injector to run ENVIRONMENT_INITIALIZER
  // (catalog register + boot install for enabled plugins).
  const manager = TestBed.inject(PluginManagerService);
  return {
    manager,
    registry: TestBed.inject(PluginRegistry),
    catalog: TestBed.inject(PluginCatalog),
    state: TestBed.inject(PluginStateStore),
  };
}

function manifestOf(h: Harness, id: string) {
  return h.manager.plugins().find((p) => p.id === id);
}

describe('PluginManagerService', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  });
  afterEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  });

  it('lists provided plugins as enabled + installed internal manifests', () => {
    const h = configure([makePlugin({ id: 'a' })]);
    const m = manifestOf(h, 'a');
    expect(m).toBeDefined();
    expect(m?.enabled).toBe(true);
    expect(m?.installed).toBe(true);
    expect(m?.source).toBe('internal');
    expect(m?.error).toBeNull();
  });

  it('carries display metadata and defaults category to "other"', () => {
    const h = configure([
      makePlugin({
        id: 'meta',
        description: 'Does things',
        author: 'Acme',
        icon: 'star',
        category: 'tool',
      }),
      makePlugin({ id: 'bare' }),
    ]);
    const meta = manifestOf(h, 'meta');
    expect(meta?.description).toBe('Does things');
    expect(meta?.author).toBe('Acme');
    expect(meta?.icon).toBe('star');
    expect(meta?.category).toBe('tool');
    expect(manifestOf(h, 'bare')?.category).toBe('other');
  });

  it('disable uninstalls + persists; enable re-installs', () => {
    const h = configure([makePlugin({ id: 'a' })]);

    const off = h.manager.disable('a');
    expect(off.ok).toBe(true);
    expect(h.registry.has('a')).toBe(false);
    expect(h.state.isDisabled('a')).toBe(true);
    expect(manifestOf(h, 'a')?.enabled).toBe(false);
    expect(manifestOf(h, 'a')?.installed).toBe(false);

    const on = h.manager.enable('a');
    expect(on.ok).toBe(true);
    expect(h.registry.has('a')).toBe(true);
    expect(manifestOf(h, 'a')?.enabled).toBe(true);
    expect(manifestOf(h, 'a')?.installed).toBe(true);
  });

  it('skips install() at boot for a persisted-disabled plugin (but still catalogs it)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, disabled: ['a'] }));
    const installSpy = vi.fn();
    const h = configure([makePlugin({ id: 'a', install: installSpy })]);
    expect(installSpy).not.toHaveBeenCalled();
    expect(h.registry.has('a')).toBe(false);
    // Still known to the manager, shown as disabled.
    const m = manifestOf(h, 'a');
    expect(m).toBeDefined();
    expect(m?.enabled).toBe(false);
    expect(m?.installed).toBe(false);
  });

  it('blocks disabling a plugin that enabled plugins depend on', () => {
    const h = configure([
      makePlugin({ id: 'base' }),
      makePlugin({ id: 'derived', dependencies: ['base'] }),
    ]);
    expect(h.manager.enabledDependentsOf('base')).toEqual(['derived']);
    const res = h.manager.disable('base');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('derived');
    // Untouched — base still installed.
    expect(h.registry.has('base')).toBe(true);
    expect(h.state.isDisabled('base')).toBe(false);
  });

  it('rejects uninstalling an internal plugin', () => {
    const h = configure([makePlugin({ id: 'a' })]);
    expect(h.manager.canUninstall('a')).toBe(false);
    const res = h.manager.uninstall('a');
    expect(res.ok).toBe(false);
    expect(h.registry.has('a')).toBe(true);
  });

  it('installs then uninstalls an external plugin', () => {
    const h = configure([]);
    const ext = makePlugin({ id: 'ext' });
    const installed = h.manager.installExternal(ext);
    expect(installed.ok).toBe(true);
    expect(h.manager.canUninstall('ext')).toBe(true);
    const m = manifestOf(h, 'ext');
    expect(m?.source).toBe('external');
    expect(m?.installed).toBe(true);

    const removed = h.manager.uninstall('ext');
    expect(removed.ok).toBe(true);
    expect(h.catalog.has('ext')).toBe(false);
    expect(h.registry.has('ext')).toBe(false);
    expect(manifestOf(h, 'ext')).toBeUndefined();
  });

  it('installExternal refuses to shadow an existing id', () => {
    const h = configure([makePlugin({ id: 'a' })]);
    const res = h.manager.installExternal(makePlugin({ id: 'a' }));
    expect(res.ok).toBe(false);
    expect(h.manager.canUninstall('a')).toBe(false); // still internal
  });

  it('surfaces a runtime install error via the manifest (no crash)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, disabled: ['boom'] }));
    const h = configure([
      makePlugin({
        id: 'boom',
        install: () => {
          throw new Error('install blew up');
        },
      }),
    ]);
    const res = h.manager.enable('boom');
    expect(res.ok).toBe(false);
    expect(res.error).toContain('install blew up');
    const m = manifestOf(h, 'boom');
    expect(m?.enabled).toBe(true); // preference stays on
    expect(m?.installed).toBe(false); // but it isn't live
    expect(m?.error).toContain('install blew up');
  });
});
