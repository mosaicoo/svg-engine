import { describe, expect, it } from 'vitest';
import { createGroup, createRect, createText } from 'svg-engine/core';
import {
  buildEmbeddedFontCss,
  collectUsedFontFamilies,
  embedUsedFonts,
  injectStyleIntoSvg,
  type FontFaceResolver,
} from './font-embed';

describe('collectUsedFontFamilies', () => {
  it('collects families from text nodes, splitting CSS lists and stripping quotes', () => {
    const root = createGroup(
      [
        createText({ x: 0, y: 0, content: 'a', fontFamily: "'My Font', Arial, sans-serif" }),
        createText({ x: 0, y: 0, content: 'b', fontFamily: 'Inter' }),
      ],
      { id: 'root' as never },
    );
    expect(collectUsedFontFamilies(root)).toEqual(['My Font', 'Arial', 'sans-serif', 'Inter']);
  });

  it('dedupes case-insensitively (first spelling wins) and ignores non-text / empty', () => {
    const root = createGroup(
      [
        createRect({ x: 0, y: 0, width: 1, height: 1 }),
        createText({ x: 0, y: 0, content: 'a', fontFamily: 'Inter' }),
        createText({ x: 0, y: 0, content: 'b', fontFamily: 'inter' }),
        createText({ x: 0, y: 0, content: 'c' /* no fontFamily */ }),
      ],
      { id: 'root' as never },
    );
    expect(collectUsedFontFamilies(root)).toEqual(['Inter']);
  });

  it('returns empty when there are no text nodes', () => {
    const root = createGroup([createRect({ x: 0, y: 0, width: 1, height: 1 })], {
      id: 'root' as never,
    });
    expect(collectUsedFontFamilies(root)).toEqual([]);
  });
});

describe('injectStyleIntoSvg', () => {
  it('inserts a <style> immediately after the opening <svg> tag', () => {
    const svg = '<svg viewBox="0 0 10 10"><rect/></svg>';
    const out = injectStyleIntoSvg(svg, '  @font-face { font-family: X; }');
    expect(out).toContain('<style type="text/css">');
    expect(out.indexOf('<style')).toBeGreaterThan(out.indexOf('<svg'));
    expect(out.indexOf('<style')).toBeLessThan(out.indexOf('<rect'));
  });

  it('is a no-op when css is empty', () => {
    const svg = '<svg></svg>';
    expect(injectStyleIntoSvg(svg, '')).toBe(svg);
  });

  it('is a no-op (no corruption) when there is no <svg> tag', () => {
    expect(injectStyleIntoSvg('<not-svg/>', '@font-face{}')).toBe('<not-svg/>');
  });
});

describe('buildEmbeddedFontCss', () => {
  it('flattens resolved @font-face blocks across families', async () => {
    const resolver: FontFaceResolver = async (family) =>
      family === 'Inter' ? ['@font-face { font-family: Inter; }'] : [];
    const css = await buildEmbeddedFontCss(['Inter', 'Arial'], resolver);
    expect(css).toBe('@font-face { font-family: Inter; }');
  });

  it('swallows a resolver that throws for one family and keeps the rest', async () => {
    const resolver: FontFaceResolver = async (family) => {
      if (family === 'Bad') throw new Error('boom');
      return [`@font-face { font-family: ${family}; }`];
    };
    const css = await buildEmbeddedFontCss(['Bad', 'Good'], resolver);
    expect(css).toBe('@font-face { font-family: Good; }');
  });
});

describe('embedUsedFonts', () => {
  it('injects resolved fonts for the families the text uses', async () => {
    const root = createGroup([createText({ x: 0, y: 0, content: 'hi', fontFamily: 'Inter' })], {
      id: 'root' as never,
    });
    const resolver: FontFaceResolver = async (family) => [
      `@font-face { font-family: '${family}'; src: url(data:font/woff2;base64,AAAA); }`,
    ];
    const out = await embedUsedFonts('<svg></svg>', root, resolver);
    expect(out).toContain('@font-face');
    expect(out).toContain("font-family: 'Inter'");
    expect(out).toContain('data:font/woff2;base64,AAAA');
  });

  it('leaves the SVG unchanged when no text / nothing resolves', async () => {
    const noText = createGroup([createRect({ x: 0, y: 0, width: 1, height: 1 })], {
      id: 'root' as never,
    });
    const resolver: FontFaceResolver = async () => [];
    expect(await embedUsedFonts('<svg></svg>', noText, resolver)).toBe('<svg></svg>');

    const withText = createGroup(
      [createText({ x: 0, y: 0, content: 'x', fontFamily: 'SystemNoFace' })],
      { id: 'root' as never },
    );
    // Resolver finds no @font-face (system font) → SVG untouched.
    expect(await embedUsedFonts('<svg></svg>', withText, resolver)).toBe('<svg></svg>');
  });
});
