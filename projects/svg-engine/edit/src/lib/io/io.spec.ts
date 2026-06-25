import { TestBed } from '@angular/core/testing';
import { createGroup, createRect } from '@mosaicoo/svg-engine/core';
import {
  ExporterRegistry,
  ImporterRegistry,
  svgExporter,
  svgImporter,
} from '@mosaicoo/svg-engine/io';
import { PluginRegistry } from '../plugin/plugin-registry.service';
import { builtinIoPlugin } from './builtin-io.plugin';

describe('ImporterRegistry / ExporterRegistry — basics', () => {
  it('start empty; register adds; Disposable removes', () => {
    const reg = TestBed.inject(ImporterRegistry);
    expect(reg.importers()).toEqual([]);
    const d = reg.register(svgImporter);
    expect(reg.importers().length).toBe(1);
    expect(reg.get(svgImporter.id)?.id).toBe(svgImporter.id);
    d.dispose();
    expect(reg.get(svgImporter.id)).toBeNull();
  });

  it('byExtension is case-insensitive and tolerates leading dot', () => {
    const reg = TestBed.inject(ImporterRegistry);
    reg.register(svgImporter);
    expect(reg.byExtension('svg')?.id).toBe(svgImporter.id);
    expect(reg.byExtension('SVG')?.id).toBe(svgImporter.id);
    expect(reg.byExtension('.svg')?.id).toBe(svgImporter.id);
    expect(reg.byExtension('png')).toBeNull();
  });

  it('byMediaType finds exact match', () => {
    const reg = TestBed.inject(ExporterRegistry);
    reg.register(svgExporter);
    expect(reg.byMediaType('image/svg+xml')?.id).toBe(svgExporter.id);
    expect(reg.byMediaType('text/plain')).toBeNull();
  });

  it('register throws on empty id and on duplicate id', () => {
    const reg = TestBed.inject(ImporterRegistry);
    expect(() => reg.register({ ...svgImporter, id: '' })).toThrowError(/non-empty/);
    reg.register(svgImporter);
    expect(() => reg.register(svgImporter)).toThrowError(/already registered/);
  });
});

describe('builtinIoPlugin — install/uninstall', () => {
  it('install registers both importer and exporter; uninstall removes them', () => {
    const importers = TestBed.inject(ImporterRegistry);
    const exporters = TestBed.inject(ExporterRegistry);
    const pluginReg = TestBed.inject(PluginRegistry);
    pluginReg.install(builtinIoPlugin);
    expect(importers.importers().length).toBe(1);
    expect(exporters.exporters().length).toBe(1);
    pluginReg.uninstall(builtinIoPlugin.id);
    expect(importers.importers().length).toBe(0);
    expect(exporters.exporters().length).toBe(0);
  });
});

describe('svgImporter — happy paths', () => {
  it('parses a minimal <svg> with viewBox and 1 rect', () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<rect x="10" y="20" width="30" height="40" fill="red" />' +
      '</svg>';
    const result = svgImporter.import(text);
    if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
    expect(result.document.viewBox).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(result.document.root.children.length).toBe(1);
    const rect = result.document.root.children[0]!;
    expect(rect.type).toBe('rect');
    expect((rect as { x: number; y: number; width: number; height: number }).x).toBe(10);
    expect(rect.style.fill).toBe('red');
    expect(result.warnings).toEqual([]);
  });

  it('parses <circle> as <ellipse> with rx=ry', () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="20" />' +
      '</svg>';
    const result = svgImporter.import(text);
    if (!result.ok) throw new Error('parse failed');
    const e = result.document.root.children[0]!;
    expect(e.type).toBe('ellipse');
    expect((e as { rx: number; ry: number }).rx).toBe(20);
    expect((e as { rx: number; ry: number }).ry).toBe(20);
  });

  it('parses nested <g> recursively', () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<g transform="translate(10,10)"><rect x="0" y="0" width="5" height="5" /></g>' +
      '</svg>';
    const result = svgImporter.import(text);
    if (!result.ok) throw new Error('parse failed');
    const g = result.document.root.children[0]!;
    expect(g.type).toBe('group');
    expect(g.transform).toEqual([1, 0, 0, 1, 10, 10]);
    expect((g as { children: readonly unknown[] }).children.length).toBe(1);
  });
});

