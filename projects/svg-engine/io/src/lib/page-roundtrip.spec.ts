import { describe, expect, it } from 'vitest';
import {
  createGroup,
  createRect,
  getPageName,
  getPageOptions,
  getPageViewBox,
  isLayer,
  isPage,
  isSmartObject,
  type SvgDocument,
  type SvgNode,
  withLayerFlag,
  withPageFlag,
  withPageOptions,
  withSmartObjectFlag,
} from '@mosaicoo/svg-engine/core';
import { svgExporter } from './svg-exporter';
import { svgImporter } from './svg-importer';

/**
 * **D-079 / PAGES-D** — Round-trip tests for the Page flag + viewBox.
 *
 * Mirrors D-072 / D-074 round-trip patterns. The exporter emits
 * `data-svge-kind="page"` + `data-svge-page-viewbox="x y w h"` on
 * page groups; the importer reads them back into
 * `metadata.customData.svgeKind === 'page'` + `svgePageViewBox`.
 * A full export → re-import cycle must preserve both the page
 * designation AND the viewBox geometry.
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

const PAGE_VB = { x: 0, y: 0, width: 800, height: 600 };

describe('D-079 — Page flag round-trip via exporter + importer', () => {
  it('exporter emits data-svge-kind="page" + data-svge-page-viewbox for page groups', () => {
    const page = withPageFlag(
      createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]),
      PAGE_VB,
    );
    const out = exportNode([page]);
    expect(out).toContain('data-svge-kind="page"');
    expect(out).toContain('data-svge-page-viewbox="0 0 800 600"');
  });

  it('exporter does NOT emit page kind on plain groups', () => {
    const plain = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    const out = exportNode([plain]);
    expect(out).not.toContain('data-svge-kind="page"');
    expect(out).not.toContain('data-svge-page-viewbox');
  });

  it('exporter does NOT emit page kind on layer / smart-object groups', () => {
    const layer = withLayerFlag(createGroup([]));
    const so = withSmartObjectFlag(createGroup([]));
    const out = exportNode([layer, so]);
    expect(out).toContain('data-svge-kind="layer"');
    expect(out).toContain('data-svge-kind="smart-object"');
    expect(out).not.toContain('data-svge-kind="page"');
  });

  it('importer reads data-svge-kind="page" + viewBox back into the model', () => {
    const original = withPageFlag(createGroup([], { id: 'orig' as never }), PAGE_VB);
    const svg = exportNode([original]);
    const result = svgImporter.import(svg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const importedPage = result.document.root.children[0];
    expect(importedPage).toBeDefined();
    if (!importedPage) return;
    expect(isPage(importedPage)).toBe(true);
    expect(getPageViewBox(importedPage)).toEqual(PAGE_VB);
  });

  it('round-trip preserves explicit page name when divergent from metadata.name', () => {
    const original = withPageFlag(
      createGroup([], { metadata: { name: 'Cover' } }),
      PAGE_VB,
      'Cover',
    );
    const svg = exportNode([original]);
    const result = svgImporter.import(svg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const importedPage = result.document.root.children[0];
    expect(importedPage).toBeDefined();
    if (!importedPage) return;
    expect(getPageName(importedPage)).toBe('Cover');
  });

  it('importer ignores malformed data-svge-page-viewbox gracefully', () => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <g data-svge-kind="page" data-svge-page-viewbox="not a valid quartet">
    <rect x="0" y="0" width="10" height="10"/>
  </g>
</svg>`;
    const result = svgImporter.import(svg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pageNode = result.document.root.children[0];
    if (!pageNode) return;
    // Page flag still set (the kind attr is valid); viewBox falls
    // back to null (the getter handles it).
    expect(isPage(pageNode)).toBe(true);
    expect(getPageViewBox(pageNode)).toBeNull();
  });

  it('round-trip with mixed kinds (page + layer + smart-object + plain)', () => {
    const page = withPageFlag(createGroup([], { id: 'p' as never }), PAGE_VB);
    const layer = withLayerFlag(createGroup([], { id: 'l' as never }));
    const so = withSmartObjectFlag(createGroup([], { id: 's' as never }));
    const plain = createGroup([], { id: 'g' as never });
    const svg = exportNode([page, layer, so, plain]);
    const result = svgImporter.import(svg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const kids = result.document.root.children;
    expect(kids.length).toBe(4);
    expect(isPage(kids[0]!)).toBe(true);
    expect(isLayer(kids[1]!)).toBe(true);
    expect(isSmartObject(kids[2]!)).toBe(true);
    expect(isPage(kids[3]!)).toBe(false);
    expect(isLayer(kids[3]!)).toBe(false);
    expect(isSmartObject(kids[3]!)).toBe(false);
  });
});

/**
 * **D-140-fix** — Page presentation options (background / margins /
 * orientation / format) must survive export → re-import, since that's
 * exactly how Save Workspace and AutoSave persist. The bug: the exporter
 * emitted only kind + viewBox + name, dropping the options.
 */
describe('D-140-fix — Page options round-trip via exporter + importer', () => {
  const OPTS = {
    background: { kind: 'solid', color: '#ff0000' },
    margins: { top: 10, right: 5, bottom: 0, left: 0 },
    orientation: 'portrait',
    format: 'a4',
  } as const;

  it('exporter emits data-svge-page-options when the page has a stored options slot', () => {
    const page = withPageOptions(withPageFlag(createGroup([]), PAGE_VB), OPTS);
    const out = exportNode([page]);
    expect(out).toContain('data-svge-page-options');
  });

  it('exporter does NOT emit page options for a fresh page (no options slot)', () => {
    const page = withPageFlag(createGroup([]), PAGE_VB);
    const out = exportNode([page]);
    expect(out).not.toContain('data-svge-page-options');
  });

  it('round-trip preserves background / margins / orientation / format', () => {
    const page = withPageOptions(withPageFlag(createGroup([]), PAGE_VB), OPTS);
    const result = svgImporter.import(exportNode([page]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const imported = result.document.root.children[0];
    expect(imported).toBeDefined();
    if (!imported) return;
    expect(isPage(imported)).toBe(true);
    expect(getPageOptions(imported)).toEqual(OPTS);
  });

  it('importer ignores malformed data-svge-page-options gracefully (defaults)', () => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <g data-svge-kind="page" data-svge-page-viewbox="0 0 800 600" data-svge-page-options="{not json}">
    <rect x="0" y="0" width="10" height="10"/>
  </g>
</svg>`;
    const result = svgImporter.import(svg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const page = result.document.root.children[0];
    if (!page) return;
    // Malformed JSON ignored → getPageOptions falls back to defaults.
    expect(getPageOptions(page).format).toBe('custom');
    expect(getPageOptions(page).background).toEqual({ kind: 'transparent' });
  });
});
