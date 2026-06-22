import {
  createGroup,
  createSymbolUse,
  type NodeId,
  type SvgDocument,
  type SvgNode,
  type SymbolUseNode,
} from 'svg-engine/core';
import { describe, expect, it } from 'vitest';

import { svgExporter } from './svg-exporter';
import { svgImporter } from './svg-importer';

/**
 * **D-098 — generic `<use>` import.** Previously `<use>` was dropped (default →
 * unsupported), so symbol/sprite-based art (Illustrator Symbols, icon systems)
 * imported with its `<symbol>` defs present but nothing instancing them → blank.
 * Now `<use href="#id">` becomes a {@link SymbolUseNode}; the referenced
 * `<symbol>` is preserved verbatim in `<defs>`, so it paints.
 */

const skip = typeof DOMParser === 'undefined';

function importDoc(
  xml: string,
): { ok: true; document: SvgDocument } | { ok: false; error: string } {
  return svgImporter.import(xml) as never;
}

describe('D-098 — generic <use> import', () => {
  it('maps <use href="#id"> to a SymbolUseNode (id #-stripped) with geometry', () => {
    if (skip) return;
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <defs><symbol id="star" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol></defs>
      <use href="#star" x="10" y="20" width="30" height="40"/>
    </svg>`;
    const r = importDoc(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    const node = r.document.root.children[0] as SymbolUseNode;
    expect(node.type).toBe('symbol-use');
    expect(node.symbolId).toBe('star');
    expect(node.x).toBe(10);
    expect(node.y).toBe(20);
    expect(node.width).toBe(30);
    expect(node.height).toBe(40);
    // the <symbol> definition is preserved so the <use href="#star"> resolves
    expect(r.document.defs ?? '').toContain('id="star"');
  });

  it('supports xlink:href and omitted width/height', () => {
    if (skip) return;
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" width="100" height="100">
      <defs><symbol id="s2"><circle r="5"/></symbol></defs>
      <use xlink:href="#s2" x="3" y="4"/>
    </svg>`;
    const r = importDoc(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    const node = r.document.root.children[0] as SymbolUseNode;
    expect(node.symbolId).toBe('s2');
    expect(node.width).toBeUndefined();
    expect(node.height).toBeUndefined();
  });

  it('drops a <use> with no href reference (with a warning)', () => {
    if (skip) return;
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><use x="1" y="1"/></svg>`;
    const r = importDoc(xml);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    expect(r.document.root.children.length).toBe(0);
  });

  it('round-trips through the exporter (SymbolUseNode → <use> → SymbolUseNode)', () => {
    if (skip) return;
    const node = createSymbolUse({ symbolId: 'sym', x: 1, y: 2, width: 8, height: 9 });
    const doc: SvgDocument = {
      id: 'd' as NodeId,
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
      root: createGroup([node as SvgNode], { id: 'root' as NodeId }),
    };
    const out = svgExporter.export(doc);
    if (typeof out !== 'string') throw new Error('exporter returned non-string');
    const r = importDoc(out);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    const reimported = r.document.root.children[0] as SymbolUseNode;
    expect(reimported.type).toBe('symbol-use');
    expect(reimported.symbolId).toBe('sym');
    expect(reimported.x).toBe(1);
    expect(reimported.y).toBe(2);
    expect(reimported.width).toBe(8);
    expect(reimported.height).toBe(9);
  });
});
