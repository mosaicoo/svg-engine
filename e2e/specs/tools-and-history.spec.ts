import { test, expect } from '../fixtures';
import { EditorPage } from '../pages/editor.page';
import { canvasPointPx, dragOnCanvas } from '../utils/canvas';

/**
 * **E2E-F2 — tool/keyboard/history journeys** on `/custom-editor`, reusing the
 * F1 Page Object + pointer-drag helper. These exercise real browser paths that
 * headless specs can't: global keydown routing, in-progress-draft cancel, and
 * the undo/redo command stack end-to-end.
 */
test.describe('tools & history', () => {
  test('pressing "r" activates the Rectangle tool', async ({ page }) => {
    test.setTimeout(90_000);
    const editor = new EditorPage(page);
    await editor.goto('/custom-editor');

    // Default tool is Select; the shortcut should flip the active tool.
    await expect(editor.toolButton('Rectangle')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('r');
    await expect(editor.toolButton('Rectangle')).toHaveAttribute('aria-pressed', 'true');
  });

  test('Ellipse tool: dragging on the canvas inserts an ellipse', async ({ page }) => {
    test.setTimeout(90_000);
    const editor = new EditorPage(page);
    await editor.goto('/custom-editor');
    await editor.activateTool('Ellipse');

    const before = await editor.ellipseCount();
    await dragOnCanvas(page, editor.canvas, { x: 0.4, y: 0.4 }, { x: 0.65, y: 0.6 });
    await expect.poll(() => editor.ellipseCount(), { timeout: 5_000 }).toBe(before + 1);
  });

  test('Escape cancels an in-progress rectangle draft (no commit)', async ({ page }) => {
    test.setTimeout(90_000);
    const editor = new EditorPage(page);
    await editor.goto('/custom-editor');
    await editor.activateTool('Rectangle');

    const before = await editor.rectCount();
    const p1 = await canvasPointPx(editor.canvas, { x: 0.35, y: 0.35 });
    const p2 = await canvasPointPx(editor.canvas, { x: 0.6, y: 0.6 });

    // Begin a draft (down + move) but cancel with Esc BEFORE releasing.
    await page.mouse.move(p1.x, p1.y);
    await page.mouse.down();
    await page.mouse.move(p2.x, p2.y, { steps: 6 });
    await page.keyboard.press('Escape');
    await page.mouse.up();

    // The cancelled draft commits nothing — count is unchanged.
    await expect.poll(() => editor.rectCount(), { timeout: 3_000 }).toBe(before);
  });

  test('Undo removes a drawn rect; Redo brings it back', async ({ page }) => {
    test.setTimeout(90_000);
    const editor = new EditorPage(page);
    await editor.goto('/custom-editor');
    await editor.activateTool('Rectangle');

    const before = await editor.rectCount();
    await dragOnCanvas(page, editor.canvas, { x: 0.35, y: 0.35 }, { x: 0.62, y: 0.6 });
    await expect.poll(() => editor.rectCount(), { timeout: 5_000 }).toBe(before + 1);

    await page.keyboard.press('Control+z');
    await expect.poll(() => editor.rectCount(), { timeout: 5_000 }).toBe(before);

    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => editor.rectCount(), { timeout: 5_000 }).toBe(before + 1);
  });
});
