import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { createEmptyDocument } from '../document/document-factory';
import { createImage, createRect } from '../model/node-factory';
import type { GroupNode } from '../model/group-node';
import type { ImageNode } from '../model/image-node';
import { EditorStateService } from '../state/editor-state.service';
import { generateNodeId } from '../types/node-id';
import { RasterizeNodeCommand } from './rasterize-node.command';

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  const doc = createEmptyDocument();
  const a = createRect({ x: 0, y: 0, width: 10, height: 10 });
  const b = createRect({ x: 20, y: 0, width: 10, height: 10 });
  const c = createRect({ x: 40, y: 0, width: 10, height: 10 });
  state.resetDocument({ ...doc, root: { ...doc.root, children: [a, b, c] } });
  return { state, ctx: { state }, a, b, c };
}

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('RasterizeNodeCommand (D-109)', () => {
  it('replaces the target with the image at the same slot, keeping its id', () => {
    const { state, ctx, a, b, c } = setup();
    const image = createImage({ x: 20, y: 0, width: 10, height: 10, href: PNG });
    new RasterizeNodeCommand(b.id, image).execute(ctx);

    const root = state.document().root as GroupNode;
    expect(root.children.length).toBe(3);
    // z-order intact: a, <image>, c
    expect(root.children[0]!.id).toBe(a.id);
    expect(root.children[2]!.id).toBe(c.id);
    const replaced = root.children[1]!;
    expect(replaced.type).toBe('image');
    // SAME id as the original (selection / layer pointers survive).
    expect(replaced.id).toBe(b.id);
    expect((replaced as ImageNode).href).toBe(PNG);
  });

  it('forces the original id even if the supplied image carries a different one', () => {
    const { state, ctx, b } = setup();
    const image = createImage({ x: 0, y: 0, width: 10, height: 10, href: PNG }); // fresh id
    expect(image.id).not.toBe(b.id);
    new RasterizeNodeCommand(b.id, image).execute(ctx);
    const root = state.document().root as GroupNode;
    expect(root.children[1]!.id).toBe(b.id);
  });

  it('undo restores the exact original node at its z-order slot', () => {
    const { state, ctx, b } = setup();
    const image = createImage({ x: 20, y: 0, width: 10, height: 10, href: PNG });
    const cmd = new RasterizeNodeCommand(b.id, image);
    cmd.execute(ctx);
    cmd.undo(ctx);
    const root = state.document().root as GroupNode;
    const restored = root.children[1]!;
    expect(restored.id).toBe(b.id);
    expect(restored.type).toBe('rect');
  });

  it('fails gracefully when the target node does not exist', () => {
    const { ctx } = setup();
    const image = createImage({ x: 0, y: 0, width: 1, height: 1, href: PNG });
    const res = new RasterizeNodeCommand(generateNodeId(), image).execute(ctx);
    expect(res.ok).toBe(false);
  });

  it('is flagged destructive (opt-in auto-snapshot)', () => {
    const image = createImage({ x: 0, y: 0, width: 1, height: 1, href: PNG });
    expect(new RasterizeNodeCommand(generateNodeId(), image).isDestructive).toBe(true);
  });
});
