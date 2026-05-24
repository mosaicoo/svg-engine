import { TestBed } from '@angular/core/testing';
import { CommandBus, EditorStateService, HistoryService, type GroupNode } from 'svg-engine/core';
// HistoryService must be in providers even though we drive undo via
// CommandBus — CommandBus depends on it for stack management.
import { describe, expect, it } from 'vitest';

import {
  InsertSymbolInstancesBatchCommand,
  type SprayDrop,
} from './insert-symbol-instances-batch.command';

/**
 * D-062a — atomic batch insertion spec. One spray = N instances + 1
 * undo entry that rolls them all back together.
 */

function setup() {
  TestBed.configureTestingModule({
    providers: [CommandBus, HistoryService, EditorStateService],
  });
  return {
    bus: TestBed.inject(CommandBus),
    state: TestBed.inject(EditorStateService),
  };
}

const DROPS: SprayDrop[] = [
  { x: 0, y: 0, width: 32, height: 32 },
  { x: 50, y: 50, width: 32, height: 32 },
  { x: 100, y: 100, width: 32, height: 32 },
];

describe('InsertSymbolInstancesBatchCommand', () => {
  it('inserts all drops in one execute', () => {
    const { bus, state } = setup();
    const before = (state.document().root as GroupNode).children.length;
    bus.dispatch(new InsertSymbolInstancesBatchCommand('svge.test.symbol', DROPS));
    const after = (state.document().root as GroupNode).children.length;
    expect(after - before).toBe(DROPS.length);
  });

  it('a single undo rolls back all inserted drops', () => {
    const { bus, state } = setup();
    const before = (state.document().root as GroupNode).children.length;
    bus.dispatch(new InsertSymbolInstancesBatchCommand('svge.test.symbol', DROPS));
    expect((state.document().root as GroupNode).children.length).toBe(before + DROPS.length);
    bus.undo();
    expect((state.document().root as GroupNode).children.length).toBe(before);
  });

  it('empty drops array is a no-op (success, no inserts)', () => {
    const { bus, state } = setup();
    const before = (state.document().root as GroupNode).children.length;
    bus.dispatch(new InsertSymbolInstancesBatchCommand('svge.test.symbol', []));
    expect((state.document().root as GroupNode).children.length).toBe(before);
  });

  it('exposes inserted ids after execute', () => {
    const { bus } = setup();
    const cmd = new InsertSymbolInstancesBatchCommand('svge.test.symbol', DROPS);
    bus.dispatch(cmd);
    expect(cmd.getInsertedIds().length).toBe(DROPS.length);
  });
});
