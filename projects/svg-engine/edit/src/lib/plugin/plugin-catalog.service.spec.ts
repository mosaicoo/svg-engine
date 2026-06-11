import { TestBed } from '@angular/core/testing';
import { type EditorPlugin, PLUGIN_API_VERSION } from './plugin';
import { PluginCatalog } from './plugin-catalog.service';

function makePlugin(overrides: Partial<EditorPlugin> = {}): EditorPlugin {
  return {
    id: 'cat.test',
    name: 'Catalog Test',
    version: '1.0.0',
    apiVersion: PLUGIN_API_VERSION,
    install: () => undefined,
    ...overrides,
  };
}

function setup(): PluginCatalog {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(PluginCatalog);
}

describe('PluginCatalog', () => {
  it('starts empty', () => {
    const cat = setup();
    expect(cat.entries()).toEqual([]);
    expect(cat.has('x')).toBe(false);
    expect(cat.get('x')).toBeNull();
  });

  it('register adds an entry with its source', () => {
    const cat = setup();
    const p = makePlugin({ id: 'a' });
    expect(cat.register(p, 'internal')).toBe(true);
    expect(cat.has('a')).toBe(true);
    expect(cat.get('a')).toEqual({ plugin: p, source: 'internal' });
    expect(cat.entries().length).toBe(1);
  });

  it('register is first-wins / idempotent for a duplicate id', () => {
    const cat = setup();
    const first = makePlugin({ id: 'a', name: 'First', author: 'X' });
    const second = makePlugin({ id: 'a', name: 'Second' });
    expect(cat.register(first, 'internal')).toBe(true);
    // External cannot shadow the existing internal entry.
    expect(cat.register(second, 'external')).toBe(false);
    expect(cat.get('a')?.plugin.name).toBe('First');
    expect(cat.get('a')?.source).toBe('internal');
    expect(cat.entries().length).toBe(1);
  });

  it('preserves registration order in entries()', () => {
    const cat = setup();
    cat.register(makePlugin({ id: 'a' }), 'internal');
    cat.register(makePlugin({ id: 'b' }), 'internal');
    cat.register(makePlugin({ id: 'c' }), 'external');
    expect(cat.entries().map((e) => e.plugin.id)).toEqual(['a', 'b', 'c']);
  });

  it('unregister removes an entry (and is a no-op for unknown ids)', () => {
    const cat = setup();
    cat.register(makePlugin({ id: 'a' }), 'external');
    expect(cat.unregister('a')).toBe(true);
    expect(cat.has('a')).toBe(false);
    expect(cat.unregister('ghost')).toBe(false);
  });
});
