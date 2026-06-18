import { svgExporter } from './svg-exporter';
import { svgImporter } from './svg-importer';
import { gunzipText, gzipText, svgzExporter } from './svgz';

/**
 * **D-137** — SVGZ round-trip. Runs in a real browser (ChromeHeadless),
 * where `CompressionStream`/`DecompressionStream` are available.
 */
describe('D-137 — SVGZ (gzip-compressed SVG)', () => {
  it('gzipText → gunzipText round-trips an arbitrary UTF-8 string', async () => {
    const original = 'Olá, SVGEngine! <svg>…</svg> — acentuação e emoji 🎨';
    const bytes = await gzipText(original);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);
    const restored = await gunzipText(bytes);
    expect(restored).toBe(original);
  });

  it('gunzipText accepts an ArrayBuffer (the shape from file.arrayBuffer())', async () => {
    const bytes = await gzipText('round-trip via ArrayBuffer');
    // Copy into a standalone ArrayBuffer to mirror `await file.arrayBuffer()`.
    const buffer = bytes.slice().buffer;
    const restored = await gunzipText(buffer);
    expect(restored).toBe('round-trip via ArrayBuffer');
  });

  it('actually compresses repetitive content (smaller than the raw bytes)', async () => {
    const repetitive = 'A'.repeat(10_000);
    const bytes = await gzipText(repetitive);
    expect(bytes.byteLength).toBeLessThan(repetitive.length);
  });

  it('svgzExporter exposes the SVGZ format metadata', () => {
    expect(svgzExporter.extension).toBe('svgz');
    expect(svgzExporter.mediaType).toBe('image/svg+xml');
    expect(svgzExporter.id).toBe('svge.builtin.exporter.svgz');
  });

  it('svgzExporter.export gunzips back to the exact svgExporter output', async () => {
    const result = svgImporter.import(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
        '<rect x="10" y="10" width="80" height="80" fill="#e24b4a"/></svg>',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const plainSvg = svgExporter.export(result.document);
    expect(typeof plainSvg).toBe('string');

    // `Exporter.export` is typed `string | Promise<string | Blob>`; SVGZ always
    // resolves to a Blob — narrow before touching Blob-only members.
    const exported = await svgzExporter.export(result.document);
    expect(exported).toBeInstanceOf(Blob);
    if (!(exported instanceof Blob)) return;
    expect(exported.type).toBe('image/svg+xml');

    const decompressed = await gunzipText(await exported.arrayBuffer());
    expect(decompressed).toBe(plainSvg as string);
  });
});
