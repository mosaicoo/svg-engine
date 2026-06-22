import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createGroup,
  createRect,
  EditorStateService,
  generateNodeId,
  isSmartObject,
  type NodeId,
  type SvgDocument,
  withSmartObjectFlag,
} from 'svg-engine/core';
import { describe, expect, it } from 'vitest';
import { SmartObjectActionsService } from './smart-object-actions.service';

/**
 * **D-076** — service-level specs.
 *
 * The file-picker branch of `replaceContents()` requires a real
 * `<input type="file">` (no headless way to simulate the OS file
 * dialog), so it's intentionally NOT covered here — the menu plugin
 * Manual test still exercises it. What we CAN unit-test cleanly is
 * `release()` (D-110, was `rasterize`): a pure command dispatch with
 * deterministic outcome + undo semantics. The Inspector wiring delegates to
 * the same call, so coverage here proves coverage there.
 */

function setup(): {
  state: EditorStateService;
  bus: CommandBus;
  actions: SmartObjectActionsService;
} {
  TestBed.configureTestingModule({});
  return {
    state: TestBed.inject(EditorStateService),
    bus: TestBed.inject(CommandBus),
    actions: TestBed.inject(SmartObjectActionsService),
  };
}

function seedWithSmartObject(state: EditorStateService): {
  smartObjectId: NodeId;
  childId: NodeId;
} {
  const child = createRect({ x: 0, y: 0, width: 10, height: 10 });
  const wrapper = withSmartObjectFlag(createGroup([child], { metadata: { name: 'Test SO' } }));
  const doc: SvgDocument = {
    id: 'd' as NodeId,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup([wrapper], { id: 'root' as NodeId }),
  };
  state.resetDocument(doc);
  return { smartObjectId: wrapper.id, childId: child.id };
}

describe('D-076 — SmartObjectActionsService', () => {
  describe('release', () => {
    it('removes the wrapper and hoists children to its parent slot', () => {
      const { state, actions } = setup();
      const { smartObjectId, childId } = seedWithSmartObject(state);
      // Sanity: wrapper exists at root, child nested inside.
      expect(state.document().root.children.length).toBe(1);
      expect(state.document().root.children[0]!.id).toBe(smartObjectId);

      actions.release(smartObjectId);

      const root = state.document().root;
      expect(root.children.length).toBe(1);
      // Wrapper is gone; child hoisted to root.
      expect(root.children[0]!.id).toBe(childId);
    });

    it('is undoable via CommandBus.undo (ReleaseSmartObjectCommand bundle)', () => {
      const { state, bus, actions } = setup();
      const { smartObjectId } = seedWithSmartObject(state);
      const beforeRoot = state.document().root;

      actions.release(smartObjectId);
      expect(state.document().root).not.toBe(beforeRoot);

      bus.undo();

      // Wrapper restored — root reference equality (snapshot semantics).
      expect(state.document().root).toBe(beforeRoot);
      const restored = state.document().root.children[0]!;
      expect(isSmartObject(restored)).toBe(true);
    });

    it('no-op on a non-smart-object target (command-level idempotency)', () => {
      const { state, actions } = setup();
      // Seed a plain (non-flagged) group instead of a smart object.
      const child = createRect({ x: 0, y: 0, width: 10, height: 10 });
      const plain = createGroup([child]);
      state.resetDocument({
        id: 'd' as NodeId,
        viewBox: { x: 0, y: 0, width: 100, height: 100 },
        root: createGroup([plain], { id: 'root' as NodeId }),
      });
      const before = state.document().root;

      actions.release(plain.id);

      // Tree unchanged — ReleaseSmartObjectCommand returns ok without
      // mutating when target isn't a smart object.
      expect(state.document().root).toBe(before);
    });

    it('no-op on a non-existent id (defensive — dispatch fails silently)', () => {
      const { state, actions } = setup();
      seedWithSmartObject(state);
      const before = state.document().root;

      actions.release(generateNodeId());

      expect(state.document().root).toBe(before);
    });
  });

  describe('applyReplaceText — defs preservation (D-097)', () => {
    const GRADIENT_SVG = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
      '<defs><linearGradient id="g1"><stop offset="0" stop-color="#ff0000"/>',
      '<stop offset="1" stop-color="#0000ff"/></linearGradient></defs>',
      '<rect width="50" height="50" fill="url(#g1)"/>',
      '</svg>',
    ].join('');

    it('swaps children AND merges the imported <defs> into the document', () => {
      const { state, actions } = setup();
      const { smartObjectId } = seedWithSmartObject(state);

      const res = actions.applyReplaceText(smartObjectId, GRADIENT_SVG);

      expect(res.ok).toBe(true);
      // The gradient referenced via url(#g1) now lives in the document defs,
      // so it resolves (the bug was: defs dropped → dangling reference).
      const defs = state.document().defs ?? '';
      expect(defs).toContain('linearGradient');
      expect(defs).toContain('id="g1"');
      // Children swapped: the wrapper now holds the imported rect.
      const wrapper = state.document().root.children[0]!;
      expect(wrapper.type === 'group' && wrapper.children.length).toBe(1);
    });

    it('does not duplicate defs when the same SVG is replaced twice (id dedup)', () => {
      const { state, actions } = setup();
      const { smartObjectId } = seedWithSmartObject(state);

      actions.applyReplaceText(smartObjectId, GRADIENT_SVG);
      actions.applyReplaceText(smartObjectId, GRADIENT_SVG);

      const defs = state.document().defs ?? '';
      expect(defs.match(/id="g1"/g)?.length).toBe(1);
    });

    it('reports ok:false (no throw) when the imported SVG has no shapes', () => {
      const { state, actions } = setup();
      const { smartObjectId } = seedWithSmartObject(state);

      const res = actions.applyReplaceText(
        smartObjectId,
        '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      );

      expect(res.ok).toBe(false);
      expect(res.error).toBeTruthy();
      // Document defs untouched on failure.
      expect(state.document().defs ?? '').not.toContain('linearGradient');
    });
  });
});
