import { test, expect } from '../fixtures';

/**
 * **F0 smoke.** Proves the E2E harness is wired end-to-end: Playwright boots
 * the `playground` dev server, navigates to the default editor route, and
 * sees a real rendered `<svg>` canvas (the `<svge-renderer>` output). No app
 * code is touched — assertions ride on existing component selectors.
 */
test.describe('smoke', () => {
  test('loads the custom editor with a rendered canvas', async ({ page }) => {
    // The first navigation to a lazy route triggers an on-demand dev-server
    // compile, which can be slow on a cold server — give it room.
    test.setTimeout(90_000);

    await page.goto('/custom-editor', { waitUntil: 'domcontentloaded' });

    // `<svge-renderer>` mounts a real <svg> — that's the editor canvas.
    const canvas = page.locator('svge-renderer svg').first();
    await expect(canvas).toBeVisible({ timeout: 60_000 });

    // We actually landed on the editor route (not an error redirect).
    expect(new URL(page.url()).pathname).toBe('/custom-editor');
  });
});
