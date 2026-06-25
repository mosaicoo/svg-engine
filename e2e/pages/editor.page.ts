import { expect, type Locator, type Page } from '@playwright/test';

/**
 * **E2E-F1 — Page Object for the playground's hand-built editor**
 * (`/custom-editor`). Centralizes the stable selectors so specs read as user
 * intent ("activate Rectangle", "drag on the canvas") instead of CSS.
 *
 * Selectors lean on what the app already exposes — no app-code change:
 * - **canvas**: the `[aria-label="SVG canvas"]` element that owns the
 *   `(pointerdown/move/up)` handlers routing to the active tool.
 * - **renderer**: the real `<svg>` the `<svge-renderer>` mounts.
 * - **tool buttons**: each tool renders a `<button>` whose visible text is the
 *   tool label (e.g. "Rectangle"), distinct from the "Add ▸ Rect" button.
 */
export class EditorPage {
  /** Pointer-event target for canvas gestures. */
  readonly canvas: Locator;
  /** The rendered SVG canvas. */
  readonly renderer: Locator;

  constructor(private readonly page: Page) {
    this.canvas = page.getByLabel('SVG canvas');
    this.renderer = page.locator('svge-renderer svg').first();
  }

  /** Open a route and wait until the canvas has rendered. */
  async goto(route = '/custom-editor'): Promise<void> {
    await this.page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(this.renderer).toBeVisible({ timeout: 60_000 });
  }

  /** Activate a tool by its visible toolbar label (exact match, e.g. "Rectangle"). */
  async activateTool(label: string): Promise<void> {
    const button = this.page.getByRole('button', { name: label, exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }

  /** How many `<rect>` elements are currently rendered inside the canvas. */
  rectCount(): Promise<number> {
    return this.renderer.locator('rect').count();
  }
}
