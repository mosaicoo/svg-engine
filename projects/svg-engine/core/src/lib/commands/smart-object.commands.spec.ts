import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CommandBus } from '../command-bus/command-bus.service';
import { EditorStateService } from '../state/editor-state.service';
import { createGroup, createRect } from '../model/node-factory';
import { withLayerFlag } from '../model/layer';
import { isSmartObject, withSmartObjectFlag, withoutSmartObjectFlag } from '../model/smart-object';
import type { SvgDocument } from '../document/svg-document';
import type { GroupNode } from '../model/group-node';
import type { SvgNode } from '../model/svg-node';
import type { NodeId } from '../types/node-id';
import { findNodeById } from '../tree/tree-ops';
import {
  EditSmartObjectContentsCommand,
  MakeSmartObjectCommand,
  RasterizeSmartObjectCommand,
  ReplaceSmartObjectContentsCommand,
} from './smart-object.commands';

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

describe('D-074 — Smart Object helpers', () => {
  it('isSmartObject is false for non-group nodes', () => {
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    expect(isSmartObject(rect)).toBe(false);
  });

  it('isSmartObject is false for plain groups', () => {
    const g = createGroup([]);
    expect(isSmartObject(g)).toBe(false);
  });

  it('isSmartObject is true after withSmartObjectFlag', () => {
    const g = withSmartObjectFlag(createGroup([]));
    expect(isSmartObject(g)).toBe(true);
  });

  it('isSmartObject is false for layer-flagged groups (mutually exclusive)', () => {
    const layer = withLayerFlag(createGroup([]));
    expect(isSmartObject(layer)).toBe(false);
  });

  it('withSmartObjectFlag preserves other customData entries', () => {
    const base = createGroup([], {
      metadata: { customData: { customMarker: 42 } },
    });
    const flagged = withSmartObjectFlag(base);
    expect(isSmartObject(flagged)).toBe(true);
    expect(flagged.metadata.customData?.['customMarker']).toBe(42);
  });

  it('withoutSmartObjectFlag clears the flag and keeps other customData', () => {
    const base = createGroup([], {
      metadata: { customData: { svgeKind: 'smart-object', customMarker: 42 } },
    });
    const cleaned = withoutSmartObjectFlag(base);
    expect(isSmartObject(cleaned)).toBe(false);
    expect(cleaned.metadata.customData?.['customMarker']).toBe(42);
  });

  it('withoutSmartObjectFlag drops customData entirely when empty after removal', () => {
    const base = createGroup([], {
      metadata: { customData: { svgeKind: 'smart-object' } },
    });
    const cleaned = withoutSmartObjectFlag(base);
    expect(cleaned.metadata.customData).toBeUndefined();
  });

  it('withoutSmartObjectFlag is a no-op on a non-smart-object group (same ref)', () => {
    const plain = createGroup([]);
    expect(withoutSmartObjectFlag(plain)).toBe(plain);
    const layer = withLayerFlag(createGroup([]));
    // Layer flag is different — should NOT touch it.
    expect(withoutSmartObjectFlag(layer)).toBe(layer);
  });
});

