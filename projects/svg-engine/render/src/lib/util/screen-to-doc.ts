import type { Point } from '@mosaicoo/svg-engine/core';

/**
 * Project a client (screen) pixel coordinate into the document's
 * user-space coordinate system by inverting the SVG element's live
 * `getScreenCTM()`.
 *
 * **Why a shared util**: this is the single most duplicated helper
 * across the codebase. Until this util, the same 10-line block lived
 * in 5 different files (`custom-editor` (ex-`playground-home`), `selection-overlay`,
 * `canvas-gestures.directive`, `guides-overlay`, `rulers`) — every new
 * pointer-driven component had to re-implement the CTM dance with the
 * same defensive guards (jsdom missing `getScreenCTM`/`createSVGPoint`,
 * SSR-detached SVG returning a `null` CTM, etc.). Centralizing prevents
 * subtle drift (e.g., one site forgetting the `createSVGPoint` guard
 * and crashing under jsdom).
 *
 * **What it handles**:
 * - `svg === null` → returns `null` (caller didn't have an SVG ref yet)
 * - `getScreenCTM` not implemented → returns `null` (jsdom / SSR)
 * - `getScreenCTM` returns `null` → returns `null` (detached SVG)
 * - `createSVGPoint` not available → returns `null` (older SVG impls)
 *
 * **What it does NOT do**:
 * - Locate the `<svg>` element for you. Callers supply it via
 *   `ElementRef.ownerSVGElement`, `document.querySelector`, or a saved
 *   `viewChild` ref. Each caller knows the right way to reach its own
 *   SVG; baking a strategy here would couple this util to component DI.
 *
 * @param svg The `<svg>` element whose CTM defines the projection.
 *   Pass `null` to short-circuit (returns `null`).
 * @param clientX `clientX` from a `MouseEvent` / `PointerEvent`.
 * @param clientY `clientY` from a `MouseEvent` / `PointerEvent`.
 * @returns Doc-space `{ x, y }` or `null` when projection is impossible.
 */
export function screenToDoc(
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
): Point | null {
  if (svg === null) return null;
  if (typeof svg.getScreenCTM !== 'function') return null;
  if (typeof svg.createSVGPoint !== 'function') return null;
  const ctm = svg.getScreenCTM();
  if (ctm === null) return null;
  const inverse = ctm.inverse();
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const userSpace = pt.matrixTransform(inverse);
  return { x: userSpace.x, y: userSpace.y };
}
