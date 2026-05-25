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
 *
 * **D-072 follow-up (title-only) — Authored name persistence.**
 *
 * Exporter emits `<title>...</title>` child for any node with
 * `metadata.name`. The importer reads `<title>` child to populate
 * `metadata.name`, with `inkscape:label` and `data-svge-name` as
 * fallbacks for files authored in Inkscape or by an earlier hybrid
 * iteration of this editor.
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
    const layer = withLayerFlag(createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]));
    const out = exportNode([layer]);
    expect(out).toContain('data-svge-kind="layer"');
  });

  it('exporter does NOT emit data-svge-kind on plain groups', () => {
    const plain = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    const out = exportNode([plain]);
    expect(out).not.toContain('data-svge-kind');
  });

  it('importer recognizes data-svge-kind="layer" and flags the group', () => {
    if (typeof DOMParser === 'undefined') return;
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

describe('D-072 follow-up — Authored name persistence via <title>', () => {
  function exportDoc(
    children: readonly SvgNode[],
    prefs?: SvgDocument['exportPreferences'],
  ): string {
    const doc: SvgDocument = {
      id: 'doc' as never,
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
      root: createGroup(children, { id: 'root' as never }),
      ...(prefs !== undefined ? { exportPreferences: prefs } : {}),
    };
    const out = svgExporter.export(doc);
    if (typeof out !== 'string') throw new Error('svgExporter returned non-string');
    return out;
  }

  it('exporter emits <title>Name</title> as child of nodes with metadata.name', () => {
    const rect = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { metadata: { name: 'Bercos' } },
    );
    const out = exportDoc([rect]);
    expect(out).toContain('<title>Bercos</title>');
    // ZERO namespace pollution — no inkscape, no id slug.
    expect(out).not.toContain('inkscape:label');
    expect(out).not.toContain('xmlns:inkscape');
    expect(out).not.toMatch(/id="bercos/);
  });

  it('exporter preserves the user-typed name verbatim (spaces, accents, emoji)', () => {
    const rect = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { metadata: { name: 'Logo Principal ❤️' } },
    );
    const out = exportDoc([rect]);
    expect(out).toContain('<title>Logo Principal ❤️</title>');
  });

  it('exporter escapes XML special chars in the title text', () => {
    const rect = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { metadata: { name: '<script>alert(1)</script> & "evil"' } },
    );
    const out = exportDoc([rect]);
    // & < > escaped; preserved as text only.
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; "evil"');
    expect(out).not.toContain('<script>'); // never executable
  });

  it('exporter allows duplicate names freely (no slug suffix, no conflict)', () => {
    const a = createRect({ x: 0, y: 0, width: 10, height: 10 }, { metadata: { name: 'Logo' } });
    const b = createRect({ x: 20, y: 0, width: 10, height: 10 }, { metadata: { name: 'Logo' } });
    const out = exportDoc([a, b]);
    // Both nodes get the SAME <title>Logo</title>; no disambiguation needed.
    const matches = out.match(/<title>Logo<\/title>/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it('exporter omits <title> for un-named nodes (clean output)', () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const out = exportDoc([rect]);
    expect(out).not.toContain('<title>');
  });

  it('exporter omits <title> when emitAuthoredTitles=false (optimizer-controlled)', () => {
    const rect = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { metadata: { name: 'Bercos' } },
    );
    const out = exportDoc([rect], { emitAuthoredTitles: false });
    expect(out).not.toContain('<title>');
  });

  it('group emits <title> as FIRST child (before the geometry children)', () => {
    const inner = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const group = createGroup([inner], { metadata: { name: 'Bercos' } });
    const out = exportDoc([group]);
    // Title appears before the rect.
    const titleIdx = out.indexOf('<title>Bercos</title>');
    const rectIdx = out.indexOf('<rect');
    expect(titleIdx).toBeGreaterThan(0);
    expect(rectIdx).toBeGreaterThan(titleIdx);
  });

  it('round-trip "Bercos" rect: name preserved across export → re-import', () => {
    if (typeof DOMParser === 'undefined') return;
    const rect = createRect(
      { x: 0, y: 0, width: 10, height: 10 },
      { metadata: { name: 'Bercos' } },
    );
    const exported = exportDoc([rect]);
    const result = svgImporter.import(exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.root.children[0]!;
    expect(child.metadata.name).toBe('Bercos');
  });

  it('round-trip layer with name: layer flag AND name both survive', () => {
    if (typeof DOMParser === 'undefined') return;
    const layer = withLayerFlag(createGroup([], { metadata: { name: 'Bercos' } }));
    const exported = exportDoc([layer]);
    const result = svgImporter.import(exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.root.children[0]!;
    expect(isLayer(child)).toBe(true);
    expect(child.metadata.name).toBe('Bercos');
  });

  it('importer reads inkscape:label as fallback (Inkscape / D-072+ hybrid file)', () => {
    if (typeof DOMParser === 'undefined') return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg"
           xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
           viewBox="0 0 100 100" width="100" height="100">
        <rect x="0" y="0" width="10" height="10" inkscape:label="From Inkscape" />
      </svg>`;
    const result = svgImporter.import(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.root.children[0]!;
    expect(child.metadata.name).toBe('From Inkscape');
  });

  it('importer reads data-svge-name as legacy fallback', () => {
    if (typeof DOMParser === 'undefined') return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <rect x="0" y="0" width="10" height="10" data-svge-name="Legacy" />
      </svg>`;
    const result = svgImporter.import(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.root.children[0]!;
    expect(child.metadata.name).toBe('Legacy');
  });

  it('<title> takes precedence over inkscape:label when both are present', () => {
    if (typeof DOMParser === 'undefined') return;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <svg xmlns="http://www.w3.org/2000/svg"
           xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
           viewBox="0 0 100 100" width="100" height="100">
        <rect x="0" y="0" width="10" height="10" inkscape:label="From Inkscape">
          <title>From Title</title>
        </rect>
      </svg>`;
    const result = svgImporter.import(xml);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const child = result.document.root.children[0]!;
    expect(child.metadata.name).toBe('From Title');
  });
});
