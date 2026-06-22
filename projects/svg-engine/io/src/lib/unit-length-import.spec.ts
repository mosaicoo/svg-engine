import type { RectNode } from 'svg-engine/core';
import { describe, expect, it } from 'vitest';

import { svgImporter } from './svg-importer';

/**
 * **D-098 — geometry units.** `parseFloat("10mm")` was `10` (wrong: 10mm ≈
 * 37.8px) and `"50%"` became a bogus `50` user units, silently. The importer
 * now converts absolute CSS units (px/pt/pc/in/cm/mm/Q) at 96dpi and emits a
 * warning for `%` / relative units it can't resolve to user units.
 */

const skip = typeof DOMParser === 'undefined';

function importRect(attrs: string): { rect: RectNode; warnings: readonly string[] } {
  const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000"><rect ${attrs}/></svg>`;
  const r = svgImporter.import(xml);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error);
  return { rect: r.document.root.children[0] as RectNode, warnings: r.warnings };
}

describe('D-098 — absolute unit conversion on geometry', () => {
  it('unitless and px are 1:1', () => {
    if (skip) return;
    expect(importRect('width="10"').rect.width).toBeCloseTo(10, 4);
    expect(importRect('width="10px"').rect.width).toBeCloseTo(10, 4);
  });

  it('converts pt / pc / in / cm / mm to user units (96dpi)', () => {
    if (skip) return;
    expect(importRect('width="72pt"').rect.width).toBeCloseTo(96, 3);
    expect(importRect('width="1pc"').rect.width).toBeCloseTo(16, 3);
    expect(importRect('width="1in"').rect.width).toBeCloseTo(96, 3);
    expect(importRect('width="2.54cm"').rect.width).toBeCloseTo(96, 2);
    expect(importRect('width="25.4mm"').rect.width).toBeCloseTo(96, 2);
  });
});

describe('D-098 — unresolved units warn instead of silently truncating', () => {
  it('% keeps the numeric part AND pushes a warning naming the attribute', () => {
    if (skip) return;
    const { rect, warnings } = importRect('width="50%"');
    expect(rect.width).toBe(50);
    expect(warnings.some((w) => w.includes('width') && w.includes('%'))).toBe(true);
  });

  it('relative units (em) warn', () => {
    if (skip) return;
    const { warnings } = importRect('width="2em"');
    expect(warnings.some((w) => w.includes('"em"'))).toBe(true);
  });

  it('clean numeric geometry produces no unit warnings', () => {
    if (skip) return;
    const { warnings } = importRect('x="5" y="5" width="20" height="30"');
    expect(warnings.some((w) => w.includes('not resolvable'))).toBe(false);
  });
});
