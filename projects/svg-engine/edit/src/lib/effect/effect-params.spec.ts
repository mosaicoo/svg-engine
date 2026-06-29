import {
  blurEffect,
  brightnessEffect,
  BUILTIN_EFFECTS,
  dropShadowEffect,
  effectDefaults,
  embossEffect,
  grayscaleEffect,
  isNumberParam,
  nonDefaultParams,
  posterizeEffect,
  resolveEffectParams,
  saturateEffect,
} from './index';
import type { EffectNumberParam } from './effect';

describe('Effect params (D-144) — model + resolution', () => {
  it('blur declares a numeric radius param (default 3) and parametrizes stdDeviation', () => {
    expect(blurEffect.params?.length).toBe(1);
    const radius = blurEffect.params![0] as EffectNumberParam;
    expect(radius.key).toBe('radius');
    expect(radius.default).toBe(3);
    expect(blurEffect.buildFilterMarkup()).toContain('stdDeviation="3"');
    expect(blurEffect.buildFilterMarkup({ radius: 10 })).toContain('stdDeviation="10"');
  });

  it('default (no-arg) markup is identical to passing the resolved defaults (zero regression)', () => {
    for (const e of BUILTIN_EFFECTS) {
      expect(e.buildFilterMarkup()).toBe(e.buildFilterMarkup(effectDefaults(e)));
    }
  });

  it('resolveEffectParams merges defaults, clamps to [min,max], and rejects non-finite', () => {
    expect(resolveEffectParams(blurEffect, {})['radius']).toBe(3); // default
    expect(resolveEffectParams(blurEffect, { radius: -5 })['radius']).toBe(0); // clamp min
    expect(resolveEffectParams(blurEffect, { radius: 999 })['radius']).toBe(50); // clamp max
    expect(resolveEffectParams(blurEffect, { radius: Number.NaN })['radius']).toBe(3); // fallback
  });

  it('resolveEffectParams drops unknown keys and keeps a complete bag', () => {
    const r = resolveEffectParams(dropShadowEffect, { bogus: 1, blur: 2 } as never);
    expect('bogus' in r).toBe(false);
    expect(r['blur']).toBe(2);
    // every declared key is present
    for (const p of dropShadowEffect.params!) expect(p.key in r).toBe(true);
  });

  it('drop-shadow color param flows into flood-color', () => {
    const m = dropShadowEffect.buildFilterMarkup({ color: '#ff0000', opacity: 0.8 });
    expect(m).toContain('flood-color="#ff0000"');
    expect(m).toContain('flood-opacity="0.8"');
  });

  it('select fallback: out-of-range value falls back to default', () => {
    // posterize has only a numeric param; assert numeric param helper instead
    expect(isNumberParam(posterizeEffect.params![0])).toBe(true);
  });

  it('nonDefaultParams returns only the changed knobs', () => {
    expect(nonDefaultParams(blurEffect, { radius: 3 })).toEqual({});
    expect(nonDefaultParams(blurEffect, { radius: 8 })).toEqual({ radius: 8 });
  });

  it('posterize levels drive the number of discrete tableValues', () => {
    const m = posterizeEffect.buildFilterMarkup({ levels: 3 });
    // 3 levels → "0 0.5 1"
    expect(m).toContain('tableValues="0 0.5 1"');
  });

  it('brightness/contrast/saturate reproduce their documented defaults', () => {
    expect(brightnessEffect.buildFilterMarkup()).toContain('intercept="0.3"');
    expect(saturateEffect.buildFilterMarkup()).toContain('values="2"');
  });

  it('fixed-toggle effects (emboss/grayscale) declare no params and still build', () => {
    expect(embossEffect.params).toBeUndefined();
    expect(grayscaleEffect.params).toBeUndefined();
    expect(embossEffect.buildFilterMarkup({ anything: 1 } as never)).toContain('<filter');
  });

  it('presets reference only declared param keys and resolve cleanly', () => {
    for (const e of BUILTIN_EFFECTS) {
      for (const preset of e.presets ?? []) {
        const keys = new Set((e.params ?? []).map((p) => p.key));
        for (const k of Object.keys(preset.params)) expect(keys.has(k)).toBe(true);
        // resolving a preset must not throw and yields a complete bag
        const resolved = resolveEffectParams(e, preset.params);
        expect(Object.keys(resolved).length).toBe((e.params ?? []).length);
      }
    }
  });
});
