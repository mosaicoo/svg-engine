import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CommandBus } from '../command-bus/command-bus.service';
import { EditorStateService } from '../state/editor-state.service';
import { createGroup, createRect } from '../model/node-factory';
import { readCustomAttrs, setCustomAttr } from '../model/custom-attrs';
import type { SvgDocument } from '../document/svg-document';
import type { SvgNode } from '../model/svg-node';
import type { NodeId } from '../types/node-id';
import { findNodeById } from '../tree/tree-ops';
import {
  RemoveCustomAttrCommand,
  RenameCustomAttrCommand,
  SetCustomAttrCommand,
} from './custom-attr.commands';

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

describe('D-089 — SetCustomAttrCommand', () => {
  it('sets an attribute on the target node', () => {
    const { state, bus } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    seed(state, [rect]);
    bus.dispatch(new SetCustomAttrCommand(rect.id, 'sku', 'ABC-123'));
    const node = findNodeById(state.document().root, rect.id)!;
    expect(readCustomAttrs(node)).toEqual({ sku: 'ABC-123' });
  });

  it('updates an existing attribute', () => {
    const { state, bus } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    seed(state, [rect]);
    bus.dispatch(new SetCustomAttrCommand(rect.id, 'sku', '1'));
    bus.dispatch(new SetCustomAttrCommand(rect.id, 'sku', '2'));
    const node = findNodeById(state.document().root, rect.id)!;
    expect(readCustomAttrs(node)).toEqual({ sku: '2' });
  });

  it('fails on invalid name (tree unchanged)', () => {
    const { state, bus } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    seed(state, [rect]);
    const before = state.document().root;
    bus.dispatch(new SetCustomAttrCommand(rect.id, 'svge-kind', 'x'));
    expect(state.document().root).toBe(before);
  });

  it('fails on missing node (tree unchanged)', () => {
    const { state, bus } = setup();
    seed(state, [createRect({ x: 0, y: 0, width: 1, height: 1 })]);
    const before = state.document().root;
    bus.dispatch(new SetCustomAttrCommand('nope' as NodeId, 'sku', 'x'));
    expect(state.document().root).toBe(before);
  });

  it('undo restores the prior tree exactly', () => {
    const { state, bus } = setup();
    const rect = createRect({ x: 0, y: 0, width: 1, height: 1 });
    seed(state, [rect]);
    const before = state.document().root;
    bus.dispatch(new SetCustomAttrCommand(rect.id, 'sku', '1'));
    expect(state.document().root).not.toBe(before);
    bus.undo();
    expect(state.document().root).toBe(before);
  });
});

describe('D-089 — RemoveCustomAttrCommand', () => {
  it('removes the named attribute', () => {
    const { state, bus } = setup();
    const rect = setCustomAttr(
      setCustomAttr(createRect({ x: 0, y: 0, width: 1, height: 1 }), 'sku', '1'),
      'tag',
      'y',
    );
    seed(state, [rect]);
    bus.dispatch(new RemoveCustomAttrCommand(rect.id, 'sku'));
    const node = findNodeById(state.document().root, rect.id)!;
    expect(readCustomAttrs(node)).toEqual({ tag: 'y' });
  });

  it('undo restores the removed attribute', () => {
    const { state, bus } = setup();
    const rect = setCustomAttr(createRect({ x: 0, y: 0, width: 1, height: 1 }), 'sku', '1');
    seed(state, [rect]);
    const before = state.document().root;
    bus.dispatch(new RemoveCustomAttrCommand(rect.id, 'sku'));
    bus.undo();
    expect(state.document().root).toBe(before);
  });

  it('fails on missing node (tree unchanged)', () => {
    const { state, bus } = setup();
    seed(state, [createRect({ x: 0, y: 0, width: 1, height: 1 })]);
    const before = state.document().root;
    bus.dispatch(new RemoveCustomAttrCommand('nope' as NodeId, 'sku'));
    expect(state.document().root).toBe(before);
  });
});

describe('D-089 — RenameCustomAttrCommand', () => {
  it('renames preserving the value', () => {
    const { state, bus } = setup();
    const rect = setCustomAttr(createRect({ x: 0, y: 0, width: 1, height: 1 }), 'sku', '123');
    seed(state, [rect]);
    bus.dispatch(new RenameCustomAttrCommand(rect.id, 'sku', 'product-id'));
    const node = findNodeById(state.document().root, rect.id)!;
    expect(readCustomAttrs(node)).toEqual({ 'product-id': '123' });
  });

  it('fails (tree unchanged) when source absent', () => {
    const { state, bus } = setup();
    const rect = setCustomAttr(createRect({ x: 0, y: 0, width: 1, height: 1 }), 'sku', '1');
    seed(state, [rect]);
    const before = state.document().root;
    bus.dispatch(new RenameCustomAttrCommand(rect.id, 'missing', 'x'));
    expect(state.document().root).toBe(before);
  });

  it('fails (tree unchanged) when target already exists', () => {
    const { state, bus } = setup();
    const rect = setCustomAttr(
      setCustomAttr(createRect({ x: 0, y: 0, width: 1, height: 1 }), 'sku', '1'),
      'tag',
      'y',
    );
    seed(state, [rect]);
    const before = state.document().root;
    bus.dispatch(new RenameCustomAttrCommand(rect.id, 'sku', 'tag'));
    expect(state.document().root).toBe(before);
  });

  it('fails (tree unchanged) when target name invalid', () => {
    const { state, bus } = setup();
    const rect = setCustomAttr(createRect({ x: 0, y: 0, width: 1, height: 1 }), 'sku', '1');
    seed(state, [rect]);
    const before = state.document().root;
    bus.dispatch(new RenameCustomAttrCommand(rect.id, 'sku', 'SKU'));
    expect(state.document().root).toBe(before);
  });

  it('undo restores the original name', () => {
    const { state, bus } = setup();
    const rect = setCustomAttr(createRect({ x: 0, y: 0, width: 1, height: 1 }), 'sku', '123');
    seed(state, [rect]);
    const before = state.document().root;
    bus.dispatch(new RenameCustomAttrCommand(rect.id, 'sku', 'product-id'));
    bus.undo();
    expect(state.document().root).toBe(before);
  });
});
