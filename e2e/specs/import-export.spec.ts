import { readFileSync } from 'node:fs';
import { test, expect } from '../fixtures';
import { EditorPage } from '../pages/editor.page';
import { dragOnCanvas } from '../utils/canvas';

/**
 * **E2E-F3 — import / export in a real browser.** Covers the IO pipeline
 * end-to-end: pasting SVG renders it (incl. the D-115 nested-`<defs>` hoist),
 * and exporting a drawn document produces a downloadable SVG file. Zero app
 * change — drives the existing `/svg-viewer` textarea and the custom-editor
 * "Export SVG" button.
 */
test.describe('import / export', () => {
  test('pasting SVG into the viewer renders its shapes', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/svg-viewer', { waitUntil: 'domcontentloaded' });

    const textarea = page.locator('#svg-source');
    await expect(textarea).toBeVisible({ timeout: 60_000 });

    await textarea.fill(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
        '<rect x="10" y="10" width="80" height="80" fill="#1976d2"/></svg>',
    );

    const rendered = page.locator('svge-renderer svg').first();
    await expect(rendered).toBeVisible();
    await expect(rendered.locator('rect')).toHaveCount(1);
    await expect(rendered.locator('rect').first()).toHaveAttribute('fill', '#1976d2');
  });

  test('import hoists a nested <defs> so the gradient renders (D-115)', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/svg-viewer', { waitUntil: 'domcontentloaded' });

    const textarea = page.locator('#svg-source');
    await expect(textarea).toBeVisible({ timeout: 60_000 });

    // The reported SVG: <defs> sits INSIDE a transformed <g> (not top-level).
    await textarea.fill(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' +
        '<g transform="translate(56,80) scale(2.0)">' +
        '<defs><linearGradient id="g_ic"><stop offset="0" stop-color="#e25361"/>' +
        '<stop offset="1" stop-color="#f06a76"/></linearGradient></defs>' +
        '<path d="M 30,150 C 30,92 62,52 100,52" stroke="url(#g_ic)" stroke-width="8" fill="none"/>' +
        '</g></svg>',
    );

    const rendered = page.locator('svge-renderer svg').first();
    await expect(rendered).toBeVisible();
    // The hoisted gradient is present in the rendered markup.
    const html = await rendered.evaluate((el) => el.innerHTML);
    expect(html).toContain('linearGradient');
    expect(html).toContain('g_ic');
    expect(html).toContain('e25361');
  });

  test('Export SVG downloads the drawn document', async ({ page }) => {
    test.setTimeout(90_000);
    const editor = new EditorPage(page);
    await editor.goto('/custom-editor');

    // Draw a rect so the exported document has user content.
    await editor.activateTool('Rectangle');
    const before = await editor.rectCount();
    await dragOnCanvas(page, editor.canvas, { x: 0.35, y: 0.35 }, { x: 0.62, y: 0.6 });
    await expect.poll(() => editor.rectCount(), { timeout: 5_000 }).toBe(before + 1);

    // Click "Export SVG" and capture the triggered download.
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export SVG', exact: true }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^svge-export-.*\.svg$/);
    const path = await download.path();
    const content = readFileSync(path, 'utf8');
    expect(content).toContain('<svg');
    expect(content).toContain('<rect');
  });
});
