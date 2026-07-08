import { type SvgDocument, type SvgNode } from '@mosaicoo/svg-engine/core';
import { describe, expect, it } from 'vitest';

import { svgExporter } from './svg-exporter';
import { svgImporter } from './svg-importer';

/**
 * **D-149 — authored `id` round-trip.** An external tool (Illustrator /
 * Inkscape / a map authoring pipeline) writes `id="..."` on elements that a
 * downstream system binds data/thresholds to. Before D-149 the importer
 * dropped the id and the exporter never re-emitted it, so an
 * import → edit → export cycle silently lost those bindings. Now the id is
 * captured into `metadata.sourceId` on import and re-emitted on export
 * (opt-in default on-when-present).
 */

const skip = typeof DOMParser === 'undefined';

function importDoc(
  xml: string,
): { ok: true; document: SvgDocument } | { ok: false; error: string } {
  return svgImporter.import(xml) as never;
}

const wrap = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${inner}</svg>`;

describe('D-149 — authored id round-trip (import → export)', () => {
  it('captures a source element id into metadata.sourceId on import', () => {
    if (skip) return;
    const r = importDoc(wrap('<rect id="innerroot" x="0" y="0" width="10" height="10"/>'));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    const rect = r.document.root.children[0] as SvgNode;
    expect(rect.metadata.sourceId).toBe('innerroot');
  });

  it('does not set sourceId for an element that has no id', () => {
    if (skip) return;
    const r = importDoc(wrap('<rect x="0" y="0" width="10" height="10"/>'));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    expect((r.document.root.children[0] as SvgNode).metadata.sourceId).toBeUndefined();
  });

  it('preserves the id through a full import → export round-trip', () => {
    if (skip) return;
    const r = importDoc(wrap('<rect id="innerroot" x="0" y="0" width="10" height="10"/>'));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    const out = svgExporter.export(r.document);
    expect(out).toContain('id="innerroot"');
  });

  it('captures the id on a group too (a <g id="..."> map layer)', () => {
    if (skip) return;
    const r = importDoc(wrap('<g id="ms-porto-acu"><rect width="10" height="10"/></g>'));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    expect((r.document.root.children[0] as SvgNode).metadata.sourceId).toBe('ms-porto-acu');
    expect(svgExporter.export(r.document)).toContain('id="ms-porto-acu"');
  });

  it('keeps name (→ <title>) and id (→ id="...") as independent identities', () => {
    if (skip) return;
    const r = importDoc(
      wrap(
        '<rect id="bind-me" x="0" y="0" width="10" height="10"><title>My Rectangle</title></rect>',
      ),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    const rect = r.document.root.children[0] as SvgNode;
    expect(rect.metadata.sourceId).toBe('bind-me');
    expect(rect.metadata.name).toBe('My Rectangle');
    const out = svgExporter.export(r.document);
    expect(out).toContain('id="bind-me"');
    expect(out).toContain('<title>My Rectangle</title>');
  });
});
