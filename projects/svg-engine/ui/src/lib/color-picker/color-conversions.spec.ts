import {
  formatHex,
  formatHsvAsHex,
  hsvToRgb,
  parseHex,
  parseHexToHsv,
  rgbToHsv,
} from './color-conversions';

describe('parseHex', () => {
  it('parses #rrggbb form', () => {
    expect(parseHex('#1a2b3c')).toEqual({ r: 0x1a, g: 0x2b, b: 0x3c });
  });

  it('parses uppercase', () => {
    expect(parseHex('#AABBCC')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
  });

  it('expands #rgb shorthand', () => {
    expect(parseHex('#abc')).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
  });

  it('returns null for missing #', () => {
    expect(parseHex('aabbcc')).toBeNull();
  });

  it('returns null for wrong length', () => {
    expect(parseHex('#aabb')).toBeNull();
    expect(parseHex('#aabbccdd')).toBeNull();
  });

  it('returns null for non-hex chars', () => {
    expect(parseHex('#zzzzzz')).toBeNull();
  });

  it('handles leading/trailing whitespace', () => {
    expect(parseHex('  #1a2b3c  ')).toEqual({ r: 0x1a, g: 0x2b, b: 0x3c });
  });
});

describe('formatHex', () => {
  it('formats RGB to #rrggbb lowercase', () => {
    expect(formatHex({ r: 0x1a, g: 0x2b, b: 0x3c })).toBe('#1a2b3c');
  });

  it('pads single hex digit channels', () => {
    expect(formatHex({ r: 1, g: 2, b: 3 })).toBe('#010203');
  });

  it('clamps out-of-range values', () => {
    expect(formatHex({ r: -10, g: 300, b: 128 })).toBe('#00ff80');
  });

  it('rounds float channels', () => {
    expect(formatHex({ r: 127.4, g: 127.6, b: 0 })).toBe('#7f8000');
  });
});

describe('rgbToHsv', () => {
  it('pure red → h=0, s=1, v=1', () => {
    const hsv = rgbToHsv({ r: 255, g: 0, b: 0 });
    expect(hsv.h).toBeCloseTo(0, 4);
    expect(hsv.s).toBeCloseTo(1, 4);
    expect(hsv.v).toBeCloseTo(1, 4);
  });

  it('pure green → h=120, s=1, v=1', () => {
    const hsv = rgbToHsv({ r: 0, g: 255, b: 0 });
    expect(hsv.h).toBeCloseTo(120, 4);
    expect(hsv.s).toBeCloseTo(1, 4);
    expect(hsv.v).toBeCloseTo(1, 4);
  });

  it('pure blue → h=240, s=1, v=1', () => {
    const hsv = rgbToHsv({ r: 0, g: 0, b: 255 });
    expect(hsv.h).toBeCloseTo(240, 4);
    expect(hsv.s).toBeCloseTo(1, 4);
    expect(hsv.v).toBeCloseTo(1, 4);
  });

  it('grey (r=g=b) → s=0, h=0 (undefined per spec, we return 0)', () => {
    const hsv = rgbToHsv({ r: 128, g: 128, b: 128 });
    expect(hsv.h).toBe(0);
    expect(hsv.s).toBe(0);
    expect(hsv.v).toBeCloseTo(128 / 255, 4);
  });

  it('black → all zeros', () => {
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 });
  });

  it('white → s=0, v=1', () => {
    const hsv = rgbToHsv({ r: 255, g: 255, b: 255 });
    expect(hsv.h).toBe(0);
    expect(hsv.s).toBe(0);
    expect(hsv.v).toBe(1);
  });
});

describe('hsvToRgb — round-trip', () => {
  it('h=0/s=1/v=1 → red', () => {
    expect(hsvToRgb({ h: 0, s: 1, v: 1 })).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('h=120/s=1/v=1 → green', () => {
    expect(hsvToRgb({ h: 120, s: 1, v: 1 })).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('h=240/s=1/v=1 → blue', () => {
    expect(hsvToRgb({ h: 240, s: 1, v: 1 })).toEqual({ r: 0, g: 0, b: 255 });
  });

  it('h=0/s=0/v=0 → black', () => {
    expect(hsvToRgb({ h: 0, s: 0, v: 0 })).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('h=0/s=0/v=1 → white', () => {
    expect(hsvToRgb({ h: 0, s: 0, v: 1 })).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('h wraps via modulo (h=480 == h=120)', () => {
    expect(hsvToRgb({ h: 480, s: 1, v: 1 })).toEqual({ r: 0, g: 255, b: 0 });
  });

  it('s/v outside 0..1 are clamped', () => {
    expect(hsvToRgb({ h: 0, s: 2, v: 2 })).toEqual({ r: 255, g: 0, b: 0 });
    expect(hsvToRgb({ h: 0, s: -1, v: -1 })).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('round-trip RGB → HSV → RGB for several test colours', () => {
    const samples = [
      { r: 100, g: 150, b: 200 },
      { r: 200, g: 50, b: 100 },
      { r: 255, g: 200, b: 0 },
      { r: 50, g: 50, b: 100 },
      { r: 64, g: 128, b: 192 },
    ];
    for (const rgb of samples) {
      const round = hsvToRgb(rgbToHsv(rgb));
      // ±1 tolerance for rounding (HSV→RGB does Math.round on the final step).
      expect(Math.abs(round.r - rgb.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(round.g - rgb.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(round.b - rgb.b)).toBeLessThanOrEqual(1);
    }
  });
});

describe('Convenience round-trips', () => {
  it('parseHexToHsv returns null for malformed input', () => {
    expect(parseHexToHsv('not-a-color')).toBeNull();
  });

  it('parseHexToHsv → formatHsvAsHex round-trip preserves the colour', () => {
    const samples = ['#1a2b3c', '#ff0000', '#00ff00', '#0000ff', '#808080', '#fefefe'];
    for (const hex of samples) {
      const hsv = parseHexToHsv(hex);
      expect(hsv).not.toBeNull();
      expect(formatHsvAsHex(hsv!)).toBe(hex);
    }
  });
});
