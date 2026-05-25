import { describe, expect, it } from 'vitest';
import {
  createGroup,
  createRect,
  isLayer,
  type SvgDocument,
  type SvgNode,
  withLayerFlag,
} from 'svg-engine/core';
import { svgExporter } from './svg-exporter';
import { svgImporter } from './svg-importer';

/**
 * **D-072 — Round-trip tests for the Layer flag.**
 *
 * Exporter emits `data-svge-kind="layer"` on layer groups; the importer
 * reads it back into `metadata.customData.svgeKind`. A full
 * export → re-import cycle must preserve the layer designation. Also
 * accept Inkscape's `inkscape:groupmode="layer"` as an equivalent
 * input signal so files authored in Inkscape import with layer
 * structure preserved.
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

describe('D-072 — Layer flag round-trip via exporter + importer', () => {
  it('exporter emits data-svge-kind="layer" for layer groups', () => {
    const layer = withLayerFlag(
      createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })], {
        metadata: { name: 'My Layer' },
      }),
    );
    const out = exportNode([layer]);
    expect(out).toContain('data-svge-kind="layer"');
  });

  it('exporter does NOT emit data-svge-kind on plain groups', () => {
    const plain = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    const out = exportNode([plain]);
    expect(out).not.toContain('data-svge-kind');
  });

  it('importer recognizes data-svge-kind="layer" and flags the group', () => {
    if (typeof DOMParser === 'undefined') return; // jsdom-only check
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <g data-svge-kind="layer">
          <rect x="0" y="0" width="10" height="10" />
        </g>
      </svg>`;
    const result = svgImporter.import(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.root.children[0]!;
    expect(child.type).toBe('group');
    expect(isLayer(child)).toBe(true);
  });

  it('importer accepts Inkscape inkscape:groupmode="layer" as a layer signal', () => {
    if (typeof DOMParser === 'undefined') return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg"
           xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
           viewBox="0 0 100 100" width="100" height="100">
        <g inkscape:groupmode="layer" inkscape:label="Sketch">
          <rect x="0" y="0" width="10" height="10" />
        </g>
      </svg>`;
    const result = svgImporter.import(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.root.children[0]!;
    expect(child.type).toBe('group');
    expect(isLayer(child)).toBe(true);
    // Inkscape label survives as the layer's name.
    expect(child.metadata.name).toBe('Sketch');
  });

  it('plain groups remain plain through a round-trip', () => {
    if (typeof DOMParser === 'undefined') return;
    const plain = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    const exported = exportNode([plain]);
    const result = svgImporter.import(exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.root.children[0]!;
    expect(child.type).toBe('group');
    expect(isLayer(child)).toBe(false);
  });

  it('layer groups remain layers through a full export → re-import cycle', () => {
    if (typeof DOMParser === 'undefined') return;
    const layer = withLayerFlag(
      createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })], {
        metadata: { name: 'Round Trip' },
      }),
    );
    const exported = exportNode([layer]);
    const result = svgImporter.import(exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.root.children[0]!;
    expect(child.type).toBe('group');
    expect(isLayer(child)).toBe(true);
  });
});
