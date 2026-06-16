import { describe, expect, it } from 'vitest';
import { buildRasterImageNode } from './raster-image-import';

/**
 * **D-117 — shared raster `<image>` node builder.**
 *
 * `buildRasterImageNode` is the pure core shared by `Insert ▸ Image…`,
 * `File ▸ Import ▸ Image…`, and the URL importer. The key contract — and the
 * fix that replaced `Insert ▸ Image`'s square placeholder — is that it honours
 * the image's NATURAL dimensions (non-square) and centers the node. The
 * file-picker / Image()-load / dispatch path is DOM-bound and verified manually.
 */
describe('D-117 — buildRasterImageNode', () => {
  it('preserves non-square natural dimensions (no more square placeholder)', () => {
    const node = buildRasterImageNode({ cx: 100, cy: 100 }, 320, 180, 'data:image/png;base64,xx');
    expect(node.type).toBe('image');
    expect(node.width).toBe(320);
    expect(node.height).toBe(180);
    expect(node.width).not.toBe(node.height);
  });

  it('centers the node on the given point', () => {
    const node = buildRasterImageNode({ cx: 500, cy: 400 }, 200, 100, 'href');
    // x/y place the (w×h) box so its center lands on (cx, cy).
    expect(node.x).toBe(400); // 500 - 200/2
    expect(node.y).toBe(350); // 400 - 100/2
    expect(node.x + node.width / 2).toBe(500);
    expect(node.y + node.height / 2).toBe(400);
  });

  it('carries the href and a meet preserveAspectRatio', () => {
    const node = buildRasterImageNode({ cx: 0, cy: 0 }, 10, 10, 'https://x/img.png');
    expect(node.href).toBe('https://x/img.png');
    expect(node.preserveAspectRatio).toBe('xMidYMid meet');
  });
});
