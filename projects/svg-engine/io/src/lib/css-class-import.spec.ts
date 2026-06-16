import { describe, expect, it } from 'vitest';
import type { SvgNode } from 'svg-engine/core';
import { CssStyleSheet } from './css-style-resolver';
import { svgImporter } from './svg-importer';

/**
 * **D-112 — CSS class / `<style>` stylesheet resolution on import.**
 *
 * Real-world SVGs from CorelDRAW / Illustrator / Inkscape paint via CSS
 * *classes* in a document `<style>` block (`.fil0 { fill: #4E6E80 }`)
 * instead of inline `fill=`. Before D-112 the importer ignored both the
 * `class` attribute and the `<style>` sheet, so every such shape imported
 * with an undefined fill and rendered as the SVG default (black) — the
 * file looked "empty". These specs lock in: (1) class/type/universal
 * selectors resolve, (2) the CSS cascade is honoured (presentation attr <
 * author rule < inline style), and (3) the {@link CssStyleSheet}
 * resolver's specificity + source-order tiebreaks.
 */

const skip = typeof DOMParser === 'undefined';

function importSvg(xml: string): SvgNode {
  const result = svgImporter.import(xml);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.document.root.children[0]!;
}

/** Parse a fragment of SVG and return the first element matching `selector`. */
function elementFrom(svg: string, selector: string): Element {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const el = doc.querySelector(selector);
  if (el === null) throw new Error(`no element matched ${selector}`);
  return el;
}

