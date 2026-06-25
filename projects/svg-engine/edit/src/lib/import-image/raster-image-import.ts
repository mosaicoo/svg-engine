import type { Injector } from '@angular/core';
import {
  AUTO_PARENT,
  CommandBus,
  createImage,
  type ImageNode,
  InsertNodeCommand,
} from '@mosaicoo/svg-engine/core';
import { ViewportService } from '@mosaicoo/svg-engine/render';

import { ActivePageService } from '../pages/active-page.service';
import { SelectionService } from '../selection/selection.service';

/**
 * **D-117** — shared raster-image insertion, used by BOTH `Insert ▸ Image…`
 * and `File ▸ Import ▸ Image…` (same action; two menu entry points) and by
 * `File ▸ Import ▸ From URL…` (D-116). Inserts a raster `<image>` ADDITIVELY,
 * sized to the image's **natural dimensions** (fixing the old square-placeholder
 * behaviour of `Insert ▸ Image`), centered on the active page.
 *
 * Injector-based so both the Insert plugin (which already resolves via
 * `runCtx.injector`) and the File-menu plugin (`fromCtx` = same injector) can
 * call it without duplicating logic.
 */

/** Center for an additive insert: active page artboard center, else viewport center. */
function insertionCenter(injector: Injector): { cx: number; cy: number } {
  const pageVb = injector.get(ActivePageService).activePageViewBox();
  if (pageVb !== null) {
    return { cx: pageVb.x + pageVb.width / 2, cy: pageVb.y + pageVb.height / 2 };
  }
  const vp = injector.get(ViewportService).viewBox();
  return { cx: vp.x + vp.width / 2, cy: vp.y + vp.height / 2 };
}

/**
 * Build an `<image>` node of size `width`×`height` centered at `(cx, cy)`.
 * Pure — exported for testing (the natural-aspect-ratio sizing is the fix that
 * replaced `Insert ▸ Image`'s square placeholder).
 */
export function buildRasterImageNode(
  center: { cx: number; cy: number },
  width: number,
  height: number,
  href: string,
): ImageNode {
  return createImage({
    x: center.cx - width / 2,
    y: center.cy - height / 2,
    width,
    height,
    href,
    preserveAspectRatio: 'xMidYMid meet',
  });
}

/**
 * Insert a raster `<image>` (data URI or external href) ADDITIVELY, sized to
 * the image's NATURAL dimensions and centered on the active page. Loads the
 * image once to read its natural size; a load failure alerts without mutating
 * the document. No-op without an injector or DOM.
 */
export function insertRasterImageFromHref(injector: Injector | undefined, href: string): void {
  if (injector === undefined || typeof Image === 'undefined') return;
  const img = new Image();
  img.onload = (): void => {
    // Fallback to a sane default if the browser can't report a natural size.
    const w = img.naturalWidth || 200;
    const h = img.naturalHeight || 200;
    const node = buildRasterImageNode(insertionCenter(injector), w, h, href);
    injector.get(CommandBus).dispatch(new InsertNodeCommand(AUTO_PARENT, node));
    injector.get(SelectionService).select(node.id);
  };
  img.onerror = (): void => {
    if (typeof window !== 'undefined') window.alert('Could not load the image.');
  };
  // No crossOrigin: we only need natural size + an <img> to display, never
  // pixel access — so an external (non-CORS) image still loads.
  img.src = href;
}

/**
 * Browser-native image file picker → embed the chosen file as a data URI and
 * insert via {@link insertRasterImageFromHref}. The data URI keeps the document
 * self-contained (survives export → import; users who care about file size can
 * switch to an explicit asset upload later via the Asset Manager).
 */
export function pickAndInsertRasterImage(injector: Injector | undefined): void {
  if (injector === undefined || typeof document === 'undefined') return;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  input.addEventListener(
    'change',
    () => {
      const file = input.files?.[0];
      input.remove();
      if (file === undefined || file === null) return;
      const reader = new FileReader();
      reader.onload = (): void => {
        if (typeof reader.result === 'string') {
          insertRasterImageFromHref(injector, reader.result);
        }
      };
      reader.readAsDataURL(file);
    },
    { once: true },
  );
  document.body.appendChild(input);
  input.click();
}
