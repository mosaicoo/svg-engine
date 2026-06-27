import type { SvgDocument } from '@mosaicoo/svg-engine/core';
import { embedUsedFonts } from './font-embed';
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
 * **Quality**: the `pngExporter` Exporter defaults to 2× the viewBox
 * resolution (retina-crisp, matching Affinity / Figma export defaults).
 * The scale is configurable via {@link renderPng}(doc, scale) — any
 * positive multiplier — which the editor's @1x/@2x/@3x export presets
 * use. Only the `Exporter.export(doc)` entry point is fixed at 2×,
 * because the `Exporter` interface has no scale parameter.
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
/**
 * Render a `SvgDocument` to a PNG Blob at the requested `scale`
 * multiplier (1, 2, 3 — or any positive number). Reused by both the
 * `Exporter` interface implementation and the playground's
 * "Export PNG with presets" dialog.
 *
 * Pipeline matches the original `pngExporter`: serialize → base64 →
 * `<img>` load → `<canvas>` paint → `toBlob('image/png')`.
 */
export async function renderPng(document: SvgDocument, scale = 2): Promise<Blob> {
  if (typeof window === 'undefined' || typeof Image === 'undefined') {
    throw new Error('renderPng requires a browser environment');
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`renderPng: invalid scale ${scale}`);
  }
  const svgText = svgExporter.export(document);
  if (typeof svgText !== 'string') {
    throw new Error('renderPng: svgExporter returned non-string');
  }
  const vb = document.viewBox;
  const canvasWidth = Math.max(1, Math.round(vb.width * scale));
  const canvasHeight = Math.max(1, Math.round(vb.height * scale));

  // **PNG font fidelity** — inline the web fonts the document's text
  // actually uses so the rasterizing `<img>` doesn't fall back to a
  // system font. Best-effort: returns the SVG unchanged when there's
  // nothing custom to embed (system fonts, no @font-face) or on any
  // fetch/CORS failure — export never fails because of fonts.
  const svgWithFonts = await embedUsedFonts(svgText, document.root);

  return rasterizeSvg(svgWithFonts, canvasWidth, canvasHeight);
}

/**
 * Paint a serialized SVG string onto an offscreen `<canvas>` and extract
 * a PNG Blob. The only way browsers convert SVG → raster on the main
 * thread is via an `<img>`, so we wrap the SVG in a base64 `data:` URI,
 * load it, draw it scaled to the target pixel size, and `toBlob`.
 */
function rasterizeSvg(svgText: string, canvasWidth: number, canvasHeight: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    let base64: string;
    try {
      base64 = btoa(unescape(encodeURIComponent(svgText)));
    } catch (e) {
      reject(new Error(`renderPng: failed to base64-encode SVG: ${stringifyError(e)}`));
      return;
    }
    img.onload = () => {
      const canvas = window.document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');
      if (ctx === null) {
        reject(new Error('renderPng: canvas 2D context unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      canvas.toBlob((blob) => {
        if (blob === null) {
          reject(new Error('renderPng: canvas.toBlob returned null'));
        } else {
          resolve(blob);
        }
      }, 'image/png');
    };
    img.onerror = () => {
      reject(new Error('renderPng: Image failed to load SVG payload'));
    };
    img.src = `data:image/svg+xml;base64,${base64}`;
  });
}

export const pngExporter: Exporter = {
  id: 'svge.builtin.exporter.png',
  name: 'PNG (raster)',
  mediaType: 'image/png',
  extension: 'png',
  /**
   * Default export uses 2× scale — retina-quality default that matches
   * Affinity / Figma export defaults. Callers that need a different
   * scale (1×/3× presets, custom DPI) should use {@link renderPng}
   * directly instead of dispatching through the `ExporterRegistry`.
   */
  export(document: SvgDocument): Promise<Blob> {
    return renderPng(document, 2);
  },
};

function stringifyError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
