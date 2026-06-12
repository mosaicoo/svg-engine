import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CommandBus } from '../command-bus/command-bus.service';
import { EditorStateService } from '../state/editor-state.service';
import { createGroup, createRect } from '../model/node-factory';
import { isLayer, withLayerFlag } from '../model/layer';
import { withPageFlag } from '../model/page';
import type { SvgDocument } from '../document/svg-document';
import type { GroupNode } from '../model/group-node';
import type { SvgNode } from '../model/svg-node';
import type { NodeId } from '../types/node-id';
import { findNodeById } from '../tree/tree-ops';
import { CreateLayerCommand, MakeLayerCommand, UnmakeLayerCommand } from './layer.commands';

function setup(): { state: EditorStateService; bus: CommandBus } {
  TestBed.configureTestingModule({});
  return {
    state: TestBed.inject(EditorStateService),
    bus: TestBed.inject(CommandBus),
  };
}

function seed(state: EditorStateService, children: readonly SvgNode[]): void {
  const doc: SvgDocument = {
    id: 'd' as NodeId,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup(children, { id: 'root' as NodeId }),
  };
  state.resetDocument(doc);
}

describe('D-072 — Layer commands', () => {
  describe('MakeLayerCommand', () => {
    it('converts a top-level group into a layer', () => {
      const { state, bus } = setup();
      const group = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
      seed(state, [group]);
      expect(isLayer(group)).toBe(false);
      bus.dispatch(new MakeLayerCommand(group.id));
      const after = findNodeById(state.document().root, group.id);
      expect(after).not.toBeNull();
      expect(isLayer(after!)).toBe(true);
    });

    it('rejects nested groups (must be top-level)', () => {
      const { state, bus } = setup();
      const inner = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
      const outer = createGroup([inner]);
      seed(state, [outer]);
      bus.dispatch(new MakeLayerCommand(inner.id));
      // No mutation — inner remains a plain group.
      const after = findNodeById(state.document().root, inner.id);
      expect(after).not.toBeNull();
      expect(isLayer(after!)).toBe(false);
    });

    // **D-079 regression** — under the Pages model a "top-level" group is a
    // direct child of the active PAGE, not of the root (the root holds only
    // page groups). The old root-only invariant left Convert to Layer
    // permanently failing inside pages.
    it('converts a group nested directly in a PAGE into a layer', () => {
      const { state, bus } = setup();
      const group = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
      const page = withPageFlag(createGroup([group], { id: 'page' as NodeId }), {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      seed(state, [page]);
      bus.dispatch(new MakeLayerCommand(group.id));
      const after = findNodeById(state.document().root, group.id);
      expect(after).not.toBeNull();
      expect(isLayer(after!)).toBe(true);
    });

    it('rejects a page itself (a page is a group, but not a convertible one)', () => {
      const { state, bus } = setup();
      const page = withPageFlag(createGroup([], { id: 'page' as NodeId }), {
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      });
      seed(state, [page]);
      bus.dispatch(new MakeLayerCommand(page.id));
      const after = findNodeById(state.document().root, page.id);
      expect(after).not.toBeNull();
      expect(isLayer(after!)).toBe(false);
    });

    it('is idempotent on an already-layer group (no extra undo step)', () => {
      const { state, bus } = setup();
      const layer = withLayerFlag(createGroup([]));
      seed(state, [layer]);
      bus.dispatch(new MakeLayerCommand(layer.id));
      // Still a layer; nothing destructive happened.
      const after = findNodeById(state.document().root, layer.id);
      expect(after).not.toBeNull();
      expect(isLayer(after!)).toBe(true);
    });

    it('undo restores the group back to plain (not-layer)', () => {
      const { state, bus } = setup();
      const group = createGroup([]);
      seed(state, [group]);
      bus.dispatch(new MakeLayerCommand(group.id));
      expect(isLayer(findNodeById(state.document().root, group.id)!)).toBe(true);
      bus.undo();
      expect(isLayer(findNodeById(state.document().root, group.id)!)).toBe(false);
    });

    it('rejects non-group targets (rect, etc.)', () => {
      const { state, bus } = setup();
      const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
      seed(state, [rect]);
      bus.dispatch(new MakeLayerCommand(rect.id));
      // Tree unchanged.
      const after = findNodeById(state.document().root, rect.id);
      expect(after).not.toBeNull();
      expect(after!.type).toBe('rect');
    });
  });

  describe('UnmakeLayerCommand', () => {
    it('clears the layer flag from a layer group', () => {
      const { state, bus } = setup();
      const layer = withLayerFlag(createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]));
      seed(state, [layer]);
      expect(isLayer(layer)).toBe(true);
      bus.dispatch(new UnmakeLayerCommand(layer.id));
      const after = findNodeById(state.document().root, layer.id);
      expect(after).not.toBeNull();
      expect(isLayer(after!)).toBe(false);
      // Children preserved.
      expect((after as GroupNode).children.length).toBe(1);
    });

    it('preserves other customData entries when clearing the flag', () => {
      const { state, bus } = setup();
      const base = createGroup([], {
        metadata: { customData: { svgeKind: 'layer', customMarker: 42 } },
      });
      seed(state, [base]);
      bus.dispatch(new UnmakeLayerCommand(base.id));
      const after = findNodeById(state.document().root, base.id) as GroupNode;
      expect(isLayer(after)).toBe(false);
      expect(after.metadata.customData?.['customMarker']).toBe(42);
    });

    it('undo restores the layer flag', () => {
      const { state, bus } = setup();
      const layer = withLayerFlag(createGroup([]));
      seed(state, [layer]);
      bus.dispatch(new UnmakeLayerCommand(layer.id));
      expect(isLayer(findNodeById(state.document().root, layer.id)!)).toBe(false);
      bus.undo();
      expect(isLayer(findNodeById(state.document().root, layer.id)!)).toBe(true);
    });
  });

  describe('CreateLayerCommand', () => {
    it('inserts a new empty layer at the front of the root', () => {
      const { state, bus } = setup();
      const existing = createRect({ x: 0, y: 0, width: 10, height: 10 });
      seed(state, [existing]);
      const cmd = new CreateLayerCommand();
      bus.dispatch(cmd);
      const root = state.document().root;
      expect(root.children.length).toBe(2);
      // New layer is FIRST child (front = top of layers panel).
      const first = root.children[0]!;
      expect(isLayer(first)).toBe(true);
      // Default name is "Layer N".
      expect(first.metadata.name).toBe('Layer 1');
      // Original sibling preserved.
      expect(root.children[1]!.id).toBe(existing.id);
    });

    it('auto-numbers new layers based on existing layer count', () => {
      const { state, bus } = setup();
      const l1 = withLayerFlag(createGroup([], { metadata: { name: 'Layer 1' } }));
      const l2 = withLayerFlag(createGroup([], { metadata: { name: 'Layer 2' } }));
      seed(state, [l1, l2]);
      const cmd = new CreateLayerCommand();
      bus.dispatch(cmd);
      const front = state.document().root.children[0]!;
      expect(isLayer(front)).toBe(true);
      expect(front.metadata.name).toBe('Layer 3');
    });

    it('exposes the created id via getCreatedLayerId()', () => {
      const { state, bus } = setup();
      seed(state, []);
      const cmd = new CreateLayerCommand();
      bus.dispatch(cmd);
      const id = cmd.getCreatedLayerId();
      expect(id).not.toBeNull();
      const node = findNodeById(state.document().root, id!);
      expect(node).not.toBeNull();
      expect(isLayer(node!)).toBe(true);
    });

    it('undo removes the created layer', () => {
      const { state, bus } = setup();
      const existing = createRect({ x: 0, y: 0, width: 10, height: 10 });
      seed(state, [existing]);
      bus.dispatch(new CreateLayerCommand());
      expect(state.document().root.children.length).toBe(2);
      bus.undo();
      const root = state.document().root;
      expect(root.children.length).toBe(1);
      expect(root.children[0]!.id).toBe(existing.id);
    });

    it('inserts into the given parentId (Pages: active page), not the root', () => {
      const { state, bus } = setup();
      // Pages model: root holds a page group; content lives inside it.
      const page = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })], {
        metadata: { name: 'Page 1' },
      });
      seed(state, [page]);
      const cmd = new CreateLayerCommand(page.id);
      bus.dispatch(cmd);
      const root = state.document().root;
      // No stray layer at root — the page is still root's only child.
      expect(root.children.length).toBe(1);
      expect(root.children[0]!.id).toBe(page.id);
      // The new layer is the page's FIRST child.
      const pageAfter = findNodeById(root, page.id) as GroupNode;
      expect(pageAfter.children.length).toBe(2);
      expect(isLayer(pageAfter.children[0]!)).toBe(true);
      // Auto-numbering counts layers within the page (none yet) → "Layer 1".
      expect(pageAfter.children[0]!.metadata.name).toBe('Layer 1');
      expect(cmd.getCreatedLayerId()).toBe(pageAfter.children[0]!.id);
    });
  });
});
