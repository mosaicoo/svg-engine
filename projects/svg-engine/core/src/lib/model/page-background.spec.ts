import { describe, expect, it } from 'vitest';
import { createGroup, createRect } from './node-factory';
import { withPageFlag, withPageOptions } from './page';
import { getPageBackgroundNode, PAGE_BACKGROUND_IMAGE_PAR } from './page-background';
import type { ImageNode } from './image-node';
import type { RectNode } from './rect-node';

const VB = { x: 5, y: 10, width: 200, height: 150 };

function makePage(background?: import('./page').PageBackground) {
  let page = withPageFlag(createGroup([createRect({ x: 0, y: 0, width: 1, height: 1 })]), VB);
  if (background !== undefined) page = withPageOptions(page, { background });
  return page;
}

describe('getPageBackgroundNode', () => {
  it('returns a rect covering the page viewBox for a solid background', () => {
    const node = getPageBackgroundNode(makePage({ kind: 'solid', color: '#ff8800' }));
    expect(node).not.toBeNull();
    expect(node!.type).toBe('rect');
    const rect = node as RectNode;
    expect(rect.x).toBe(VB.x);
    expect(rect.y).toBe(VB.y);
    expect(rect.width).toBe(VB.width);
    expect(rect.height).toBe(VB.height);
    expect(rect.style.fill).toBe('#ff8800');
    // No stroke / opacity overrides — pure solid fill.
    expect(rect.style.stroke).toBeUndefined();
  });

  it('returns an image covering the page viewBox (cover PAR) for an image background', () => {
    const node = getPageBackgroundNode(makePage({ kind: 'image', href: 'bg.png' }));
    expect(node).not.toBeNull();
    expect(node!.type).toBe('image');
    const img = node as ImageNode;
    expect(img.href).toBe('bg.png');
    expect(img.width).toBe(VB.width);
    expect(img.height).toBe(VB.height);
    expect(img.preserveAspectRatio).toBe(PAGE_BACKGROUND_IMAGE_PAR);
  });

  it('returns null for a transparent background (default)', () => {
    expect(getPageBackgroundNode(makePage())).toBeNull();
    expect(getPageBackgroundNode(makePage({ kind: 'transparent' }))).toBeNull();
  });

  it('returns null for a non-page group (no viewBox)', () => {
    const plain = createGroup([createRect({ x: 0, y: 0, width: 1, height: 1 })]);
    expect(getPageBackgroundNode(plain)).toBeNull();
  });

  it('returns null for a degenerate (zero-size) page viewBox', () => {
    const page = withPageOptions(
      withPageFlag(createGroup([]), { x: 0, y: 0, width: 0, height: 100 }),
      { background: { kind: 'solid', color: '#000' } },
    );
    expect(getPageBackgroundNode(page)).toBeNull();
  });
});
