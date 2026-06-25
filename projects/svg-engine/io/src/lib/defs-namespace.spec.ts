import {
  createGroup,
  createRect,
  createSymbolUse,
  type GroupNode,
  type RectNode,
  type SymbolUseNode,
} from '@mosaicoo/svg-engine/core';
import { describe, expect, it } from 'vitest';

import { collectDefsIds, namespaceCollidingDefs } from './defs-namespace';

/**
 * **D-101 — defs id-namespacing (cross-SVG collision fix).** When two SVGs that
 * both define `id="grad"` are merged into one document, the second's `url(#grad)`
 * resolves to the first's gradient. These specs lock the merge-time rename:
 * colliding ids (+ their refs, in defs and across the node tree) are prefixed;
 * non-colliding ids stay; single import (no collision) is a no-op.
 */

const skip = typeof DOMParser === 'undefined';

describe('collectDefsIds (D-101)', () => {
  it('collects every element id in the defs fragment', () => {
    if (skip) return;
    const ids = collectDefsIds(
      '<linearGradient id="g"><stop offset="0"/></linearGradient><filter id="f"></filter>',
    );
    expect([...ids].sort()).toEqual(['f', 'g']);
  });

  it('returns an empty set for empty / nullish input', () => {
    expect(collectDefsIds('').size).toBe(0);
    expect(collectDefsIds(undefined).size).toBe(0);
    expect(collectDefsIds(null).size).toBe(0);
  });
});

describe('namespaceCollidingDefs (D-101)', () => {
  it('no collision (empty taken) → returns inputs unchanged, empty rename map', () => {
    if (skip) return;
    const root = createGroup([createRect({ x: 0, y: 0, width: 1, height: 1 })]);
    const defs = '<linearGradient id="grad"></linearGradient>';
    const out = namespaceCollidingDefs(root, defs, new Set(), 'ns-');
    expect(out.root).toBe(root); // same reference — no churn
    expect(out.defs).toBe(defs);
    expect(out.renamed.size).toBe(0);
  });

  it('renames a colliding gradient id and rewrites the node fill url(#…)', () => {
    if (skip) return;
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 }, { style: { fill: 'url(#grad)' } });
    const root = createGroup([rect]);
    const defs = '<linearGradient id="grad"><stop offset="0" stop-color="#f00"/></linearGradient>';
    const out = namespaceCollidingDefs(root, defs, new Set(['grad']), 'ns-');
    expect(out.renamed.get('grad')).toBe('ns-grad');
    expect(out.defs).toContain('id="ns-grad"');
    expect(out.defs).not.toContain('id="grad"');
    const child = (out.root as GroupNode).children[0] as RectNode;
    expect(child.style.fill).toBe('url(#ns-grad)');
  });

  it('rewrites internal defs refs (gradient xlink:href stop-inheritance)', () => {
    if (skip) return;
    const root = createGroup([createRect({ x: 0, y: 0, width: 1, height: 1 })]);
    const defs =
      '<linearGradient id="base"><stop offset="0" stop-color="#000"/></linearGradient>' +
      '<linearGradient id="grad" xlink:href="#base" x1="0" y1="0" x2="1" y2="1"></linearGradient>';
    const out = namespaceCollidingDefs(root, defs, new Set(['base', 'grad']), 'ns-');
    expect(out.defs).toContain('id="ns-base"');
    expect(out.defs).toContain('id="ns-grad"');
    expect(out.defs).toContain('#ns-base'); // the xlink:href was rewritten
    expect(out.defs).not.toContain('"#base"');
  });

  it('renames a colliding <symbol> id and its symbol-use reference', () => {
    if (skip) return;
    const use = createSymbolUse({ symbolId: 'star', x: 0, y: 0 });
    const root = createGroup([use]);
    const defs = '<symbol id="star"><rect width="10" height="10"/></symbol>';
    const out = namespaceCollidingDefs(root, defs, new Set(['star']), 'ns-');
    expect(out.defs).toContain('id="ns-star"');
    expect((out.root as GroupNode).children[0] as SymbolUseNode).toMatchObject({
      symbolId: 'ns-star',
    });
  });

  it('leaves non-colliding ids (and their refs) untouched while renaming the collider', () => {
    if (skip) return;
    const a = createRect({ x: 0, y: 0, width: 1, height: 1 }, { style: { fill: 'url(#dup)' } });
    const b = createRect({ x: 0, y: 0, width: 1, height: 1 }, { style: { fill: 'url(#solo)' } });
    const root = createGroup([a, b]);
    const defs =
      '<linearGradient id="dup"></linearGradient><linearGradient id="solo"></linearGradient>';
    const out = namespaceCollidingDefs(root, defs, new Set(['dup']), 'ns-');
    expect(out.renamed.size).toBe(1);
    expect(out.defs).toContain('id="ns-dup"');
    expect(out.defs).toContain('id="solo"'); // untouched
    const [ra, rb] = (out.root as GroupNode).children as readonly RectNode[];
    expect(ra!.style.fill).toBe('url(#ns-dup)');
    expect(rb!.style.fill).toBe('url(#solo)'); // untouched
  });

  it('leaves a dangling ref (id not defined in defs) untouched', () => {
    if (skip) return;
    const rect = createRect(
      { x: 0, y: 0, width: 1, height: 1 },
      { style: { fill: 'url(#missing)' } },
    );
    const root = createGroup([rect]);
    // "missing" is in taken but NOT defined in defs → not a candidate to rename.
    const out = namespaceCollidingDefs(
      root,
      '<filter id="grad"></filter>',
      new Set(['missing']),
      'ns-',
    );
    expect(out.renamed.size).toBe(0);
    expect((out.root as GroupNode).children[0]).toBe(rect); // untouched reference
  });
});
