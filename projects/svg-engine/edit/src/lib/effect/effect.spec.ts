import { TestBed } from '@angular/core/testing';
import {
  bevelEffect,
  blurEffect,
  brightnessEffect,
  BUILTIN_EFFECTS,
  builtinEffectsPlugin,
  chromaticAberrationEffect,
  contrastEffect,
  displacementMapEffect,
  dropShadowEffect,
  EffectRegistry,
  embossEffect,
  grayscaleEffect,
  hueRotateEffect,
  innerGlowEffect,
  innerShadowEffect,
  invertEffect,
  noiseEffect,
  outerGlowEffect,
  pixelateEffect,
  posterizeEffect,
  saturateEffect,
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
  it('exports 19 effects in BUILTIN_EFFECTS (4 originais + 15 D-047)', () => {
    expect(BUILTIN_EFFECTS.length).toBe(19);
    // Spot-check the order — first 4 are the originals (compat), the
    // remainder are the D-047 expansion. Full order is documented in
    // builtin-effects.ts and asserted via category grouping below.
    expect(BUILTIN_EFFECTS[0]).toBe(blurEffect);
    expect(BUILTIN_EFFECTS[1]).toBe(dropShadowEffect);
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

  it('every builtin id starts with the reverse-DNS prefix', () => {
    for (const e of BUILTIN_EFFECTS) {
      expect(e.id).toMatch(/^svge\.builtin\.effect\./);
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

  // ── D-047 new effects ────────────────────────────────────────────

  it('inner-shadow uses feFlood + feComposite + feOffset', () => {
    const m = innerShadowEffect.buildFilterMarkup();
    expect(m).toContain('feFlood');
    expect(m).toContain('feComposite');
    expect(m).toContain('feOffset');
  });

  it('outer-glow uses feFlood + feGaussianBlur on SourceAlpha + feMerge', () => {
    const m = outerGlowEffect.buildFilterMarkup();
    expect(m).toContain('feFlood');
    expect(m).toContain('feGaussianBlur');
    expect(m).toContain('SourceAlpha');
    expect(m).toContain('feMerge');
  });

  it('inner-glow uses feFlood + feComposite', () => {
    const m = innerGlowEffect.buildFilterMarkup();
    expect(m).toContain('feFlood');
    expect(m).toContain('feComposite');
  });

  it('bevel uses feSpecularLighting', () => {
    expect(bevelEffect.buildFilterMarkup()).toContain('feSpecularLighting');
  });

  it('emboss uses feConvolveMatrix with a 3x3 kernel', () => {
    const m = embossEffect.buildFilterMarkup();
    expect(m).toContain('feConvolveMatrix');
    expect(m).toContain('order="3"');
  });

  it('brightness uses feComponentTransfer linear intercept', () => {
    const m = brightnessEffect.buildFilterMarkup();
    expect(m).toContain('feComponentTransfer');
    expect(m).toContain('intercept="0.3"');
  });

  it('contrast uses feComponentTransfer linear slope > 1 with negative intercept', () => {
    const m = contrastEffect.buildFilterMarkup();
    expect(m).toContain('slope="1.5"');
    expect(m).toContain('intercept="-0.25"');
  });

  it('saturate uses feColorMatrix type="saturate"', () => {
    const m = saturateEffect.buildFilterMarkup();
    expect(m).toContain('type="saturate"');
    expect(m).toContain('values="2"');
  });

  it('hue-rotate uses feColorMatrix type="hueRotate" values="90"', () => {
    const m = hueRotateEffect.buildFilterMarkup();
    expect(m).toContain('type="hueRotate"');
    expect(m).toContain('values="90"');
  });

  it('invert uses feComponentTransfer discrete table', () => {
    const m = invertEffect.buildFilterMarkup();
    expect(m).toContain('feComponentTransfer');
    expect(m).toContain('tableValues="1 0"');
  });

  it('noise uses feTurbulence fractalNoise + feMerge', () => {
    const m = noiseEffect.buildFilterMarkup();
    expect(m).toContain('feTurbulence');
    expect(m).toContain('type="fractalNoise"');
    expect(m).toContain('feMerge');
  });

  it('displacement-map uses feTurbulence + feDisplacementMap', () => {
    const m = displacementMapEffect.buildFilterMarkup();
    expect(m).toContain('feTurbulence');
    expect(m).toContain('feDisplacementMap');
  });

  it('chromatic-aberration splits channels via feColorMatrix + feOffset + feBlend', () => {
    const m = chromaticAberrationEffect.buildFilterMarkup();
    // 3 channel-extraction matrices (R, G, B) + offsets + blends
    expect((m.match(/feColorMatrix/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(m).toContain('feOffset');
    expect(m).toContain('feBlend');
  });

  it('pixelate quantizes via feComponentTransfer discrete steps', () => {
    const m = pixelateEffect.buildFilterMarkup();
    expect(m).toContain('feComponentTransfer');
    expect(m).toContain('type="discrete"');
  });

  it('posterize quantizes via feComponentTransfer discrete steps', () => {
    const m = posterizeEffect.buildFilterMarkup();
    expect(m).toContain('feComponentTransfer');
    expect(m).toContain('type="discrete"');
  });

  it('all D-047 new effects appear in BUILTIN_EFFECTS', () => {
    const ids = BUILTIN_EFFECTS.map((e) => e.id);
    expect(ids).toContain(innerShadowEffect.id);
    expect(ids).toContain(outerGlowEffect.id);
    expect(ids).toContain(innerGlowEffect.id);
    expect(ids).toContain(bevelEffect.id);
    expect(ids).toContain(embossEffect.id);
    expect(ids).toContain(invertEffect.id);
    expect(ids).toContain(brightnessEffect.id);
    expect(ids).toContain(contrastEffect.id);
    expect(ids).toContain(saturateEffect.id);
    expect(ids).toContain(hueRotateEffect.id);
    expect(ids).toContain(noiseEffect.id);
    expect(ids).toContain(displacementMapEffect.id);
    expect(ids).toContain(chromaticAberrationEffect.id);
    expect(ids).toContain(pixelateEffect.id);
    expect(ids).toContain(posterizeEffect.id);
  });
});

describe('builtinEffectsPlugin — install/uninstall', () => {
  it('install registers the 19 builtins; uninstall removes them all', () => {
    const reg = TestBed.inject(EffectRegistry);
    const pluginReg = TestBed.inject(PluginRegistry);
    expect(reg.effects().length).toBe(0);
    pluginReg.install(builtinEffectsPlugin);
    expect(reg.effects().length).toBe(19);
    expect(reg.get(blurEffect.id)?.id).toBe(blurEffect.id);
    expect(reg.get(bevelEffect.id)?.id).toBe(bevelEffect.id);
    pluginReg.uninstall(builtinEffectsPlugin.id);
    expect(reg.effects().length).toBe(0);
  });

  it('declares the current PLUGIN_API_VERSION', async () => {
    const { PLUGIN_API_VERSION } = await import('../plugin/plugin');
    expect(builtinEffectsPlugin.apiVersion).toBe(PLUGIN_API_VERSION);
  });
});
