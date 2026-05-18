import type { SvgDocument } from 'svg-engine/core';
import type { Exporter } from './io-types';
import { svgExporter } from './svg-exporter';

/**
 * Reference plugin: PNG export via `<canvas>` (Item 6 — débito 5-IO).
 *
 * Serves two purposes:
 * 1. **Real feature**: lets users export their drawing as a raster
 *    PNG (handy for slack/discord/preview thumbnails)
 * 2. **Demonstration of the async exporter contract** — shows how a
 *    third-party plugin (or built-in) implements `Exporter` returning
 *    `Promise<Blob>` instead of synchronous text
 *
 * **Pipeline**:
 * - Serialize the document to SVG text via {@link svgExporter}
 * - Wrap as a `data:image/svg+xml;base64,...` URI
 * - Load it into an `Image` element (the only way browsers convert
 *   SVG → raster on the main thread)
 * - Draw to an offscreen `<canvas>` sized to the viewBox
 * - `toBlob('image/png')` extracts the binary PNG
 *
 * **Quality**: the canvas runs at 2× the viewBox resolution to keep
 * the export crisp on retina displays. Configurable in a future
 * polish via constructor arg (kept hard-coded here for simplicity).
 *
 * **Failure modes**: when `Image.onerror` fires (malformed SVG, cross-
 * origin issues) OR `canvas.toBlob` returns `null` (canvas tainted /
 * unsupported), the returned Promise rejects with a descriptive error.
 *
 * **NOT a plugin yet**: this is just the `Exporter` object. The
 * `builtinIoPlugin` could register it, but to demonstrate plugin
 * separation we ship it as a SEPARATE plugin ({@link pngExporterPlugin})
 * so consumers can opt in/out independently of the SVG IO plugin.
 */
export const pngExporter: Exporter = {
  id: 'svge.builtin.exporter.png',
  name: 'PNG (raster)',
  mediaType: 'image/png',
  extension: 'png',

  export(document: SvgDocument): Promise<Blob> {
    if (typeof window === 'undefined' || typeof Image === 'undefined') {
      return Promise.reject(new Error('pngExporter requires a browser environment'));
    }
    const svgText = svgExporter.export(document);
    if (typeof svgText !== 'string') {
      return Promise.reject(new Error('pngExporter: svgExporter returned non-string'));
    }
    // 2× canvas resolution for retina-quality output (Affinity / Figma
    // do the same trick for raster previews). The PNG file's logical
    // dimensions still match the SVG viewBox.
    const dpr = 2;
    const vb = document.viewBox;
    const canvasWidth = Math.max(1, Math.round(vb.width * dpr));
    const canvasHeight = Math.max(1, Math.round(vb.height * dpr));

    return new Promise<Blob>((resolve, reject) => {
      const img = new Image();
      // Base64 wrap — works without CORS hassles since the data: URI
      // has no origin. `btoa` for ASCII; `unescape(encodeURIComponent(...))`
      // for UTF-8 safety (SVG can contain any Unicode in text content).
      let base64: string;
      try {
        base64 = btoa(unescape(encodeURIComponent(svgText)));
      } catch (e) {
        reject(new Error(`pngExporter: failed to base64-encode SVG: ${stringifyError(e)}`));
        return;
      }
      img.onload = () => {
        const canvas = window.document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        if (ctx === null) {
          reject(new Error('pngExporter: canvas 2D context unavailable'));
          return;
        }
        // Draw at full canvas dimensions; the Image element handles the
        // SVG → raster step using the browser's native renderer.
        ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
        canvas.toBlob((blob) => {
          if (blob === null) {
            reject(new Error('pngExporter: canvas.toBlob returned null'));
          } else {
            resolve(blob);
          }
        }, 'image/png');
      };
      img.onerror = () => {
        reject(new Error('pngExporter: Image failed to load SVG payload'));
      };
      img.src = `data:image/svg+xml;base64,${base64}`;
    });
  },
};

function stringifyError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
