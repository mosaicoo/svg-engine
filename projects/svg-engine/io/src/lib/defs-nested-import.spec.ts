import type { SvgDocument } from 'svg-engine/core';
import { describe, expect, it } from 'vitest';

import { svgImporter } from './svg-importer';

/**
 * **D-115 — nested `<defs>` hoisting.** `extractDefsFragment` used to scan
 * only direct children of `<svg>`, so a `<defs>` placed inside a (often
 * transformed) `<g>` — common output from several authoring tools — was
 * dropped and its `url(#id)` references dangled. Since SVG `id`s are
 * document-global, the importer now collects `<defs>` at any depth.
 */

const skip = typeof DOMParser === 'undefined';

function importDoc(
  xml: string,
): { ok: true; document: SvgDocument } | { ok: false; error: string } {
  return svgImporter.import(xml) as never;
}

// The exact SVG the user reported — <defs> sits inside `<g transform="...">`.
const REPORTED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="116" fill="#14161A"/><g transform="translate(56,80) scale(2.0)"><defs><linearGradient id="g_ic" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#e25361"/><stop offset="1" stop-color="#f06a76"/></linearGradient></defs><g fill="none"><path d="M 30,150 C 30,92 62,52 100,52 C 138,52 170,92 170,150" stroke="url(#g_ic)" stroke-width="8" stroke-linecap="round"/></g></g></svg>`;

describe('D-115 — nested <defs> are hoisted into document defs', () => {
  it('collects a <defs> nested inside a transformed <g> (reported SVG)', () => {
    if (skip) return;
    const r = importDoc(REPORTED);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    const defs = r.document.defs ?? '';
    expect(defs).toContain('id="g_ic"');
    expect(defs).toContain('stop-color="#e25361"');
    expect(defs).toContain('stop-color="#f06a76"');
  });

  it('keeps the url(#g_ic) reference intact on the renderable path', () => {
    if (skip) return;
    const r = importDoc(REPORTED);
    if (!r.ok) throw new Error(r.error);
    // The outer <g transform> → inner <g> → path is preserved; the stroke
    // still points at the (now hoisted) gradient.
    let json = JSON.stringify(r.document.root);
    expect(json).toContain('url(#g_ic)');
    // The <defs> itself must NOT leak into the renderable tree as a node.
    json = json.toLowerCase();
    expect(json).not.toContain('"type":"defs"');
  });

  it('hoists a bare (un-wrapped) gradient nested deep in the tree', () => {
    if (skip) return;
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g><g><linearGradient id="bare"><stop offset="0" stop-color="#fff"/></linearGradient><rect width="100" height="100" fill="url(#bare)"/></g></g></svg>`;
    const r = importDoc(xml);
    if (!r.ok) throw new Error(r.error);
    expect(r.document.defs ?? '').toContain('id="bare"');
  });

  it('collects BOTH a top-level <defs> and a nested <defs> (union, no loss)', () => {
    if (skip) return;
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="top"><stop offset="0" stop-color="#000"/></linearGradient></defs><g transform="translate(5,5)"><defs><linearGradient id="nested"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="10" height="10" fill="url(#nested)"/></g></svg>`;
    const r = importDoc(xml);
    if (!r.ok) throw new Error(r.error);
    const defs = r.document.defs ?? '';
    expect(defs).toContain('id="top"');
    expect(defs).toContain('id="nested"');
  });

  it('does NOT duplicate a gradient that is already inside a <defs>', () => {
    if (skip) return;
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g><defs><linearGradient id="once"><stop offset="0" stop-color="#000"/></linearGradient></defs><rect width="10" height="10" fill="url(#once)"/></g></svg>`;
    const r = importDoc(xml);
    if (!r.ok) throw new Error(r.error);
    const defs = r.document.defs ?? '';
    expect(defs.match(/id="once"/g)?.length).toBe(1);
  });
});
