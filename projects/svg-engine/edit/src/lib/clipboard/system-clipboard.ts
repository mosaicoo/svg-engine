import type { Injector } from '@angular/core';
import {
  type BoundingBox,
  createGroup,
  createImage,
  createText,
  EditorStateService,
  getNodeBBox,
  type SvgDocument,
  type SvgNode,
} from '@mosaicoo/svg-engine/core';
import { renderPng, svgExporter, svgImporter } from '@mosaicoo/svg-engine/io';

import { ImportPlacementService } from '../import-placement/import-placement.service';
import { ClipboardService } from './clipboard.service';

/**
 * **D-111 — System (OS) clipboard bridge.** Lets Copy/Cut/Paste cross the
 * application boundary, transferring **images and text** to/from other apps —
 * which the in-memory {@link ClipboardService} alone cannot do.
 *
 * Implemented as functions (not an injectable service) so they resolve the
 * SCOPED editor services from the per-fire `Injector`, exactly like the menu
 * handlers — keeping multi-editor correctness (D-042). A `providedIn:'root'`
 * service would capture the ROOT instances instead.
 *
 * **Copy** writes two MIME types the browser accepts on write:
 * - `text/plain` = the selection serialized to SVG (pastes as source into code
 *   editors / SVG-aware tools);
 * - `image/png` = the selection rasterized via {@link renderPng} (pastes a
 *   picture into image editors, docs, chat).
 *
 * `image/svg+xml` is deliberately NOT written — Chromium blocks arbitrary MIME
 * types on `clipboard.write`, so the portable combo is text + PNG.
 *
 * **Paste** reads the OS clipboard and, in priority order:
 * 1. an **image** (any `image/*`) → an `<image>` node sized to its natural
 *    dimensions, centered on the active page;
 * 2. **text** that looks like `<svg…>` → parsed via {@link svgImporter} and
 *    placed (defs merged + namespaced, like `File ▸ Import ▸ SVG`);
 * 3. any other **text** → a text node.
 *
 * **Lossless internal paste**: when the OS clipboard's text equals the stamp we
 * recorded on the last Copy (and the in-memory clipboard still holds it), Paste
 * returns `false` so the caller uses the lossless in-memory nodes instead —
 * preserving ids/metadata for the common copy-then-paste-in-app flow.
 *
 * **Graceful degradation**: every OS call is guarded + try/caught. On an
 * insecure context (HTTP), a missing API, or a denied permission, copy silently
 * keeps only the in-memory clipboard and paste returns `false` (caller falls
 * back to in-memory) — the editor never throws because of the clipboard.
 */

/** Quick test for "this text is an SVG document" (vs plain text). */
const SVG_MARKUP_RE = /<svg[\s>]/i;

/** Build a tight sub-document from `nodes` (world coords) for export / raster. */
function selectionDocument(injector: Injector, nodes: readonly SvgNode[]): SvgDocument {
  const bbox = getNodeBBox(createGroup(nodes));
  const viewBox: BoundingBox =
    bbox.width > 0 && bbox.height > 0 ? bbox : { x: 0, y: 0, width: 100, height: 100 };
  return {
    id: 'clip' as never,
    viewBox,
    // Include the document's defs so `url(#grad)` / filters resolve in the
    // exported SVG and the rasterized PNG.
    defs: injector.get(EditorStateService).document().defs,
    root: createGroup(nodes, { id: 'clip-root' as never }),
  };
}

/**
 * Write the selected `nodes` to the OS clipboard as `text/plain` (SVG) +
 * `image/png` (raster). Best-effort: never throws. Also records the SVG text as
 * the {@link ClipboardService} stamp so a later Paste can detect "still ours".
 */
export async function writeSelectionToSystemClipboard(
  injector: Injector,
  nodes: readonly SvgNode[],
): Promise<void> {
  if (nodes.length === 0) return;
  const doc = selectionDocument(injector, nodes);
  const svgText = svgExporter.export(doc);
  if (typeof svgText !== 'string') return;

  injector.get(ClipboardService).setExternalStamp(svgText);

  if (typeof navigator === 'undefined' || navigator.clipboard === undefined) return;

  const textBlob = new Blob([svgText], { type: 'text/plain' });
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write !== undefined) {
      // Pass the PNG as a Promise so the browser keeps the user-gesture window
      // open while it rasterizes (Safari-safe). If rasterizing rejects, the
      // whole write rejects → the catch below falls back to text-only.
      const item = new ClipboardItem({
        'text/plain': textBlob,
        'image/png': renderPng(doc),
      });
      await navigator.clipboard.write([item]);
      return;
    }
  } catch {
    // Combined write failed — fall through to text-only.
  }
  try {
    await navigator.clipboard.writeText?.(svgText);
  } catch {
    // No clipboard access at all — the in-memory copy still works in-app.
  }
}

