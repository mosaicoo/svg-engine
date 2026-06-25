import type { GroupNode, PathNode, SvgNode } from '@mosaicoo/svg-engine/core';
import { describe, expect, it } from 'vitest';

import { svgImporter } from './svg-importer';

/**
 * **D-102 — the imported root group must mirror the `<svg>`'s own style, not
 * `createGroup`'s `DEFAULT_STYLE` fallback.**
 *
 * Regression: a fill-only document (e.g. CorelDRAW export — shapes painted via
 * CSS classes, no `stroke` anywhere) imported with a root `<g>` carrying
 * `DEFAULT_STYLE` (`stroke:#333333`, `fill:#cccccc`). SVG `stroke` is inherited,
 * so every child without its own stroke rendered with a spurious dark border —
 * a black outline absent in the source and in other renderers.
 */

const skip = typeof DOMParser === 'undefined';

function importDoc(xml: string) {
  const r = svgImporter.import(xml);
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error);
  return r.document;
}

describe('D-102 — imported root group style', () => {
  it('a fill-only SVG (no stroke) gives a root group with NO stroke/fill (no inherited border)', () => {
    if (skip) return;
    const doc = importDoc(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
         <defs><style>.fil0 {fill:#4E6E80}</style></defs>
         <path class="fil0" d="M0 0 H10 V10 H0 Z"/>
       </svg>`,
    );
    // The root must NOT carry the editor demo defaults — those would inherit
    // a dark border + grey fill onto every stroke-less child.
    expect(doc.root.style.stroke).toBeUndefined();
    expect(doc.root.style.fill).toBeUndefined();

    // The child keeps its CSS fill and has NO stroke of its own → nothing to
    // inherit a border from.
    const child = doc.root.children[0] as PathNode;
    expect(child.type).toBe('path');
    expect(child.style.fill).toBe('#4E6E80');
    expect(child.style.stroke).toBeUndefined();
  });

  it('the root group reflects fill/stroke actually declared on the <svg>', () => {
    if (skip) return;
    const doc = importDoc(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" fill="#123456" stroke="#abcdef">
         <rect x="0" y="0" width="10" height="10"/>
       </svg>`,
    );
    expect(doc.root.style.fill).toBe('#123456');
    expect(doc.root.style.stroke).toBe('#abcdef');
  });

  it('no node in a fill-only import carries the #333333 default stroke', () => {
    if (skip) return;
    const doc = importDoc(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
         <defs><style>.a {fill:#4E6E80} .b {fill:none}</style></defs>
         <g><path class="a" d="M0 0 H10 V10 Z"/><path class="b" d="M1 1 H9 V9 Z"/></g>
       </svg>`,
    );
    const strokes: (string | undefined)[] = [];
    const visit = (n: SvgNode): void => {
      strokes.push(n.style.stroke);
      if (n.type === 'group') (n as GroupNode).children.forEach(visit);
    };
    visit(doc.root);
    expect(strokes.some((s) => s === '#333333')).toBe(false);
  });
});
