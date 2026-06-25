import { describe, expect, it } from 'vitest';
import {
  createGroup,
  createRect,
  isLayer,
  isSmartObject,
  type SvgDocument,
  type SvgNode,
  withLayerFlag,
  withSmartObjectFlag,
} from '@mosaicoo/svg-engine/core';
import { svgExporter } from './svg-exporter';
import { svgImporter } from './svg-importer';

/**
 * **D-074 — Round-trip tests for the Smart Object flag.**
 *
 * Mirrors the D-072 layer round-trip pattern. The exporter emits
 * `data-svge-kind="smart-object"` on smart-object groups; the importer
 * reads it back into `metadata.customData.svgeKind`. A full
 * export → re-import cycle must preserve the smart-object designation.
 *
 * Smart-object and layer are mutually exclusive (single `svgeKind`
 * slot) — the round-trip tests prove that flipping one doesn't leak
 * into the other.
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

describe('D-074 — Smart Object flag round-trip via exporter + importer', () => {
  it('exporter emits data-svge-kind="smart-object" for smart-object groups', () => {
    const so = withSmartObjectFlag(
      createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]),
    );
    const out = exportNode([so]);
    expect(out).toContain('data-svge-kind="smart-object"');
  });

  it('exporter does NOT emit data-svge-kind="smart-object" on plain groups', () => {
    const plain = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    const out = exportNode([plain]);
    expect(out).not.toContain('data-svge-kind="smart-object"');
  });

  it('exporter does NOT emit smart-object kind on layer groups', () => {
    const layer = withLayerFlag(createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]));
    const out = exportNode([layer]);
    expect(out).toContain('data-svge-kind="layer"');
    expect(out).not.toContain('data-svge-kind="smart-object"');
  });

  it('importer recognizes data-svge-kind="smart-object" and flags the group', () => {
    if (typeof DOMParser === 'undefined') return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <g data-svge-kind="smart-object">
          <rect x="0" y="0" width="10" height="10" />
        </g>
      </svg>`;
    const result = svgImporter.import(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.root.children[0]!;
    expect(child.type).toBe('group');
    expect(isSmartObject(child)).toBe(true);
    expect(isLayer(child)).toBe(false);
  });

  it('smart-object groups remain smart objects through a full export → re-import cycle', () => {
    if (typeof DOMParser === 'undefined') return;
    const so = withSmartObjectFlag(
      createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })], {
        metadata: { name: 'Imported Logo' },
      }),
    );
    const exported = exportNode([so]);
    const result = svgImporter.import(exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.root.children[0]!;
    expect(child.type).toBe('group');
    expect(isSmartObject(child)).toBe(true);
    expect(isLayer(child)).toBe(false);
    expect(child.metadata.name).toBe('Imported Logo');
  });

  it('plain groups remain plain through a round-trip (no smart-object leak)', () => {
    if (typeof DOMParser === 'undefined') return;
    const plain = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    const exported = exportNode([plain]);
    const result = svgImporter.import(exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.root.children[0]!;
    expect(child.type).toBe('group');
    expect(isSmartObject(child)).toBe(false);
    expect(isLayer(child)).toBe(false);
  });

  it('nested smart-objects round-trip independently', () => {
    if (typeof DOMParser === 'undefined') return;
    const inner = withSmartObjectFlag(
      createGroup([createRect({ x: 0, y: 0, width: 5, height: 5 })], {
        metadata: { name: 'Inner' },
      }),
    );
    const outer = withSmartObjectFlag(createGroup([inner], { metadata: { name: 'Outer' } }));
    const exported = exportNode([outer]);
    const result = svgImporter.import(exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const outerNode = result.document.root.children[0]!;
    expect(isSmartObject(outerNode)).toBe(true);
    expect(outerNode.metadata.name).toBe('Outer');
    expect(outerNode.type).toBe('group');
    const innerNode = outerNode.type === 'group' ? outerNode.children[0]! : null;
    expect(innerNode).not.toBeNull();
    expect(isSmartObject(innerNode!)).toBe(true);
    expect(innerNode!.metadata.name).toBe('Inner');
  });
});