describe('svgImporter — sanitization', () => {
  it('drops <script> tags and warns', () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
      '<script>alert("xss")</script><rect x="0" y="0" width="5" height="5" />' +
      '</svg>';
    const result = svgImporter.import(text);
    if (!result.ok) throw new Error('parse failed');
    expect(result.document.root.children.length).toBe(1); // rect only
    expect(result.warnings.some((w) => w.includes('<script>'))).toBe(true);
  });

  it('strips on* event handler attributes and warns', () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
      '<rect x="0" y="0" width="5" height="5" onclick="alert(1)" onload="x()" />' +
      '</svg>';
    const result = svgImporter.import(text);
    if (!result.ok) throw new Error('parse failed');
    // The rect made it (its style.fill etc. survived) BUT event handlers
    // got removed — they're not in any field of the model anyway.
    expect(result.warnings.some((w) => w.toLowerCase().includes('onclick'))).toBe(true);
    expect(result.warnings.some((w) => w.toLowerCase().includes('onload'))).toBe(true);
  });

  it('blocks javascript: hrefs on <image> and warns', () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
      '<image x="0" y="0" width="5" height="5" href="javascript:alert(1)" />' +
      '</svg>';
    const result = svgImporter.import(text);
    if (!result.ok) throw new Error('parse failed');
    const img = result.document.root.children[0]!;
    expect((img as { href: string }).href).toBe('');
    expect(result.warnings.some((w) => w.includes('javascript:'))).toBe(true);
  });

  it('collects ONE warning per unsupported tag (not per occurrence)', () => {
    // `<defs>` is captured into document.defs (Fase 6c-1) and `<use>` became
    // a SymbolUseNode (D-098), so neither warns anymore. Use `<switch>` — a
    // container the importer still does not model — TWICE to exercise the
    // per-tag de-duplication (ONE warning, not one per occurrence).
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
      '<switch><rect width="1" height="1"/></switch><switch><rect width="2" height="2"/></switch>' +
      '</svg>';
    const result = svgImporter.import(text);
    if (!result.ok) throw new Error('parse failed');
    const unsupportedWarns = result.warnings.filter((w) => w.startsWith('Unsupported'));
    expect(unsupportedWarns.length).toBe(1); // <switch> ONCE, not twice
    expect(unsupportedWarns[0]).toContain('switch');
  });
});

describe('svgImporter — failure modes', () => {
  it('returns ok:false on malformed XML', () => {
    const result = svgImporter.import('<svg><rect></svg>'); // unclosed rect
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when root element is not <svg>', () => {
    const result = svgImporter.import('<html><body /></html>');
    expect(result.ok).toBe(false);
  });
});

describe('svgExporter — happy paths', () => {
  it('emits a minimal SVG with viewBox and 1 rect (deterministic order)', () => {
    const doc = svgImporter.import(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
        '<rect x="10" y="20" width="30" height="40" fill="red" />' +
        '</svg>',
    );
    if (!doc.ok) throw new Error('round-trip parse failed');
    const out = svgExporter.export(doc.document);
    expect(out).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(out).toContain('viewBox="0 0 100 100"');
    expect(out).toContain('<rect x="10" y="20" width="30" height="40" fill="red" />');
  });

  it('skips identity transforms (default is implicit)', () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
      '<rect x="0" y="0" width="5" height="5" />' +
      '</svg>';
    const parsed = svgImporter.import(text);
    if (!parsed.ok) throw new Error('parse failed');
    const out = svgExporter.export(parsed.document);
    expect(out).not.toContain('transform');
  });

  it('emits translate() compactly when only translation is set', () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
      '<g transform="translate(5,7)"><rect x="0" y="0" width="2" height="2" /></g>' +
      '</svg>';
    const parsed = svgImporter.import(text);
    if (!parsed.ok) throw new Error('parse failed');
    const out = svgExporter.export(parsed.document);
    expect(out).toContain('transform="translate(5,7)"');
  });

  it('output is deterministic for same input (byte-stable)', () => {
    const rect1 = createRect({ x: 1, y: 2, width: 3, height: 4 }, { id: 'r1' as never });
    const rect2 = createRect({ x: 5, y: 6, width: 7, height: 8 }, { id: 'r2' as never });
    const doc = {
      id: 'doc' as never,
      viewBox: { x: 0, y: 0, width: 100, height: 100 },
      root: createGroup([rect1, rect2], { id: 'root' as never }),
    };
    expect(svgExporter.export(doc)).toBe(svgExporter.export(doc));
  });
});

