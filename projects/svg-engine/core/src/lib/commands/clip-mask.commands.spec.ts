import { describe, expect, it } from 'vitest';
import type { SvgDocument } from '../document/svg-document';
import { createEmptyDocument } from '../document/document-factory';
import { createGroup, createRect } from '../model/node-factory';
import type { GroupNode } from '../model/group-node';
import { generateNodeId } from '../types/node-id';
import type { EditorStateService } from '../state/editor-state.service';
import { findNodeById } from '../tree/tree-ops';
import type { CommandContext } from './command';
import {
  appendDef,
  extractDefById,
  MakeClipMaskCommand,
  ReleaseClipMaskCommand,
  removeDefById,
  unwrapUrlRef,
} from './clip-mask.commands';

/** Minimal in-memory state — the commands only read `document()` + write `setDocument()`. */
function fakeState(doc: SvgDocument) {
  let current = doc;
  const state = {
    document: () => current,
    setDocument: (d: SvgDocument) => {
      current = d;
    },
  } as unknown as EditorStateService;
  return { ctx: { state } as CommandContext, current: () => current };
}

function docWith(...children: ReturnType<typeof createRect>[]): SvgDocument {
  return { ...createEmptyDocument(), root: createGroup(children) };
}

const CLIP =
  '<clipPath id="cp1" clipPathUnits="userSpaceOnUse"><circle cx="5" cy="5" r="5" /></clipPath>';

describe('clip-mask defs string helpers (D-086)', () => {
  it('appendDef joins with a newline; tolerates empty base', () => {
    expect(appendDef(undefined, CLIP)).toBe(CLIP);
    expect(appendDef('', CLIP)).toBe(CLIP);
    expect(appendDef('<mask id="m"/>', CLIP)).toBe(`<mask id="m"/>\n${CLIP}`);
  });

  it('extractDefById returns the full element, or null', () => {
    expect(extractDefById(CLIP, 'cp1')).toBe(CLIP);
    expect(extractDefById(CLIP, 'nope')).toBeNull();
    expect(extractDefById(undefined, 'cp1')).toBeNull();
  });

  it('removeDefById drops only the matching element', () => {
    const defs = `${CLIP}\n<mask id="m1"><rect width="10" height="10" /></mask>`;
    const after = removeDefById(defs, 'cp1');
    expect(after).not.toContain('cp1');
    expect(after).toContain('id="m1"');
  });

  it('unwrapUrlRef extracts the bare id', () => {
    expect(unwrapUrlRef('url(#cp1)')).toBe('cp1');
    expect(unwrapUrlRef("url('#cp1')")).toBe('cp1');
    expect(unwrapUrlRef('none')).toBeNull();
    expect(unwrapUrlRef(undefined)).toBeNull();
  });
});

describe('MakeClipMaskCommand (D-086)', () => {
  it('consumes the clipper into defs and clips the target; undo restores everything', () => {
    const target = createRect({ x: 0, y: 0, width: 20, height: 20 });
    const clipper = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const { ctx, current } = fakeState(docWith(target, clipper));

    const cmd = new MakeClipMaskCommand([target.id], clipper.id, 'cp1', CLIP, 'clipPath');
    expect(cmd.execute(ctx).ok).toBe(true);

    const root = current().root as GroupNode;
    expect(findNodeById(root, clipper.id)).toBeNull(); // clipper consumed
    expect(findNodeById(root, target.id)?.style.clipPath).toBe('url(#cp1)');
    expect(current().defs).toContain('id="cp1"');

    cmd.undo(ctx);
    const back = current().root as GroupNode;
    expect(findNodeById(back, clipper.id)).not.toBeNull(); // clipper restored
    expect(findNodeById(back, target.id)?.style.clipPath).toBeUndefined();
    expect(current().defs ?? '').not.toContain('cp1');
  });

  it('writes style.mask for kind="mask"', () => {
    const target = createRect({ x: 0, y: 0, width: 20, height: 20 });
    const clipper = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const { ctx, current } = fakeState(docWith(target, clipper));

    new MakeClipMaskCommand(
      [target.id],
      clipper.id,
      'mk1',
      '<mask id="mk1"><rect width="10" height="10" fill="#fff" /></mask>',
      'mask',
    ).execute(ctx);

    expect(findNodeById(current().root, target.id)?.style.mask).toBe('url(#mk1)');
  });

  it('fails (no mutation) when the clipper is missing', () => {
    const target = createRect({ x: 0, y: 0, width: 20, height: 20 });
    const { ctx, current } = fakeState(docWith(target));
    const before = current();
    const res = new MakeClipMaskCommand(
      [target.id],
      generateNodeId(),
      'cp1',
      CLIP,
      'clipPath',
    ).execute(ctx);
    expect(res.ok).toBe(false);
    expect(current()).toBe(before); // untouched
  });
});

describe('ReleaseClipMaskCommand (D-086)', () => {
  it('clears the ref, drops the def, re-inserts the restored shape; undo restores', () => {
    // Seed a clipped target + the clip def already in place.
    const target = createRect({ x: 0, y: 0, width: 20, height: 20 });
    const clipped = { ...target, style: { ...target.style, clipPath: 'url(#cp1)' } };
    const seed: SvgDocument = {
      ...createEmptyDocument(),
      root: createGroup([clipped]),
      defs: CLIP,
    };
    const { ctx, current } = fakeState(seed);

    const restored = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const cmd = new ReleaseClipMaskCommand(target.id, 'clipPath', restored);
    expect(cmd.execute(ctx).ok).toBe(true);

    const root = current().root as GroupNode;
    expect(findNodeById(root, target.id)?.style.clipPath).toBeUndefined();
    expect(findNodeById(root, restored.id)).not.toBeNull(); // shape restored
    expect(current().defs ?? '').not.toContain('cp1'); // orphan def dropped

    cmd.undo(ctx);
    expect(findNodeById(current().root, target.id)?.style.clipPath).toBe('url(#cp1)');
  });

  it('fails when the node has no clip reference', () => {
    const target = createRect({ x: 0, y: 0, width: 20, height: 20 });
    const { ctx } = fakeState(docWith(target));
    expect(new ReleaseClipMaskCommand(target.id, 'clipPath', null).execute(ctx).ok).toBe(false);
  });
});
