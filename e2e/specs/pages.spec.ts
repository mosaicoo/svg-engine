import { test, expect } from '../fixtures';

/**
 * **E2E-F3b — pages (artboards) on the pro editor.** The pages strip lives in
 * `<svge-shell-pro>` (route `/pro-editor`) as a canvas overlay — not in the
 * hand-built `/custom-editor`. Drives the real `role="tablist"` named "Pages":
 * add a page (the new one becomes active) and switch back to the first. Zero
 * app change; assertions ride on the existing ARIA roles.
 */
test.describe('pages', () => {
  test('add a page (becomes active), then switch back to the first', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/pro-editor', { waitUntil: 'domcontentloaded' });

    // Scope to the Pages tablist — shell-pro has other `role="tab"` elements
    // in its right-rail panel groups, so a page-wide getByRole('tab') would
    // over-match.
    const pagesBar = page.getByRole('tablist', { name: 'Pages' });
    await expect(pagesBar).toBeVisible({ timeout: 60_000 });

    const tabs = pagesBar.getByRole('tab');
    const addPage = pagesBar.getByRole('button', { name: 'Add page' });

    // Add a page → one more tab, and the new (last) one is the active page.
    const start = await tabs.count();
    await addPage.click();
    await expect(tabs).toHaveCount(start + 1);
    await expect(tabs.last()).toHaveAttribute('aria-selected', 'true');

    // Guarantee at least two tabs so the "switch back" assertion is meaningful.
    if ((await tabs.count()) < 2) {
      await addPage.click();
      await expect(tabs).toHaveCount(start + 2);
    }

    // Click the first tab → it becomes the active page; the last is no longer.
    await tabs.first().click();
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.last()).toHaveAttribute('aria-selected', 'false');
  });
});
