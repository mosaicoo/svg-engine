import { describe, expect, it } from 'vitest';
import {
  createGroup,
  createRect,
  isLayer,
  isSmartObject,
  readCustomAttrs,
  type SvgDocument,
  type SvgNode,
  setCustomAttr,
  withLayerFlag,
  withSmartObjectFlag,
} from 'svg-engine/core';
import { svgExporter } from './svg-exporter';
import { svgImporter } from './svg-importer';

/**
 * **D-089 — Round-trip tests for custom `data-*` attributes.**
 *
 * The exporter emits one `data-<name>="<value>"` per custom attribute on
 * every node (leaf + group); the importer reads every `data-*` back
 * (except the engine-reserved `data-svge-*` namespace) into
 * `metadata.customData.svgeCustomAttrs`. A full export → re-import cycle
 * must preserve the user's attributes verbatim, and must NOT collide with
 * the layer / smart-object / page flags that share `data-svge-*`.
 */

function exportNode(children: readonly SvgNode[]): string {
  const doc: SvgDocument = {
    id: 'doc' as never,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup(children, { id: 'root' as never }),
  };
  const out = svgExporter.export(doc);
  if (typeof out !== 'string') throw new Error('svgExporter returned non-string');
  return out;
}

describe('D-089 — custom data-* attribute export', () => {
  it('emits data-<name> for each custom attr on a leaf, sorted by name', () => {
    const rect = setCustomAttr(
      setCustomAttr(createRect({ x: 0, y: 0, width: 10, height: 10 }), 'sku', 'ABC-123'),
      'category',
      'shoes',
    );
    const out = exportNode([rect]);
    expect(out).toContain('data-category="shoes"');
    expect(out).toContain('data-sku="ABC-123"');
    // deterministic order: 'category' < 'sku'
    expect(out.indexOf('data-category')).toBeLessThan(out.indexOf('data-sku'));
  });

  it('emits custom attrs on groups too', () => {
    const g = setCustomAttr(
      createGroup([createRect({ x: 0, y: 0, width: 1, height: 1 })]),
      'role',
      'card',
    );
    const out = exportNode([g]);
    expect(out).toContain('data-role="card"');
  });

  it('escapes special characters in custom attr values', () => {
    const rect = setCustomAttr(
      createRect({ x: 0, y: 0, width: 1, height: 1 }),
      'label',
      'a & b "c" <d>',
    );
    const out = exportNode([rect]);
    // Matches the exporter's shared escapeAttr: &, ", < are escaped; `>`
    // is left verbatim (legal unescaped in XML attribute values).
    expect(out).toContain('data-label="a &amp; b &quot;c&quot; &lt;d>"');
  });

  it('does not emit anything for a node with no custom attrs', () => {
    const out = exportNode([createRect({ x: 0, y: 0, width: 1, height: 1 })]);
    expect(out).not.toContain('data-');
  });
});

describe('D-089 — custom data-* attribute import', () => {
  it('reads data-* back into customData (excluding data-svge-*)', () => {
    if (typeof DOMParser === 'undefined') return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <rect x="0" y="0" width="10" height="10" data-sku="ABC-123" data-category="shoes" />
      </svg>`;
    const result = svgImporter.import(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const rect = result.document.root.children[0]!;
    expect(readCustomAttrs(rect)).toEqual({ sku: 'ABC-123', category: 'shoes' });
  });

  it('ignores reserved data-svge-* attributes (not treated as custom)', () => {
    if (typeof DOMParser === 'undefined') return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <g data-svge-kind="layer" data-sku="X1">
          <rect x="0" y="0" width="10" height="10" />
        </g>
      </svg>`;
    const result = svgImporter.import(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const g = result.document.root.children[0]!;
    // The layer flag is honored, AND the custom attr survives alongside it.
    expect(isLayer(g)).toBe(true);
    expect(readCustomAttrs(g)).toEqual({ sku: 'X1' });
  });
});

describe('D-089 — full export → re-import round-trip', () => {
  it('preserves custom attrs on a leaf', () => {
    if (typeof DOMParser === 'undefined') return;
    const rect = setCustomAttr(
      setCustomAttr(createRect({ x: 0, y: 0, width: 10, height: 10 }), 'sku', 'ABC-123'),
      'category',
      'shoes',
    );
    const result = svgImporter.import(exportNode([rect]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(readCustomAttrs(result.document.root.children[0]!)).toEqual({
      sku: 'ABC-123',
      category: 'shoes',
    });
  });

  it('preserves custom attrs alongside the layer flag (no collision)', () => {
    if (typeof DOMParser === 'undefined') return;
    const layer = setCustomAttr(
      withLayerFlag(createGroup([createRect({ x: 0, y: 0, width: 1, height: 1 })])),
      'role',
      'background',
    );
    const result = svgImporter.import(exportNode([layer]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const g = result.document.root.children[0]!;
    expect(isLayer(g)).toBe(true);
    expect(readCustomAttrs(g)).toEqual({ role: 'background' });
  });

  it('preserves custom attrs alongside the smart-object flag', () => {
    if (typeof DOMParser === 'undefined') return;
    const so = setCustomAttr(
      withSmartObjectFlag(createGroup([createRect({ x: 0, y: 0, width: 1, height: 1 })])),
      'asset-id',
      'logo-42',
    );
    const result = svgImporter.import(exportNode([so]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const g = result.document.root.children[0]!;
    expect(isSmartObject(g)).toBe(true);
    expect(readCustomAttrs(g)).toEqual({ 'asset-id': 'logo-42' });
  });

  it('preserves custom attrs together with an authored name (<title>)', () => {
    if (typeof DOMParser === 'undefined') return;
    const rect = setCustomAttr(
      createRect({ x: 0, y: 0, width: 1, height: 1 }, { metadata: { name: 'Hero' } }),
      'sku',
      'Z9',
    );
    const result = svgImporter.import(exportNode([rect]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const node = result.document.root.children[0]!;
    expect(node.metadata.name).toBe('Hero');
    expect(readCustomAttrs(node)).toEqual({ sku: 'Z9' });
  });
});
