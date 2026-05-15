import { TestBed } from '@angular/core/testing';
import { type EditorPlugin, PLUGIN_API_VERSION } from './plugin';
import { PluginRegistry } from './plugin-registry.service';
import { provideSvgEnginePlugin } from './provide-plugin';

function makePlugin(overrides: Partial<EditorPlugin> = {}): EditorPlugin {
  return {
    id: 'provider.test',
    name: 'Provider Test',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    install: () => undefined,
    ...overrides,
  };
}

describe('provideSvgEnginePlugin', () => {
  it('installs the plugin into PluginRegistry on TestBed bootstrap', () => {
    const installSpy = vi.fn();
    const plugin = makePlugin({ id: 'auto-install', install: installSpy });
    TestBed.configureTestingModule({
      providers: [provideSvgEnginePlugin(plugin)],
    });
    const reg = TestBed.inject(PluginRegistry);
    expect(reg.has('auto-install')).toBe(true);
    expect(installSpy).toHaveBeenCalledTimes(1);
  });

  it('multiple providers install in declaration order (deps first)', () => {
    const order: string[] = [];
    TestBed.configureTestingModule({
      providers: [
        provideSvgEnginePlugin(makePlugin({ id: 'base', install: () => order.push('base') })),
        provideSvgEnginePlugin(
          makePlugin({
            id: 'derived',
            dependencies: ['base'],
            install: () => order.push('derived'),
          }),
        ),
      ],
    });
    const reg = TestBed.inject(PluginRegistry);
    expect(order).toEqual(['base', 'derived']);
    expect(reg.list().map((i) => i.plugin.id)).toEqual(['base', 'derived']);
  });
});
