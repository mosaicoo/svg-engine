import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEmptyDocument,
  createImage,
  createRect,
  EditorStateService,
  findNodeById,
  type GroupNode,
} from 'svg-engine/core';
import { describe, expect, it } from 'vitest';

import { provideSvgEngineEditorScope } from '../scope';
import { SelectionService } from '../selection/selection.service';
import { makeClipMask, releaseClipMask } from './clip-mask-actions';

/**
 * **D-086** — end-to-end of the edit-side Object ▸ Mask actions. Proves the
 * io round-trip: `makeClipMask` serializes the clipper via `nodeToSvgMarkup`
 * (io) into a real `<clipPath>` def, and `releaseClipMask` re-parses it back
 * into a node via `svgImporter` (io). The pure core commands are covered
 * separately in `core/.../clip-mask.commands.spec.ts`.
 */
function setup() {
  TestBed.configureTestingModule({ providers: [provideSvgEngineEditorScope()] });
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  return {
    state,
    bus: TestBed.inject(CommandBus),
    sel: TestBed.inject(SelectionService),
    injector: TestBed.inject(Injector),
  };
}

describe('clip-mask edit actions (D-086)', () => {
  it('makeClipMask consumes the topmost node into a real clipPath def', () => {
    const { state, sel, injector } = setup();
    const target = createRect({ x: 0, y: 0, width: 40, height: 40 });
    const clipper = createRect({ x: 5, y: 5, width: 20, height: 20 });
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [target, clipper] },
    });
    sel.selectMany([target.id, clipper.id]);

    makeClipMask(injector, 'clipPath');

    const root = state.document().root as GroupNode;
    expect(findNodeById(root, clipper.id)).toBeNull(); // clipper consumed (topmost)
    expect(findNodeById(root, target.id)?.style.clipPath).toMatch(/^url\(#svge-clip-/);
    expect(state.document().defs ?? '').toContain('<clipPath');
    expect(state.document().defs ?? '').toContain('clipPathUnits="userSpaceOnUse"');
  });

  it('makeClipMask with kind="mask" produces a <mask> def + style.mask', () => {
    const { state, sel, injector } = setup();
    const target = createRect({ x: 0, y: 0, width: 40, height: 40 });
    const clipper = createRect({ x: 5, y: 5, width: 20, height: 20 });
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [target, clipper] },
    });
    sel.selectMany([target.id, clipper.id]);

    makeClipMask(injector, 'mask');

    expect(findNodeById(state.document().root, target.id)?.style.mask).toMatch(/^url\(#svge-mask-/);
    expect(state.document().defs ?? '').toContain('<mask');
  });

  it('releaseClipMask clears the ref, drops the def, and restores a shape', () => {
    const { state, sel, injector } = setup();
    const target = createRect({ x: 0, y: 0, width: 40, height: 40 });
    const clipper = createRect({ x: 5, y: 5, width: 20, height: 20 });
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [target, clipper] },
    });
    sel.selectMany([target.id, clipper.id]);
    makeClipMask(injector, 'clipPath');
    expect((state.document().root as GroupNode).children.length).toBe(1); // clipper gone

    releaseClipMask(injector, target.id, 'clipPath');

    expect(findNodeById(state.document().root, target.id)?.style.clipPath).toBeUndefined();
    expect(state.document().defs ?? '').not.toContain('<clipPath');
    // Illustrator parity: the clip shape comes back as an object.
    expect((state.document().root as GroupNode).children.length).toBeGreaterThanOrEqual(2);
  });

  it('makeClipMask("clipPath") is a no-op when the topmost node is an <image>', () => {
    const { state, sel, injector } = setup();
    const target = createRect({ x: 0, y: 0, width: 40, height: 40 });
    const imageClipper = createImage({ x: 5, y: 5, width: 20, height: 20, href: 'data:,' });
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [target, imageClipper] },
    });
    sel.selectMany([target.id, imageClipper.id]);

    makeClipMask(injector, 'clipPath');

    // Forbidden combo (SVG ignores <image> in <clipPath>) → nothing happens.
    expect(state.document().defs ?? '').not.toContain('<clipPath');
    expect(findNodeById(state.document().root, target.id)?.style.clipPath).toBeUndefined();
    expect(findNodeById(state.document().root, imageClipper.id)).not.toBeNull();
  });

  it('makeClipMask("mask") DOES accept an <image> clipper (luminance mask)', () => {
    const { state, sel, injector } = setup();
    const target = createRect({ x: 0, y: 0, width: 40, height: 40 });
    const imageClipper = createImage({ x: 5, y: 5, width: 20, height: 20, href: 'data:,' });
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [target, imageClipper] },
    });
    sel.selectMany([target.id, imageClipper.id]);

    makeClipMask(injector, 'mask');

    expect(findNodeById(state.document().root, target.id)?.style.mask).toMatch(/^url\(#svge-mask-/);
    expect(state.document().defs ?? '').toContain('<mask');
  });

  it('makeClipMask is a no-op with a single selected node', () => {
    const { state, sel, injector } = setup();
    const only = createRect({ x: 0, y: 0, width: 40, height: 40 });
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [only] },
    });
    sel.select(only.id);

    makeClipMask(injector, 'clipPath');

    expect(findNodeById(state.document().root, only.id)?.style.clipPath).toBeUndefined();
    expect(state.document().defs ?? '').not.toContain('<clipPath');
  });
});
