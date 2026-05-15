import { TestBed } from '@angular/core/testing';
import { type Disposable, type EditorPlugin, PLUGIN_API_VERSION } from './plugin';
import { PluginRegistry } from './plugin-registry.service';

function setup() {
  TestBed.configureTestingModule({});
  return TestBed.inject(PluginRegistry);
}

function makePlugin(overrides: Partial<EditorPlugin> = {}): EditorPlugin {
  return {
    id: 'test.plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    install: () => undefined,
    ...overrides,
  };
}

function disp(spy: () => void): Disposable {
  return { dispose: spy };
}

describe('PluginRegistry — install', () => {
  it('starts with no installed plugins', () => {
    const reg = setup();
    expect(reg.list()).toEqual([]);
    expect(reg.has('any')).toBe(false);
  });

  it('installs a plugin and exposes it via list/has/get', () => {
    const reg = setup();
    const p = makePlugin({ id: 'a' });
    const installed = reg.install(p);
    expect(installed.plugin).toBe(p);
    expect(reg.has('a')).toBe(true);
    expect(reg.get('a')?.plugin).toBe(p);
    expect(reg.list().length).toBe(1);
  });

  it('throws on duplicate id', () => {
    const reg = setup();
    reg.install(makePlugin({ id: 'a' }));
    expect(() => reg.install(makePlugin({ id: 'a' }))).toThrow(/already installed/);
  });

  it('throws on empty/non-string id', () => {
    const reg = setup();
    expect(() => reg.install(makePlugin({ id: '' }))).toThrow();
  });

  it('throws on major-version mismatch with PLUGIN_API_VERSION', () => {
    const reg = setup();
    const wrongMajor = `${Number(PLUGIN_API_VERSION.split('.')[0]) + 1}.0.0`;
    expect(() => reg.install(makePlugin({ apiVersion: wrongMajor }))).toThrow(/API v/);
  });

  it('accepts minor/patch differences within the same major', () => {
    const reg = setup();
    expect(() => reg.install(makePlugin({ apiVersion: '1.99.99' }))).not.toThrow();
  });

  it('throws on missing dependency', () => {
    const reg = setup();
    expect(() => reg.install(makePlugin({ id: 'a', dependencies: ['missing.dep'] }))).toThrow(
      /requires "missing.dep"/,
    );
  });

  it('install order honors dependencies', () => {
    const reg = setup();
    reg.install(makePlugin({ id: 'base' }));
    expect(() => reg.install(makePlugin({ id: 'derived', dependencies: ['base'] }))).not.toThrow();
  });

  it('rolls back disposables when install() throws', () => {
    const reg = setup();
    const disposed: string[] = [];
    const d1 = disp(() => disposed.push('d1'));
    const d2 = disp(() => disposed.push('d2'));
    expect(() =>
      reg.install(
        makePlugin({
          id: 'broken',
          install: (ctx) => {
            ctx.track(d1);
            ctx.track(d2);
            throw new Error('boom');
          },
        }),
      ),
    ).toThrow(/failed during install.*boom/);
    // LIFO disposal
    expect(disposed).toEqual(['d2', 'd1']);
    expect(reg.has('broken')).toBe(false);
  });
});

describe('PluginRegistry — uninstall', () => {
  it('returns false for an unknown id (idempotent)', () => {
    const reg = setup();
    expect(reg.uninstall('nope')).toBe(false);
  });

  it('runs the uninstall hook + disposes tracked disposables in LIFO', () => {
    const reg = setup();
    const order: string[] = [];
    reg.install(
      makePlugin({
        id: 'p',
        install: (ctx) => {
          ctx.track(disp(() => order.push('first')));
          ctx.track(disp(() => order.push('second')));
        },
        uninstall: () => order.push('hook'),
      }),
    );
    expect(reg.uninstall('p')).toBe(true);
    expect(order).toEqual(['hook', 'second', 'first']);
    expect(reg.has('p')).toBe(false);
  });

  it('continues cleanup even when the uninstall hook throws', () => {
    const reg = setup();
    const disposed: string[] = [];
    reg.install(
      makePlugin({
        id: 'p',
        install: (ctx) => ctx.track(disp(() => disposed.push('d'))),
        uninstall: () => {
          throw new Error('boom');
        },
      }),
    );
    // Silence the expected error.console.error

    const orig = console.error;
    console.error = () => undefined;
    try {
      expect(reg.uninstall('p')).toBe(true);
    } finally {
      console.error = orig;
    }
    expect(disposed).toEqual(['d']);
  });

  it('continues disposing other entries when one disposable throws', () => {
    const reg = setup();
    const disposed: string[] = [];
    reg.install(
      makePlugin({
        id: 'p',
        install: (ctx) => {
          ctx.track(disp(() => disposed.push('a')));
          ctx.track(
            disp(() => {
              throw new Error('bad');
            }),
          );
          ctx.track(disp(() => disposed.push('c')));
        },
      }),
    );
    const orig = console.error;
    console.error = () => undefined;
    try {
      reg.uninstall('p');
    } finally {
      console.error = orig;
    }
    // c (top of stack) → bad (throws but caught) → a
    expect(disposed).toEqual(['c', 'a']);
  });

  it('reactive `installed` signal updates on install + uninstall', () => {
    const reg = setup();
    expect(reg.installed().length).toBe(0);
    reg.install(makePlugin({ id: 'a' }));
    expect(reg.installed().length).toBe(1);
    reg.install(makePlugin({ id: 'b' }));
    expect(reg.installed().length).toBe(2);
    reg.uninstall('a');
    expect(reg.installed().map((i) => i.plugin.id)).toEqual(['b']);
  });
});

describe('PluginRegistry — PluginContext API', () => {
  it('passes pluginId + injector + track to install()', () => {
    const reg = setup();
    let received: { id: string; hasInjector: boolean; tracked: boolean } | null = null;
    reg.install(
      makePlugin({
        id: 'inspect-ctx',
        install: (ctx) => {
          const d = ctx.track(disp(() => undefined));
          received = {
            id: ctx.pluginId,
            hasInjector: typeof ctx.injector.get === 'function',
            tracked: d !== null,
          };
        },
      }),
    );
    expect(received).toEqual({ id: 'inspect-ctx', hasInjector: true, tracked: true });
  });

  it('track() returns the same disposable instance (chainable)', () => {
    const reg = setup();
    const d = disp(() => undefined);
    let returned: Disposable | null = null;
    reg.install(
      makePlugin({
        id: 'chain',
        install: (ctx) => {
          returned = ctx.track(d);
        },
      }),
    );
    expect(returned).toBe(d);
  });
});