describe('svgImporter — defs / reusable-defs (Fase 6c-1)', () => {
  it('preserves <defs> content as opaque fragment on document.defs', () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
      '<rect x="0" y="0" width="50" height="50" fill="url(#g1)" />' +
      '</svg>';
    const result = svgImporter.import(text);
    if (!result.ok) throw new Error('parse failed');
    expect(result.document.defs).toBeDefined();
    expect(result.document.defs).toContain('linearGradient');
    expect(result.document.defs).toContain('id="g1"');
    // The renderable tree did NOT pick up <defs> as a child.
    expect(result.document.root.children.length).toBe(1);
    expect(result.document.root.children[0]?.type).toBe('rect');
    // No "Unsupported <defs>" warning anymore.
    expect(result.warnings.some((w) => w.includes('<defs>'))).toBe(false);
  });

  it('rolls top-level <clipPath> (outside <defs>) into the defs fragment', () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<clipPath id="c1"><circle cx="10" cy="10" r="5"/></clipPath>' +
      '<rect x="0" y="0" width="20" height="20" clip-path="url(#c1)" />' +
      '</svg>';
    const result = svgImporter.import(text);
    if (!result.ok) throw new Error('parse failed');
    expect(result.document.defs).toBeDefined();
    expect(result.document.defs).toContain('clipPath');
    expect(result.warnings.some((w) => w.includes('<clippath>'))).toBe(false);
  });

  it('silently ignores Inkscape/Sodipodi editor metadata (no warning)', () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" ' +
      'xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.0.dtd" ' +
      'viewBox="0 0 100 100">' +
      '<sodipodi:namedview id="nv1"/>' +
      '<metadata>some RDF here</metadata>' +
      '<title>My drawing</title>' +
      '<rect x="0" y="0" width="10" height="10" />' +
      '</svg>';
    const result = svgImporter.import(text);
    if (!result.ok) throw new Error('parse failed');
    expect(result.warnings.length).toBe(0);
    expect(result.document.root.children.length).toBe(1);
  });

  it('sanitizes <script> and event handlers from inside <defs>', () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<defs>' +
      '<linearGradient id="g1" onload="alert(1)">' +
      '<stop offset="0" stop-color="red"/>' +
      '</linearGradient>' +
      '<script>alert("xss")</script>' +
      '</defs>' +
      '<rect x="0" y="0" width="50" height="50" fill="url(#g1)" />' +
      '</svg>';
    const result = svgImporter.import(text);
    if (!result.ok) throw new Error('parse failed');
    expect(result.document.defs).toBeDefined();
    expect(result.document.defs).not.toContain('onload');
    expect(result.document.defs).not.toContain('alert');
    expect(result.warnings.some((w) => /onload/i.test(w))).toBe(true);
  });

  it('document with no <defs> has document.defs undefined (no empty string)', () => {
    const text =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
      '<rect x="0" y="0" width="5" height="5" />' +
      '</svg>';
    const result = svgImporter.import(text);
    if (!result.ok) throw new Error('parse failed');
    expect(result.document.defs).toBeUndefined();
  });
});

describe('svgExporter — defs round-trip', () => {
  it('emits <defs>...</defs> when document.defs is non-empty', () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient></defs>' +
      '<rect x="0" y="0" width="10" height="10" fill="url(#g1)" />' +
      '</svg>';
    const parsed = svgImporter.import(source);
    if (!parsed.ok) throw new Error('parse failed');
    const out = svgExporter.export(parsed.document);
    if (typeof out !== 'string') throw new Error('expected string output');
    expect(out).toContain('<defs>');
    expect(out).toContain('</defs>');
    expect(out).toContain('linearGradient');
    expect(out).toContain('id="g1"');
  });

  it('omits <defs> block entirely when document.defs is undefined', () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' +
      '<rect x="0" y="0" width="5" height="5" />' +
      '</svg>';
    const parsed = svgImporter.import(source);
    if (!parsed.ok) throw new Error('parse failed');
    const out = svgExporter.export(parsed.document);
    if (typeof out !== 'string') throw new Error('expected string output');
    expect(out).not.toContain('<defs');
  });
});

describe('IO round-trip', () => {
  it('parse → export → parse produces equivalent structure', () => {
    const src =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50">' +
      '<rect x="1" y="2" width="3" height="4" fill="#ff0000" stroke="#000000" stroke-width="1.5" />' +
      '<ellipse cx="10" cy="20" rx="5" ry="6" />' +
      '</svg>';
    const a = svgImporter.import(src);
    if (!a.ok) throw new Error('first parse failed');
    // svgExporter is sync (returns string); the Exporter contract widens
    // to `string | Promise<string | Blob>` for the binary-async branch
    // (see png-exporter), so we narrow here.
    const serialized = svgExporter.export(a.document);
    if (typeof serialized !== 'string') throw new Error('SVG exporter expected to be sync');
    const b = svgImporter.import(serialized);
    if (!b.ok) throw new Error('re-parse failed');
    expect(b.document.viewBox).toEqual(a.document.viewBox);
    expect(b.document.root.children.length).toBe(a.document.root.children.length);
    expect(b.document.root.children[0]?.type).toBe('rect');
    expect(b.document.root.children[1]?.type).toBe('ellipse');
  });
});
