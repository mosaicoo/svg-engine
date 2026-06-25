import type { Locator, Page } from '@playwright/test';

/** A point expressed as fractions [0..1] of the canvas bounding box. */
export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Resolve a fraction-of-bbox `point` to absolute viewport px over `canvas`.
 * Useful for raw mouse sequences (e.g. start a drag, press a key, release).
 */
export async function canvasPointPx(
  canvas: Locator,
  point: CanvasPoint,
): Promise<{ x: number; y: number }> {
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('canvasPointPx: canvas has no bounding box (not visible?)');
  return { x: box.x + box.width * point.x, y: box.y + box.height * point.y };
}

/**
 * **E2E-F1 — canvas pointer helper.** Drag from `from` to `to` (both as
 * fractions of the canvas bbox: `{x:0.5,y:0.5}` = center) using **real CDP
 * mouse events**, so the app's `(pointerdown/move/up)` handlers and the active
 * tool's routing fire exactly as for a human. Fractions (not absolute px) keep
 * the gesture resilient to canvas size / zoom.
 *
 * `steps` interpolates the move so tools that update on `pointermove` (shape
 * preview, marquee, …) see intermediate positions, matching a real drag.
 */
export async function dragOnCanvas(
  page: Page,
  canvas: Locator,
  from: CanvasPoint,
  to: CanvasPoint,
  steps = 8,
): Promise<void> {
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('dragOnCanvas: canvas has no bounding box (not visible?)');
  const at = (p: CanvasPoint): { x: number; y: number } => ({
    x: box.x + box.width * p.x,
    y: box.y + box.height * p.y,
  });
  const a = at(from);
  const b = at(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}
