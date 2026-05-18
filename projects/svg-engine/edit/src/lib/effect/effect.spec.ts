import { TestBed } from '@angular/core/testing';
import {
  blurEffect,
  BUILTIN_EFFECTS,
  builtinEffectsPlugin,
  dropShadowEffect,
  EffectRegistry,
  grayscaleEffect,
  sepiaEffect,
} from './index';
import { PluginRegistry } from '../plugin/plugin-registry.service';
import type { Effect } from './effect';

function makeEffect(id: string, overrides: Partial<Effect> = {}): Effect {
  return {
    id,
    name: `Effect ${id}`,
    buildFilterMarkup: () => `<filter id="${id}"></filter>`,
    ...overrides,
  };
}

describe('EffectRegistry — basics', () => {
  it('starts empty', () => {
    const reg = TestBed.inject(EffectRegistry);
    expect(reg.effects()).toEqual([]);
    expect(reg.buildAllFiltersMarkup()).toBe('');
  });

  it('register adds the effect and surfaces it via the signal', () => {
    const reg = TestBed.inject(EffectRegistry);
    reg.register(makeEffect('a'));
    reg.register(makeEffect('b'));
    expect(reg.effects().length).toBe(2);
    expect(reg.effects().map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('register returns a Disposable that removes the effect', () => {
    const reg = TestBed.inject(EffectRegistry);
    const d = reg.register(makeEffect('tmp'));
    expect(reg.get('tmp')?.id).toBe('tmp');
    d.dispose();
    expect(reg.get('tmp')).toBeNull();
  });

  it('throws on empty id and on duplicate id', () => {
    const reg = TestBed.inject(EffectRegistry);
    expect(() => reg.register(makeEffect(''))).toThrowError(/non-empty/);
    reg.register(makeEffect('dup'));
    expect(() => reg.register(makeEffect('dup'))).toThrowError(/already registered/);
  });

  it('byCategory filters correctly (incl. undefined)', () => {
    const reg = TestBed.inject(EffectRegistry);
    reg.register(makeEffect('a', { category: 'blur' }));
    reg.register(makeEffect('b', { category: 'shadow' }));
    reg.register(makeEffect('c'));
    expect(reg.byCategory('blur').map((e) => e.id)).toEqual(['a']);
    expect(reg.byCategory('shadow').map((e) => e.id)).toEqual(['b']);
    expect(reg.byCategory(undefined).map((e) => e.id)).toEqual(['c']);
  });

  it('buildAllFiltersMarkup concatenates all registered markup', () => {
    const reg = TestBed.inject(EffectRegistry);
    reg.register(makeEffect('a'));
    reg.register(makeEffect('b'));
    const markup = reg.buildAllFiltersMarkup();
    expect(markup).toContain('id="a"');
    expect(markup).toContain('id="b"');
  });
});

describe('Built-in effects — well-formed filter markup', () => {
  it('exports 4 effects in BUILTIN_EFFECTS in known order', () => {
    expect(BUILTIN_EFFECTS.length).toBe(4);
    expect(BUILTIN_EFFECTS[0]).toBe(blurEffect);
    expect(BUILTIN_EFFECTS[1]).toBe(dropShadowEffect);
    expect(BUILTIN_EFFECTS[2]).toBe(grayscaleEffect);
    expect(BUILTIN_EFFECTS[3]).toBe(sepiaEffect);
  });

  it('every builtin emits markup containing its own id', () => {
    for (const e of BUILTIN_EFFECTS) {
      const m = e.buildFilterMarkup();
      expect(m).toContain(`id="${e.id}"`);
      expect(m).toContain('<filter');
      expect(m).toContain('</filter>');
    }
  });

  it('every builtin declares a category', () => {
    for (const e of BUILTIN_EFFECTS) {
      expect(typeof e.category).toBe('string');
    }
  });

  it('blur uses feGaussianBlur', () => {
    expect(blurEffect.buildFilterMarkup()).toContain('feGaussianBlur');
  });

  it('drop-shadow uses feOffset + feMerge', () => {
    const m = dropShadowEffect.buildFilterMarkup();
    expect(m).toContain('feOffset');
    expect(m).toContain('feMerge');
  });

  it('grayscale uses feColorMatrix', () => {
    expect(grayscaleEffect.buildFilterMarkup()).toContain('feColorMatrix');
  });

  it('sepia uses feColorMatrix', () => {
    expect(sepiaEffect.buildFilterMarkup()).toContain('feColorMatrix');
  });
});

describe('builtinEffectsPlugin — install/uninstall', () => {
  it('install registers the 4 builtins; uninstall removes them all', () => {
    const reg = TestBed.inject(EffectRegistry);
    const pluginReg = TestBed.inject(PluginRegistry);
    expect(reg.effects().length).toBe(0);
    pluginReg.install(builtinEffectsPlugin);
    expect(reg.effects().length).toBe(4);
    expect(reg.get(blurEffect.id)?.id).toBe(blurEffect.id);
    pluginReg.uninstall(builtinEffectsPlugin.id);
    expect(reg.effects().length).toBe(0);
  });

  it('declares the current PLUGIN_API_VERSION', async () => {
    const { PLUGIN_API_VERSION } = await import('../plugin/plugin');
    expect(builtinEffectsPlugin.apiVersion).toBe(PLUGIN_API_VERSION);
  });
});
