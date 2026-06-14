import type { GroupNode } from './group-node';
import { createImage, createRect } from './node-factory';
import { getPageOptions, getPageViewBox } from './page';
import type { SvgNode } from './svg-node';

/**
 * `preserveAspectRatio` used for page-background **images** — `slice`
 * (cover) so the image fills the whole page, mirroring the desk
 * background's `background-size: cover`. Exported as a constant so the
 * live `PageOverlay` paint and the export projection use the SAME value
 * (parity between canvas and exported file).
 */
export const PAGE_BACKGROUND_IMAGE_PAR = 'xMidYMid slice';

/**
 * **Page background as artwork** — build the SVG node that paints a
 * page's {@link PageOptions.background} across its viewBox, or `null`
 * when there's nothing to paint.
 *
 * The per-page background (solid colour / image) is part of the artwork,
 * not editor chrome — so it must appear BOTH on the live canvas and in
 * the exported file. This single helper is the source of truth for both:
 *
 * - **Export** (`ActivePageService.effectiveExportDoc`) prepends the
 *   returned node to the page's children, so it serializes behind the
 *   content into the `.svg` / `.png`.
 * - **Live canvas** reads the same `getPageOptions(...).background` to
 *   paint the equivalent rect / image behind the page content.
 *
 * Returns `null` for:
 * - `transparent` backgrounds (the page stays see-through — PNG keeps an
 *   alpha background, matching the canvas),
 * - pages without a stored viewBox, or
 * - degenerate viewBoxes (zero / negative width or height).
 *
 * The node is **synthetic / transient** — only ever prepended to a
 * projected export tree or used to drive a live overlay binding. It is
 * never inserted into the stored document (the background lives in the
 * page's options, not as a child shape).
 */
export function getPageBackgroundNode(page: GroupNode): SvgNode | null {
  const box = getPageViewBox(page);
  if (box === null || box.width <= 0 || box.height <= 0) return null;
  const bg = getPageOptions(page).background;
  if (bg.kind === 'solid') {
    return createRect(
      { x: box.x, y: box.y, width: box.width, height: box.height },
      { style: { fill: bg.color } },
    );
  }
  if (bg.kind === 'image') {
    return createImage({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      href: bg.href,
      preserveAspectRatio: PAGE_BACKGROUND_IMAGE_PAR,
    });
  }
  return null; // transparent — nothing to paint
}
