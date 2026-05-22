import { describe, expect, it } from 'vitest';
import {
  adjustHexLightness,
  darkenHex,
  hexToRgb,
  hslToRgb,
  lightenHex,
  parseHslFunction,
  parseRgbFunction,
  rgbToHsl,
} from './color-functions';

describe('NLU › color-functions', () => {
  describe('hexToRgb / rgbToHsl round trip', () => {
    it('parses #ff0000 → red', () => {
      expect(hexToRgb('#ff0000')).toEqual([255, 0, 0]);
    });
    it('parses #f00 short form', () => {
      expect(hexToRgb('#f00')).toEqual([255, 0, 0]);
    });
    it('ignores alpha (8 digits)', () => {
      // ff0000ff → red with alpha; we drop alpha
      expect(hexToRgb('#ff0000ff')).toEqual([255, 0, 0]);
    });
    it('returns null for invalid', () => {
      expect(hexToRgb('not a hex')).toBeNull();
      expect(hexToRgb('#zz0000')).toBeNull();
    });
    it('rgb → hsl → rgb round trip is stable (within rounding)', () => {
      const original: [number, number, number] = [200, 100, 50];
      const [h, s, l] = rgbToHsl(...original);
      const [r2, g2, b2] = hslToRgb(h, s, l);
      // Round to nearest int — HSL→RGB introduces tiny FP errors
      expect(Math.round(r2)).toBeCloseTo(original[0], 0);
      expect(Math.round(g2)).toBeCloseTo(original[1], 0);
      expect(Math.round(b2)).toBeCloseTo(original[2], 0);
    });
  });

  describe('parseRgbFunction', () => {
    it('parses rgb(255, 0, 0)', () => {
      expect(parseRgbFunction('rgb(255,0,0)')).toBe('#ff0000');
      expect(parseRgbFunction('rgb(255, 0, 0)')).toBe('#ff0000');
    });
    it('parses rgba(255, 0, 0, 0.5) ignoring alpha', () => {
      expect(parseRgbFunction('rgba(255,0,0,0.5)')).toBe('#ff0000');
    });
    it('clamps values > 255', () => {
      // CSS rgb() spec ignores negatives (regex requer \d), mas valores
      // acima de 255 são clamped pelo clamp255.
      expect(parseRgbFunction('rgb(300, 200, 128)')).toBe('#ffc880');
    });
    it('returns null for malformed', () => {
      expect(parseRgbFunction('rgb(red)')).toBeNull();
      expect(parseRgbFunction('not rgb')).toBeNull();
    });
  });

  describe('parseHslFunction', () => {
    it('parses hsl(0, 100%, 50%) → red', () => {
      expect(parseHslFunction('hsl(0,100%,50%)')).toBe('#ff0000');
    });
    it('parses hsl(120, 100%, 50%) → green', () => {
      expect(parseHslFunction('hsl(120,100%,50%)')).toBe('#00ff00');
    });
    it('parses hsl(240, 100%, 50%) → blue', () => {
      expect(parseHslFunction('hsl(240,100%,50%)')).toBe('#0000ff');
    });
    it('parses hsla with alpha, ignoring alpha', () => {
      expect(parseHslFunction('hsla(0,100%,50%,0.5)')).toBe('#ff0000');
    });
    it('normalizes hue >= 360', () => {
      expect(parseHslFunction('hsl(360,100%,50%)')).toBe('#ff0000');
    });
    it('returns null for malformed', () => {
      expect(parseHslFunction('hsl(no, percent)')).toBeNull();
    });
  });

  describe('lightenHex / darkenHex / adjustHexLightness', () => {
    it('lightenHex of #ff0000 (red, L=0.5) raises lightness', () => {
      const lighter = lightenHex('#ff0000', 0.2);
      // Lighter red → both green and blue should rise (toward pink/white)
      const [r, g, b] = hexToRgb(lighter)!;
      expect(g).toBeGreaterThan(0);
      expect(b).toBeGreaterThan(0);
      expect(r).toBeGreaterThanOrEqual(200);
    });
    it('darkenHex of #ff0000 reduces lightness', () => {
      const darker = darkenHex('#ff0000', 0.2);
      const [r] = hexToRgb(darker)!;
      expect(r).toBeLessThan(255);
    });
    it('adjustHexLightness with 0 delta returns same color', () => {
      expect(adjustHexLightness('#1e88e5', 0).toLowerCase()).toBe('#1e88e5');
    });
    it('clamps lightness to [0, 1]', () => {
      // Very high delta on already-light color stays valid
      const result = lightenHex('#ffffff', 0.5);
      expect(result.toLowerCase()).toBe('#ffffff');
      // Very negative delta on dark color stays valid
      const dark = darkenHex('#000000', 0.5);
      expect(dark.toLowerCase()).toBe('#000000');
    });
  });
});
