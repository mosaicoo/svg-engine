import { describe, expect, it } from 'vitest';
import { interpolateValue, mixColor, parseColor } from './interpolate';

describe('interpolateValue', () => {
  it('lerps numbers', () => {
    expect(interpolateValue(0, 100, 0.5)).toBe(50);
    expect(interpolateValue(10, 20, 0)).toBe(10);
    expect(interpolateValue(10, 20, 1)).toBe(20);
  });

  it('mixes hex colors per channel', () => {
    expect(interpolateValue('#000000', '#ffffff', 0.5)).toBe('rgb(128, 128, 128)');
    expect(interpolateValue('#ff0000', '#0000ff', 0.5)).toBe('rgb(128, 0, 128)');
  });

  it('parses 3-digit hex and rgb()', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('rgb(10, 20, 30)')).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
  });

  it('emits rgba(...) when the blended alpha is < 1', () => {
    expect(mixColor('#ff000000', '#ff0000ff', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('holds discretely for unparseable colors and mixed kinds', () => {
    expect(parseColor('red')).toBeNull();
    expect(interpolateValue('red', 'blue', 0.4)).toBe('red'); // t < 1 → from
    expect(interpolateValue('red', 'blue', 1)).toBe('blue'); // t >= 1 → to
    expect(interpolateValue(5, '#fff', 0.5)).toBe(5); // mixed kinds → from
  });
});
