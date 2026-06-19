import { describe, expect, it } from 'vitest';
import {
  detectPageFormat,
  PAGE_FORMAT_SIZES,
  pageFormatSize,
  pageOrientationFromSize,
} from './page';

/**
 * **D-140-fix** — page format ↔ dimensions helpers. These power the
 * bidirectional sync between the Format/Orientation controls, the page
 * viewBox, and template application.
 */
describe('D-140-fix — page format ↔ dimensions helpers', () => {
  it('pageFormatSize returns the portrait base and swaps for landscape', () => {
    expect(pageFormatSize('a4', 'portrait')).toEqual({ width: 595, height: 842 });
    expect(pageFormatSize('a4', 'landscape')).toEqual({ width: 842, height: 595 });
  });

  it('pageFormatSize is null for custom (no preset)', () => {
    expect(pageFormatSize('custom', 'portrait')).toBeNull();
    expect(pageFormatSize('custom', 'landscape')).toBeNull();
  });

  it('squares are unaffected by orientation', () => {
    expect(pageFormatSize('square-1080', 'landscape')).toEqual({ width: 1080, height: 1080 });
    expect(pageFormatSize('square-2048', 'portrait')).toEqual({ width: 2048, height: 2048 });
  });

  it('pageOrientationFromSize: wider = landscape, taller/square = portrait', () => {
    expect(pageOrientationFromSize(842, 595)).toBe('landscape');
    expect(pageOrientationFromSize(595, 842)).toBe('portrait');
    expect(pageOrientationFromSize(500, 500)).toBe('portrait');
  });

  it('detectPageFormat round-trips every named format in both orientations', () => {
    for (const key of Object.keys(PAGE_FORMAT_SIZES) as (keyof typeof PAGE_FORMAT_SIZES)[]) {
      const portrait = pageFormatSize(key, 'portrait')!;
      const landscape = pageFormatSize(key, 'landscape')!;
      expect(detectPageFormat(portrait.width, portrait.height)).toBe(key);
      expect(detectPageFormat(landscape.width, landscape.height)).toBe(key);
    }
  });

  it('detectPageFormat returns custom for non-standard sizes', () => {
    expect(detectPageFormat(800, 600)).toBe('custom');
    expect(detectPageFormat(1234, 777)).toBe('custom');
  });

  it('detectPageFormat tolerates sub-pixel drift (≤0.5)', () => {
    expect(detectPageFormat(595.3, 842.4)).toBe('a4');
    expect(detectPageFormat(842.4, 595.3)).toBe('a4');
  });
});
