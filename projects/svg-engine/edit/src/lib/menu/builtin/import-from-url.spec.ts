import { describe, expect, it } from 'vitest';
import { classifyImageUrl } from './builtin-menu-contributions.plugin';

/**
 * **D-116 — `File ▸ Import ▸ From URL…` source classification.**
 *
 * `classifyImageUrl` decides whether a fetched URL is an SVG (→ same flow as
 * `Import ▸ SVG…`) or a raster (→ embedded `<image>`). Content-Type wins; the
 * URL extension is the fallback when the server doesn't report a usable type.
 * The fetch/decode/insert path is DOM + network bound and verified manually.
 */
describe('D-116 — classifyImageUrl', () => {
  it('prefers an SVG Content-Type even when the path looks like a raster', () => {
    expect(classifyImageUrl('image/svg+xml', '/logo.png')).toBe('svg');
    expect(classifyImageUrl('image/svg+xml; charset=utf-8', '/x')).toBe('svg');
  });

  it('prefers a raster Content-Type even when the path looks like an svg', () => {
    expect(classifyImageUrl('image/png', '/drawing.svg')).toBe('raster');
    expect(classifyImageUrl('image/jpeg', '/photo')).toBe('raster');
  });

  it('falls back to the .svg extension when Content-Type is unhelpful', () => {
    expect(classifyImageUrl('', '/assets/logo.svg')).toBe('svg');
    expect(classifyImageUrl('text/plain', '/assets/logo.svg')).toBe('svg');
    expect(classifyImageUrl('application/octet-stream', '/a/b/c.SVG')).toBe('svg');
  });

  it('falls back to common raster extensions', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'ico']) {
      expect(classifyImageUrl('', `/img.${ext}`)).toBe('raster');
    }
    expect(classifyImageUrl('', '/IMG.PNG')).toBe('raster');
  });

  it('returns "unknown" when neither the type nor the extension is recognized', () => {
    expect(classifyImageUrl('', '/no-extension')).toBe('unknown');
    expect(classifyImageUrl('text/html', '/page.html')).toBe('unknown');
    expect(classifyImageUrl('', '/data.json')).toBe('unknown');
  });
});
