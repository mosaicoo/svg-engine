import type { SvgDocument } from 'svg-engine/core';
import type { Exporter } from './io-types';
import { svgExporter } from './svg-exporter';

/**
 * **D-137** — SVGZ (gzip-compressed SVG) support.
 *
 * SVGZ is the W3C-standard compressed SVG: a plain SVG document run
 * through gzip, conventionally served as `image/svg+xml` with
 * `Content-Encoding: gzip` and saved with the `.svgz` extension. It is
 * NOT a different format — gunzip an `.svgz` and you get the exact SVG
 * back. Typical drawings shrink ~70–90%.
 *
 * Compression uses the platform `CompressionStream`/`DecompressionStream`
 * (Chrome 80+, Firefox 113+, Safari 16.4+, Node 18+) — zero third-party
 * deps, so this stays inside the headless `io` entry point (D-016/D-017:
 * no `@angular/*` here). When the API is missing (very old browser or a
 * non-browser runtime without the global) the helpers throw a clear
 * error so callers can surface it instead of producing a corrupt file.
 *
 * The low-level {@link gzipText}/{@link gunzipText} helpers are exported
 * for reuse beyond SVGZ (e.g. a future compressed `.svge` workspace
 * container, or gzipping the autosave payload — see autosave.service.ts).
 */

/**
 * Drive one chunk through a Web Streams transform (`CompressionStream` /
 * `DecompressionStream`) and collect the output bytes. Uses the writer/reader
 * API directly — NOT `Blob.stream()` or `new Response(stream)` — so it works in
 * browsers AND Node-native / test runtimes whose `Blob` lacks `.stream()`.
 *
 * Write + close are fired without awaiting (they back-pressure) so reading can
 * start immediately; small inputs would otherwise deadlock.
 */
async function runTransform(
  transform: { readable: ReadableStream<Uint8Array>; writable: WritableStream<BufferSource> },
  input: Uint8Array,
): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  const reader = transform.readable.getReader();
  // Cast: `input` is ArrayBuffer-backed, but TS 5.7+ widens `Uint8Array` to
  // `Uint8Array<ArrayBufferLike>`, which the strict `BufferSource` rejects.
  void writer.write(input as BufferSource);
  void writer.close();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** gzip a UTF-8 string to bytes. Throws if `CompressionStream` is absent. */
export async function gzipText(text: string): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    throw new Error(
      'gzip compression is unavailable in this environment (CompressionStream missing)',
    );
  }
  return runTransform(new CompressionStream('gzip'), new TextEncoder().encode(text));
}

/**
 * gunzip bytes back to a UTF-8 string. Accepts an `ArrayBuffer` (e.g.
 * `await file.arrayBuffer()`) or a `Uint8Array`. Throws if
 * `DecompressionStream` is absent, and rejects if `input` is not valid
 * gzip data.
 */
export async function gunzipText(input: ArrayBuffer | Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      'gzip decompression is unavailable in this environment (DecompressionStream missing)',
    );
  }
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const out = await runTransform(new DecompressionStream('gzip'), bytes);
  return new TextDecoder().decode(out);
}

/**
 * `Exporter` that serializes a document to SVG (via {@link svgExporter})
 * then gzips it into an `.svgz` Blob. Async (gzip is stream-based), so it
 * follows the same `Promise<Blob>` shape as `pngExporter`.
 *
 * The Blob's MIME stays `image/svg+xml` — that's what SVGZ *is* (a
 * gzip-encoded SVG); the `.svgz` extension is what tags it as compressed
 * to the OS and other tools.
 */
export const svgzExporter: Exporter = {
  id: 'svge.builtin.exporter.svgz',
  name: 'SVG (compressed)',
  mediaType: 'image/svg+xml',
  extension: 'svgz',
  async export(document: SvgDocument): Promise<Blob> {
    const svgText = svgExporter.export(document);
    if (typeof svgText !== 'string') {
      throw new Error('svgzExporter: svgExporter returned non-string output');
    }
    const bytes = await gzipText(svgText);
    // Cast: see gunzipText — `bytes` is ArrayBuffer-backed; the strict
    // `BlobPart` type rejects the widened `Uint8Array<ArrayBufferLike>`.
    return new Blob([bytes as BlobPart], { type: 'image/svg+xml' });
  },
};
