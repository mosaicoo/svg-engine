import { TestBed } from '@angular/core/testing';
import { PluginRegistry } from '../plugin/plugin-registry.service';
import { builtinPalettesPlugin } from './builtin-palettes.plugin';
import type { Palette } from './palette';
import { PaletteRegistry } from './palette-registry.service';

function makePalette(over: Partial<Palette> = {}): Palette {
  return {
    id: 'test',
    name: 'Test',
    swatches: ['#ff0000', '#00ff00', '#0000ff'],
    ...over,
  };
}

describe('PaletteRegistry — basics', () => {
  it('starts empty and exposes a reactive snapshot', () => {
    const reg = TestBed.inject(PaletteRegistry);
    expect(reg.palettes()).toEqual([]);
  });

  it('register adds the palette to the snapshot in insertion order', () => {
    const reg = TestBed.inject(PaletteRegistry);
    reg.register(makePalette({ id: 'a' }));
    reg.register(makePalette({ id: 'b' }));
    expect(reg.palettes().map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('get returns the matching palette or null', () => {
    const reg = TestBed.inject(PaletteRegistry);
    reg.register(makePalette({ id: 'p1' }));
    expect(reg.get('p1')?.id).toBe('p1');
    expect(reg.get('missing')).toBeNull();
  });

  it('register returns a Disposable that removes the palette when called', () => {
    const reg = TestBed.inject(PaletteRegistry);
    const d = reg.register(makePalette({ id: 'tmp' }));
    expect(reg.get('tmp')).not.toBeNull();
    d.dispose();
    expect(reg.get('tmp')).toBeNull();
  });

  it('byCategory filters by exact match (including undefined)', () => {
    const reg = TestBed.inject(PaletteRegistry);
    reg.register(makePalette({ id: 'a', category: 'brand' }));
    reg.register(makePalette({ id: 'b', category: 'utility' }));
    reg.register(makePalette({ id: 'c' })); // no category
    expect(reg.byCategory('brand').map((p) => p.id)).toEqual(['a']);
    expect(reg.byCategory('utility').map((p) => p.id)).toEqual(['b']);
    expect(reg.byCategory(undefined).map((p) => p.id)).toEqual(['c']);
  });
});

describe('PaletteRegistry — validation', () => {
  it('throws when palette.id is empty', () => {
    const reg = TestBed.inject(PaletteRegistry);
    expect(() => reg.register(makePalette({ id: '' }))).toThrowError(/non-empty string/);
  });

  it('throws on duplicate id (configuration mistake — no silent recovery)', () => {
    const reg = TestBed.inject(PaletteRegistry);
    reg.register(makePalette({ id: 'dup' }));
    expect(() => reg.register(makePalette({ id: 'dup' }))).toThrowError(/already registered/);
  });

  it('throws when palette.swatches is empty', () => {
    const reg = TestBed.inject(PaletteRegistry);
    expect(() => reg.register(makePalette({ id: 'empty', swatches: [] }))).toThrowError(
      /at least one swatch/,
    );
  });
});

describe('builtinPalettesPlugin — installs default-greys + material + tailwind', () => {
  it('install via PluginRegistry registers all 3 built-in palettes', () => {
    const reg = TestBed.inject(PaletteRegistry);
    const pluginReg = TestBed.inject(PluginRegistry);
    pluginReg.install(builtinPalettesPlugin);
    const ids = reg.palettes().map((p) => p.id);
    expect(ids).toContain('default-greys');
    expect(ids).toContain('material-primary');
    expect(ids).toContain('tailwind-pastels');
  });

  it('uninstall via PluginRegistry removes them all (Disposable tracking)', () => {
    const reg = TestBed.inject(PaletteRegistry);
    const pluginReg = TestBed.inject(PluginRegistry);
    pluginReg.install(builtinPalettesPlugin);
    expect(reg.palettes().length).toBe(3);
    pluginReg.uninstall(builtinPalettesPlugin.id);
    expect(reg.palettes().length).toBe(0);
  });

  it('default-greys palette includes "transparent" as its first swatch', () => {
    const reg = TestBed.inject(PaletteRegistry);
    TestBed.inject(PluginRegistry).install(builtinPalettesPlugin);
    const greys = reg.get('default-greys');
    expect(greys?.swatches[0]).toBe('transparent');
  });
});