describe('D-074 — Smart Object commands', () => {
  describe('MakeSmartObjectCommand', () => {
    it('wraps a single sibling into a smart-object container', () => {
      const { state, bus } = setup();
      const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
      seed(state, [rect]);
      const cmd = new MakeSmartObjectCommand([rect.id]);
      bus.dispatch(cmd);
      const root = state.document().root;
      expect(root.children.length).toBe(1);
      const wrapper = root.children[0]!;
      expect(isSmartObject(wrapper)).toBe(true);
      expect((wrapper as GroupNode).children.length).toBe(1);
      expect((wrapper as GroupNode).children[0]!.id).toBe(rect.id);
    });

    it('wraps multiple siblings preserving order and placing wrapper at first index', () => {
      const { state, bus } = setup();
      const a = createRect({ x: 0, y: 0, width: 1, height: 1 });
      const b = createRect({ x: 1, y: 0, width: 1, height: 1 });
      const c = createRect({ x: 2, y: 0, width: 1, height: 1 });
      const d = createRect({ x: 3, y: 0, width: 1, height: 1 });
      seed(state, [a, b, c, d]);
      bus.dispatch(new MakeSmartObjectCommand([b.id, c.id]));
      const root = state.document().root;
      // a, wrapper(b,c), d
      expect(root.children.length).toBe(3);
      expect(root.children[0]!.id).toBe(a.id);
      const wrapper = root.children[1]! as GroupNode;
      expect(isSmartObject(wrapper)).toBe(true);
      expect(wrapper.children.map((n) => n.id)).toEqual([b.id, c.id]);
      expect(root.children[2]!.id).toBe(d.id);
    });

    it('autonumbers default name based on existing smart objects', () => {
      const { state, bus } = setup();
      const existing = withSmartObjectFlag(
        createGroup([], { metadata: { name: 'Smart Object 1' } }),
      );
      const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
      seed(state, [existing, rect]);
      bus.dispatch(new MakeSmartObjectCommand([rect.id]));
      const wrapper = state
        .document()
        .root.children.find((n) => n.id !== existing.id)! as GroupNode;
      expect(isSmartObject(wrapper)).toBe(true);
      expect(wrapper.metadata.name).toBe('Smart Object 2');
    });

    it('accepts a custom name override', () => {
      const { state, bus } = setup();
      const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
      seed(state, [rect]);
      bus.dispatch(new MakeSmartObjectCommand([rect.id], 'My Imported Logo'));
      const wrapper = state.document().root.children[0]! as GroupNode;
      expect(wrapper.metadata.name).toBe('My Imported Logo');
    });

    it('exposes the wrapper id via getCreatedWrapperId()', () => {
      const { state, bus } = setup();
      const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
      seed(state, [rect]);
      const cmd = new MakeSmartObjectCommand([rect.id]);
      bus.dispatch(cmd);
      const id = cmd.getCreatedWrapperId();
      expect(id).not.toBeNull();
      const node = findNodeById(state.document().root, id!);
      expect(node).not.toBeNull();
      expect(isSmartObject(node!)).toBe(true);
    });

    it('rejects empty input', () => {
      const { state, bus } = setup();
      seed(state, [createRect({ x: 0, y: 0, width: 1, height: 1 })]);
      const before = state.document().root;
      bus.dispatch(new MakeSmartObjectCommand([]));
      // Tree unchanged
      expect(state.document().root).toBe(before);
    });

    it('rejects nodes from different parents', () => {
      const { state, bus } = setup();
      const a = createRect({ x: 0, y: 0, width: 1, height: 1 });
      const insideGroup = createRect({ x: 0, y: 0, width: 1, height: 1 });
      const g = createGroup([insideGroup]);
      seed(state, [a, g]);
      const before = state.document().root;
      bus.dispatch(new MakeSmartObjectCommand([a.id, insideGroup.id]));
      // Tree unchanged — mismatched parents rejected
      expect(state.document().root).toBe(before);
    });

    it('undo restores original tree exactly', () => {
      const { state, bus } = setup();
      const a = createRect({ x: 0, y: 0, width: 1, height: 1 });
      const b = createRect({ x: 1, y: 0, width: 1, height: 1 });
      seed(state, [a, b]);
      const before = state.document().root;
      bus.dispatch(new MakeSmartObjectCommand([a.id, b.id]));
      expect(state.document().root).not.toBe(before);
      bus.undo();
      expect(state.document().root).toBe(before);
    });
  });

  describe('RasterizeSmartObjectCommand', () => {
    it('drops the wrapper and hoists children at its slot', () => {
      const { state, bus } = setup();
      const inner = createRect({ x: 0, y: 0, width: 1, height: 1 });
      const wrapper = withSmartObjectFlag(createGroup([inner]));
      const before = createRect({ x: 10, y: 0, width: 1, height: 1 });
      const after = createRect({ x: 20, y: 0, width: 1, height: 1 });
      seed(state, [before, wrapper, after]);
      bus.dispatch(new RasterizeSmartObjectCommand(wrapper.id));
      const root = state.document().root;
      // before, inner, after
      expect(root.children.map((n) => n.id)).toEqual([before.id, inner.id, after.id]);
      // Wrapper removed
      expect(findNodeById(root, wrapper.id)).toBeNull();
    });

    it('no-op (returns ok) on non-smart-object targets', () => {
      const { state, bus } = setup();
      const plain = createGroup([createRect({ x: 0, y: 0, width: 1, height: 1 })]);
      seed(state, [plain]);
      const before = state.document().root;
      bus.dispatch(new RasterizeSmartObjectCommand(plain.id));
      // Tree unchanged
      expect(state.document().root).toBe(before);
    });

    it('undo restores the smart-object wrapper', () => {
      const { state, bus } = setup();
      const inner = createRect({ x: 0, y: 0, width: 1, height: 1 });
      const wrapper = withSmartObjectFlag(createGroup([inner]));
      seed(state, [wrapper]);
      const before = state.document().root;
      bus.dispatch(new RasterizeSmartObjectCommand(wrapper.id));
      expect(findNodeById(state.document().root, wrapper.id)).toBeNull();
      bus.undo();
      expect(state.document().root).toBe(before);
      const restored = findNodeById(state.document().root, wrapper.id);
      expect(restored).not.toBeNull();
      expect(isSmartObject(restored!)).toBe(true);
    });
  });

  describe('EditSmartObjectContentsCommand', () => {
    it('replaces the wrapper children while preserving wrapper id and metadata', () => {
      const { state, bus } = setup();
      const oldChild = createRect({ x: 0, y: 0, width: 1, height: 1 });
      const wrapper = withSmartObjectFlag(createGroup([oldChild], { metadata: { name: 'My SO' } }));
      seed(state, [wrapper]);
      const newChild = createRect({ x: 5, y: 5, width: 5, height: 5 });
      bus.dispatch(new EditSmartObjectContentsCommand(wrapper.id, [newChild]));
      const after = findNodeById(state.document().root, wrapper.id) as GroupNode;
      expect(after).not.toBeNull();
      expect(isSmartObject(after)).toBe(true);
      expect(after.metadata.name).toBe('My SO');
      expect(after.children.length).toBe(1);
      expect(after.children[0]!.id).toBe(newChild.id);
    });

    it('fails on non-smart-object target (tree unchanged)', () => {
      const { state, bus } = setup();
      const plain = createGroup([createRect({ x: 0, y: 0, width: 1, height: 1 })]);
      seed(state, [plain]);
      const before = state.document().root;
      const newChild = createRect({ x: 5, y: 5, width: 5, height: 5 });
      bus.dispatch(new EditSmartObjectContentsCommand(plain.id, [newChild]));
      expect(state.document().root).toBe(before);
    });

    it('undo restores previous children', () => {
      const { state, bus } = setup();
      const oldChild = createRect({ x: 0, y: 0, width: 1, height: 1 });
      const wrapper = withSmartObjectFlag(createGroup([oldChild]));
      seed(state, [wrapper]);
      const before = state.document().root;
      const newChild = createRect({ x: 5, y: 5, width: 5, height: 5 });
      bus.dispatch(new EditSmartObjectContentsCommand(wrapper.id, [newChild]));
      bus.undo();
      expect(state.document().root).toBe(before);
    });

    it('label reads "Edit Smart Object Contents"', () => {
      const cmd = new EditSmartObjectContentsCommand('x' as NodeId, []);
      expect(cmd.label).toBe('Edit Smart Object Contents');
    });
  });

  describe('ReplaceSmartObjectContentsCommand', () => {
    it('label reads "Replace Smart Object Contents"', () => {
      const cmd = new ReplaceSmartObjectContentsCommand('x' as NodeId, []);
      expect(cmd.label).toBe('Replace Smart Object Contents');
    });

    it('replaces children just like Edit (same mechanics, different label)', () => {
      const { state, bus } = setup();
      const oldChild = createRect({ x: 0, y: 0, width: 1, height: 1 });
      const wrapper = withSmartObjectFlag(createGroup([oldChild]));
      seed(state, [wrapper]);
      const newChild = createRect({ x: 5, y: 5, width: 5, height: 5 });
      bus.dispatch(new ReplaceSmartObjectContentsCommand(wrapper.id, [newChild]));
      const after = findNodeById(state.document().root, wrapper.id) as GroupNode;
      expect(after.children.length).toBe(1);
      expect(after.children[0]!.id).toBe(newChild.id);
    });
  });
});
