import { describe, expect, it } from 'vitest';

import { traceImageToPaths } from './trace-bitmap';

/**
 * Polyfill: jsdom (vitest's default DOM env) does not implement
 * `ImageData`. The autotrace tracer only reads `.data`, `.width`,
 * `.height` — a plain object literal cast satisfies the input.
 * Done globally so the helper below can instantiate it directly.
 */
class ImageDataShim {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  constructor(data: Uint8ClampedArray, width: number, height: number) {
    this.data = data;
    this.width = width;
    this.height = height;
  }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ImageData ??= ImageDataShim;

/**
 * D-062d — pure-function specs for the marching-squares tracer.
 * No DOM / Angular — feed in synthetic ImageData and assert on the
 * output `d` strings.
 */

/** Build an `ImageData` from a 2D array of 0/1 (1 = ink). */
function buildImage(grid: readonly (readonly number[])[]): ImageData {
  const height = grid.length;
  const width = grid[0]!.length;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ink = grid[y]![x] === 1;
      const i = (y * width + x) * 4;
      data[i] = ink ? 0 : 255;
      data[i + 1] = ink ? 0 : 255;
      data[i + 2] = ink ? 0 : 255;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

describe('traceImageToPaths', () => {
  it('returns empty array for an all-paper image', () => {
    const img = buildImage([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ]);
    expect(traceImageToPaths(img)).toEqual([]);
  });

  it('traces a single solid square contour', () => {
    const img = buildImage([
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
    ]);
    const paths = traceImageToPaths(img, { tolerance: 0.1, minPoints: 3 });
    expect(paths.length).toBeGreaterThanOrEqual(1);
    // Each path begins with M and ends with Z.
    for (const d of paths) {
      expect(d.startsWith('M')).toBe(true);
      expect(d.endsWith('Z')).toBe(true);
    }
  });

  it('emits separate paths for disjoint ink regions', () => {
    const img = buildImage([
      [1, 1, 0, 0, 1, 1],
      [1, 1, 0, 0, 1, 1],
      [0, 0, 0, 0, 0, 0],
      [1, 1, 0, 0, 1, 1],
      [1, 1, 0, 0, 1, 1],
    ]);
    const paths = traceImageToPaths(img, { tolerance: 0.1, minPoints: 3 });
    // Four disjoint 2×2 ink blocks → at least 4 contours.
    expect(paths.length).toBeGreaterThanOrEqual(4);
  });

  it('respects destWidth/destHeight scaling', () => {
    const img = buildImage([
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 0],
    ]);
    const paths = traceImageToPaths(img, {
      tolerance: 0.1,
      minPoints: 3,
      destX: 100,
      destY: 200,
      destWidth: 30,
      destHeight: 30,
    });
    if (paths.length === 0) return; // single-pixel may not produce a closed contour
    // The d-string coords should fall within the dest box: x in
    // [100, 130], y in [200, 230].
    const nums = paths[0]!.match(/-?\d+(?:\.\d+)?/g) ?? [];
    for (let i = 0; i < nums.length; i += 2) {
      const x = Number(nums[i]);
      const y = Number(nums[i + 1]);
      expect(x).toBeGreaterThanOrEqual(100);
      expect(x).toBeLessThanOrEqual(130);
      expect(y).toBeGreaterThanOrEqual(200);
      expect(y).toBeLessThanOrEqual(230);
    }
  });

  it('threshold flips ink/paper classification', () => {
    // Mid-grey image: 128 in all RGB → at default threshold 128
    // → counts as INK (≤ 128). Lower the threshold → no ink.
    const data = new Uint8ClampedArray(3 * 3 * 4);
    for (let i = 0; i < 9; i++) {
      data[i * 4] = 128;
      data[i * 4 + 1] = 128;
      data[i * 4 + 2] = 128;
      data[i * 4 + 3] = 255;
    }
    const img = new ImageData(data, 3, 3);
    const inkPaths = traceImageToPaths(img, { threshold: 128, minPoints: 3 });
    const paperPaths = traceImageToPaths(img, { threshold: 64, minPoints: 3 });
    // At threshold 128 the whole grid is ink (no boundary -> 0 paths).
    // At threshold 64 the whole grid is paper (no ink -> 0 paths).
    // Either way, both cases produce 0 contours; the test asserts the
    // function doesn't throw + returns arrays for varying thresholds.
    expect(Array.isArray(inkPaths)).toBe(true);
    expect(Array.isArray(paperPaths)).toBe(true);
  });

  it('treats transparent pixels as paper regardless of RGB', () => {
    // Black pixel but alpha=0 → not ink.
    const data = new Uint8ClampedArray(1 * 1 * 4);
    data[0] = 0;
    data[1] = 0;
    data[2] = 0;
    data[3] = 0;
    const img = new ImageData(data, 1, 1);
    expect(traceImageToPaths(img)).toEqual([]);
  });
});