describe('D-112 — class-based paint imports with correct fills', () => {
  it('resolves a CorelDRAW-style class fill (the "empty file" bug)', () => {
    if (skip) return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <defs><style type="text/css">.fil0 { fill: #4E6E80 }</style></defs>
        <path class="fil0" d="M0 0 L10 0 L10 10 Z" />
      </svg>`;
    const path = importSvg(xml);
    expect(path.style.fill).toBe('#4E6E80');
  });

  it('resolves class fills delivered inside a CDATA <style> block', () => {
    if (skip) return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <defs><style type="text/css"><![CDATA[
          .fil0 { fill: #4E6E80; fill-rule: nonzero }
          .fil1 { fill: none }
        ]]></style></defs>
        <polygon class="fil0" points="0,0 10,0 10,10" />
        <rect class="fil1" x="0" y="0" width="5" height="5" />
      </svg>`;
    const result = svgImporter.import(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [polygon, rect] = result.document.root.children;
    expect(polygon!.style.fill).toBe('#4E6E80');
    // `fill: none` is a meaningful value (transparent), not "unset".
    expect(rect!.style.fill).toBe('none');
  });

  it('resolves a bare type selector (no class) — e.g. `path { fill: … }`', () => {
    if (skip) return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <style>path { fill: #123456 }</style>
        <path d="M0 0 L10 0 L10 10 Z" />
      </svg>`;
    expect(importSvg(xml).style.fill).toBe('#123456');
  });

  it('resolves a universal selector applying stroke to every shape', () => {
    if (skip) return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <style>* { stroke: #00ff00; stroke-width: 3 }</style>
        <rect x="0" y="0" width="10" height="10" />
      </svg>`;
    const rect = importSvg(xml);
    expect(rect.style.stroke).toBe('#00ff00');
    expect(rect.style.strokeWidth).toBe(3);
  });

  it('applies multiple declarations from one rule (fill + opacity + width)', () => {
    if (skip) return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <style>.c { fill: #aabbcc; stroke-width: 2; fill-opacity: 0.5 }</style>
        <rect class="c" x="0" y="0" width="10" height="10" />
      </svg>`;
    const rect = importSvg(xml);
    expect(rect.style.fill).toBe('#aabbcc');
    expect(rect.style.strokeWidth).toBe(2);
    expect(rect.style.fillOpacity).toBe(0.5);
  });

  it('inherits a group-level class fill (SVG inheritance — fill on <g>)', () => {
    if (skip) return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <style>.layer { fill: #777777 }</style>
        <g class="layer"><rect x="0" y="0" width="10" height="10" /></g>
      </svg>`;
    const group = importSvg(xml);
    expect(group.style.fill).toBe('#777777');
  });
});

describe('D-112 — CSS cascade order is honoured', () => {
  it('inline style= overrides a matching class rule (inline wins)', () => {
    if (skip) return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <style>.c { fill: red }</style>
        <rect class="c" style="fill: blue" x="0" y="0" width="10" height="10" />
      </svg>`;
    expect(importSvg(xml).style.fill).toBe('blue');
  });

  it('a class rule overrides a presentation fill= attribute (rule wins)', () => {
    if (skip) return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <style>.c { fill: green }</style>
        <rect class="c" fill="black" x="0" y="0" width="10" height="10" />
      </svg>`;
    expect(importSvg(xml).style.fill).toBe('green');
  });

  it('skips @media blocks — only flat rules paint', () => {
    if (skip) return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <style>
          @media print { .c { fill: red } }
          .c { fill: blue }
        </style>
        <rect class="c" x="0" y="0" width="10" height="10" />
      </svg>`;
    expect(importSvg(xml).style.fill).toBe('blue');
  });

  it('leaves a shape untouched when no rule matches it', () => {
    if (skip) return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <style>.other { fill: red }</style>
        <rect fill="black" x="0" y="0" width="10" height="10" />
      </svg>`;
    // Own presentation attribute survives — the unrelated rule never applies.
    expect(importSvg(xml).style.fill).toBe('black');
  });
});

describe('D-112 — CssStyleSheet resolver (specificity + source order)', () => {
  it('returns empty for an unparsed/empty sheet', () => {
    const sheet = new CssStyleSheet();
    expect(sheet.isEmpty).toBe(true);
  });

  it('strips /* comments */ and parses the remaining rule', () => {
    if (skip) return;
    const sheet = new CssStyleSheet();
    sheet.addCss('/* header */ .c { fill: #abcdef } /* trailing */');
    const el = elementFrom(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect class="c"/></svg>',
      'rect',
    );
    expect(sheet.resolve(el).get('fill')).toBe('#abcdef');
  });

  it('higher specificity wins (rect.c beats .c regardless of order)', () => {
    if (skip) return;
    const sheet = new CssStyleSheet();
    // Lower-specificity rule listed LAST — specificity must still win.
    sheet.addCss('rect.c { fill: blue } .c { fill: red }');
    const el = elementFrom(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect class="c"/></svg>',
      'rect',
    );
    expect(sheet.resolve(el).get('fill')).toBe('blue');
  });

  it('equal specificity falls back to source order (later wins)', () => {
    if (skip) return;
    const sheet = new CssStyleSheet();
    sheet.addCss('.a { fill: red } .b { fill: blue }');
    const el = elementFrom(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect class="a b"/></svg>',
      'rect',
    );
    expect(sheet.resolve(el).get('fill')).toBe('blue');
  });

  it('drops a trailing !important without corrupting the value', () => {
    if (skip) return;
    const sheet = new CssStyleSheet();
    sheet.addCss('.c { fill: #010203 !important }');
    const el = elementFrom(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect class="c"/></svg>',
      'rect',
    );
    expect(sheet.resolve(el).get('fill')).toBe('#010203');
  });

  it('treats a comma selector list as independent rules', () => {
    if (skip) return;
    const sheet = new CssStyleSheet();
    sheet.addCss('.a, .b { fill: #0a0b0c }');
    const a = elementFrom(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect class="a"/></svg>',
      'rect',
    );
    const b = elementFrom(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect class="b"/></svg>',
      'rect',
    );
    expect(sheet.resolve(a).get('fill')).toBe('#0a0b0c');
    expect(sheet.resolve(b).get('fill')).toBe('#0a0b0c');
  });
});