/**
 * Read the OS clipboard and paste its content (image / SVG / text) centered on
 * the active page. Returns `true` when it inserted external content, `false`
 * when there is nothing external to paste OR the OS clipboard still holds our
 * own copy — in both cases the caller should fall back to the lossless
 * in-memory paste.
 */
export async function pasteFromSystemClipboard(injector: Injector): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    navigator.clipboard === undefined ||
    navigator.clipboard.read === undefined
  ) {
    return false;
  }

  let items: ClipboardItem[];
  try {
    items = await navigator.clipboard.read();
  } catch {
    // Permission denied / insecure context — let the caller use in-memory.
    return false;
  }

  const clipboard = injector.get(ClipboardService);

  for (const item of items) {
    // 1) Image (any format) → <image> node.
    const imageType = item.types.find((t) => t.startsWith('image/'));
    if (imageType !== undefined) {
      try {
        const blob = await item.getType(imageType);
        if (await pasteImageBlob(injector, blob)) return true;
      } catch {
        // Fall through to text handling for this item.
      }
    }

    // 2) Text → SVG (import) or plain text (text node).
    const textType = item.types.includes('text/plain')
      ? 'text/plain'
      : item.types.includes('text/html')
        ? 'text/html'
        : undefined;
    if (textType !== undefined) {
      let text: string;
      try {
        text = (await (await item.getType(textType)).text()).trim();
      } catch {
        continue;
      }
      if (text.length === 0) continue;

      // The OS clipboard still holds OUR last copy → use lossless in-memory.
      if (clipboard.hasContent() && text === clipboard.externalStamp()) {
        return false;
      }
      if (SVG_MARKUP_RE.test(text)) {
        if (pasteSvgText(injector, text)) return true;
      } else {
        pasteTextNode(injector, text);
        return true;
      }
    }
  }
  return false;
}

/** Paste an image blob as a centered `<image>` node sized to its pixels. */
async function pasteImageBlob(injector: Injector, blob: Blob): Promise<boolean> {
  const dataUrl = await blobToDataUrl(blob);
  const size = await imageNaturalSize(dataUrl);
  if (size === null) return false;
  const node = createImage(
    { x: 0, y: 0, width: size.width, height: size.height, href: dataUrl },
    // EMPTY style — `createImage` defaults to DEFAULT_STYLE whose stroke would
    // paint a dark border around the pasted picture (the D-104 lesson).
    { style: {} },
  );
  const doc: SvgDocument = {
    id: 'clip' as never,
    viewBox: { x: 0, y: 0, width: size.width, height: size.height },
    root: createGroup([node], { id: 'clip-root' as never }),
  };
  return injector.get(ImportPlacementService).placeDocumentCentered(doc) !== null;
}

/** Parse SVG markup and place it (defs merged + namespaced), like File ▸ Import. */
function pasteSvgText(injector: Injector, text: string): boolean {
  const result = svgImporter.import(text);
  if (!result.ok) return false;
  return injector.get(ImportPlacementService).placeDocumentCentered(result.document) !== null;
}

/** Paste arbitrary text as a centered text node. */
function pasteTextNode(injector: Injector, text: string): void {
  // Cap the length so a giant clipboard payload doesn't create an unwieldy node.
  const content = text.length > 2000 ? text.slice(0, 2000) : text;
  const node = createText(
    { x: 0, y: 16, content, fontSize: 16, fontFamily: 'system-ui, sans-serif' },
    { style: { fill: '#000000' } },
  );
  const doc: SvgDocument = {
    id: 'clip' as never,
    viewBox: { x: 0, y: 0, width: 240, height: 32 },
    root: createGroup([node], { id: 'clip-root' as never }),
  };
  injector.get(ImportPlacementService).placeDocumentCentered(doc);
}

/** Read a Blob as a `data:` URL (so it survives as an `<image href>`). */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('FileReader failed to read clipboard image'));
    reader.readAsDataURL(blob);
  });
}

/** Decode a data-URL image to learn its natural pixel size. `null` on failure. */
function imageNaturalSize(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
