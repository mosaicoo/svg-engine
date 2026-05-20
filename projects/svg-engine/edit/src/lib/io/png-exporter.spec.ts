import { TestBed } from '@angular/core/testing';
import { createGroup, createRect, type SvgDocument } from 'svg-engine/core';
import { ExporterRegistry, pngExporter } from 'svg-engine/io';
import { PluginRegistry } from '../plugin/plugin-registry.service';
import { pngExporterPlugin } from './png-exporter.plugin';

function makeMinimalDoc(): SvgDocument {
  return {
    id: 'doc' as never,
    viewBox: { x: 0, y: 0, width: 10, height: 10 },
    root: createGroup([createRect({ x: 0, y: 0, width: 5, height: 5 }, { id: 'r1' as never })], {
      id: 'root' as never,
    }),
  };
}

describe('pngExporter — metadata', () => {
  it('declares image/png media type and .png extension', () => {
    expect(pngExporter.id).toBe('svge.builtin.exporter.png');
    expect(pngExporter.mediaType).toBe('image/png');
    expect(pngExporter.extension).toBe('png');
    expect(pngExporter.name.length).toBeGreaterThan(0);
  });

  it('returns a Promise (binary/async exporter contract)', () => {
    // We don't await the result — jsdom can't actually rasterize via
    // canvas (no <canvas> 2D context) — but we DO want to assert that
    // the exporter's return type is Promise, not string. This proves
    // the async branch of the Exporter union return type works.
    const result = pngExporter.export(makeMinimalDoc());
    expect(result).toBeInstanceOf(Promise);
    // Swallow the rejection that's inevitable in jsdom — the test passes
    // as long as the call shape is correct.
    (result as Promise<Blob>).catch(() => {
      /* expected in jsdom — canvas/Image not available for raster */
    });
  });
});

describe('pngExporterPlugin — install/uninstall', () => {
  it('registers pngExporter on install; removes it on uninstall', () => {
    const exporters = TestBed.inject(ExporterRegistry);
    const pluginReg = TestBed.inject(PluginRegistry);
    expect(exporters.get(pngExporter.id)).toBeNull();
    pluginReg.install(pngExporterPlugin);
    expect(exporters.get(pngExporter.id)?.id).toBe(pngExporter.id);
    expect(exporters.byMediaType('image/png')?.id).toBe(pngExporter.id);
    expect(exporters.byExtension('png')?.id).toBe(pngExporter.id);
    pluginReg.uninstall(pngExporterPlugin.id);
    expect(exporters.get(pngExporter.id)).toBeNull();
    expect(exporters.byMediaType('image/png')).toBeNull();
  });

  it('declares the current PLUGIN_API_VERSION', async () => {
    const { PLUGIN_API_VERSION } = await import('../plugin/plugin');
    expect(pngExporterPlugin.apiVersion).toBe(PLUGIN_API_VERSION);
  });
});
