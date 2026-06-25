import { test, expect } from '../fixtures';
import { EditorPage } from '../pages/editor.page';
import { dragOnCanvas } from '../utils/canvas';

/**
 * **E2E-F1 proving test.** Exercises the new Page Object + pointer-drag helper
 * end-to-end with a real user journey: pick the Rectangle tool and drag on the
 * canvas. A real pointer gesture routes through the app to the Rectangle tool,
 * which commits one `InsertNodeCommand` on pointer-up — so a fresh `<rect>`
 * appears in the rendered SVG. This is the gesture path that headless specs
 * cannot cover.
 */
test.describe('draw', () => {
  test('Rectangle tool: dragging on the canvas inserts a rect', async ({ page }) => {
    test.setTimeout(90_000); // first lazy-route compile can be slow on a cold server

    const editor = new EditorPage(page);
    await editor.goto('/custom-editor');
    await editor.activateTool('Rectangle');

    const before = await editor.rectCount();

    // Drag a sizeable box well inside the canvas (fractions of its bbox).
    await dragOnCanvas(page, editor.canvas, { x: 0.35, y: 0.35 }, { x: 0.62, y: 0.6 });

    // After pointer-up the dashed preview is gone and the committed rect is in
    // the tree — poll so we wait for the dispatch + re-render to settle.
    await expect.poll(() => editor.rectCount(), { timeout: 5_000 }).toBe(before + 1);
  });
});
