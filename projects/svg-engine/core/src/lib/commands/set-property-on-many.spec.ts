import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CommandBus } from '../command-bus/command-bus.service';
import { EditorStateService } from '../state/editor-state.service';
import { createGroup, createText } from '../model/node-factory';
import type { SvgDocument } from '../document/svg-document';
import type { TextNode } from '../model/text-node';
import { findNodeById } from '../tree/tree-ops';
import { SetPropertyOnManyCommand } from './set-property-on-many.command';

function setup(): { state: EditorStateService; bus: CommandBus } {
  TestBed.configureTestingModule({});
  return {
    state: TestBed.inject(EditorStateService),
    bus: TestBed.inject(CommandBus),
  };
}

function seed(state: EditorStateService, children: readonly import('../model/svg-node').SvgNode[]) {
  const doc: SvgDocument = {
    id: 'd' as never,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
    root: createGroup(children, { id: 'root' as never }),
  };
  state.resetDocument(doc);
}

describe('SetPropertyOnManyCommand — D-070', () => {
  it('sets fontFamily on multiple text nodes in one undo step', () => {
    const { state, bus } = setup();
    const a = createText({ x: 0, y: 0, content: 'A' });
    const b = createText({ x: 0, y: 0, content: 'B' });
    seed(state, [a, b]);
    bus.dispatch(
      new SetPropertyOnManyCommand<TextNode, 'fontFamily'>(
        [a.id, b.id],
        'fontFamily',
        'Arial, sans-serif',
      ),
    );
    expect((findNodeById(state.document().root, a.id) as TextNode).fontFamily).toBe(
      'Arial, sans-serif',
    );
    expect((findNodeById(state.document().root, b.id) as TextNode).fontFamily).toBe(
      'Arial, sans-serif',
    );
  });

  it('undo restores previous values (including absent fields)', () => {
    const { state, bus } = setup();
    const a = { ...createText({ x: 0, y: 0, content: 'A' }), fontFamily: 'Inter' };
    const b = createText({ x: 0, y: 0, content: 'B' }); // no fontFamily
    seed(state, [a, b]);
    bus.dispatch(
      new SetPropertyOnManyCommand<TextNode, 'fontFamily'>([a.id, b.id], 'fontFamily', 'Arial'),
    );
    expect((findNodeById(state.document().root, a.id) as TextNode).fontFamily).toBe('Arial');
    expect((findNodeById(state.document().root, b.id) as TextNode).fontFamily).toBe('Arial');
    // Undo via CommandBus (HistoryService is the storage; undo logic
    // lives on the bus).
    bus.undo();
    expect((findNodeById(state.document().root, a.id) as TextNode).fontFamily).toBe('Inter');
    expect((findNodeById(state.document().root, b.id) as TextNode).fontFamily).toBeUndefined();
  });

  it('empty nodeIds is a no-op (ok, no mutation)', () => {
    const { state, bus } = setup();
    const a = createText({ x: 0, y: 0, content: 'A' });
    seed(state, [a]);
    const before = state.document();
    bus.dispatch(new SetPropertyOnManyCommand<TextNode, 'fontFamily'>([], 'fontFamily', 'Arial'));
    expect(state.document()).toBe(before);
  });

  it('fails atomically when any node id is missing (no partial apply)', () => {
    const { state, bus } = setup();
    const a = createText({ x: 0, y: 0, content: 'A' });
    seed(state, [a]);
    const before = state.document();
    const result = bus.dispatch(
      new SetPropertyOnManyCommand<TextNode, 'fontFamily'>(
        [a.id, 'fake-missing-id' as never],
        'fontFamily',
        'Arial',
      ),
    );
    expect(result.ok).toBe(false);
    // Document unchanged — atomic validation pre-mutation
    expect(state.document()).toBe(before);
  });

  it('refuses to mutate reserved id/type properties', () => {
    expect(
      () =>
        new SetPropertyOnManyCommand<TextNode, never>(['x' as never], 'id' as never, 'y' as never),
    ).toThrow(/cannot mutate reserved/);
  });

  it('label includes property name and node count', () => {
    const cmd = new SetPropertyOnManyCommand<TextNode, 'fontFamily'>(
      ['a' as never, 'b' as never, 'c' as never],
      'fontFamily',
      'Arial',
    );
    expect(cmd.label).toContain('fontFamily');
    expect(cmd.label).toContain('3');
  });
});
