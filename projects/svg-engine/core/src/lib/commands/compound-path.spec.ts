import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { CommandBus } from '../command-bus';
import { EditorStateService } from '../state';
import { createPath, createRect } from '../model/node-factory';
import type { GroupNode } from '../model/group-node';
import {
  bakeTransformIntoPathD,
  MakeCompoundPathCommand,
  ReleaseCompoundPathCommand,
  splitPathDIntoSubpaths,
} from './compound-path.commands';

/**
 * D-054 — Compound Path (Item 6.2). Tests the two commands and the
 * supporting helpers (split + bake).
 */

function setup() {
  TestBed.configureTestingModule({});
  return {
    bus: TestBed.inject(CommandBus),
    state: TestBed.inject(EditorStateService),
  };
}

describe('splitPathDIntoSubpaths', () => {
  it('returns single-element array for single-M paths', () => {
    expect(splitPathDIntoSubpaths('M0 0 L10 0 L10 10 Z')).toEqual(['M0 0 L10 0 L10 10 Z']);
  });

  it('splits two M..Z subpaths', () => {
    const d = 'M0 0 L10 0 L10 10 Z M20 0 L30 0 L30 10 Z';
    expect(splitPathDIntoSubpaths(d)).toEqual(['M0 0 L10 0 L10 10 Z', 'M20 0 L30 0 L30 10 Z']);
  });

  it('handles lowercase m (relative moveto) as a subpath boundary', () => {
    const d = 'M0 0 L10 0 m5 5 l3 3';
    expect(splitPathDIntoSubpaths(d).length).toBe(2);
  });

  it('returns empty array on empty input', () => {
    expect(splitPathDIntoSubpaths('')).toEqual([]);
  });
});

describe('bakeTransformIntoPathD', () => {
  it('identity transform returns input unchanged (short-circuit)', () => {
    const d = 'M0 0 L10 0 Z';
    expect(bakeTransformIntoPathD(d, [1, 0, 0, 1, 0, 0])).toBe(d);
  });

  it('translation [1,0,0,1,5,7] shifts every coordinate', () => {
    const out = bakeTransformIntoPathD('M0 0 L10 0', [1, 0, 0, 1, 5, 7]);
    // M shifts to (5,7) and L shifts to (15,7).
    expect(out).toContain('M5 7');
    expect(out).toContain('L15 7');
  });

  it('scale [2,0,0,2,0,0] doubles every coordinate', () => {
    const out = bakeTransformIntoPathD('M0 0 L10 0 L0 10', [2, 0, 0, 2, 0, 0]);
    expect(out).toContain('M0 0');
    expect(out).toContain('L20 0');
    expect(out).toContain('L0 20');
  });

  it('H/V (horizontal / vertical) commands get promoted to L after baking', () => {
    // H10 from pen (0,0) means line to (10, 0); after [2,0,0,2,0,0] → L20 0.
    const out = bakeTransformIntoPathD('M0 0 H10 V5', [2, 0, 0, 2, 0, 0]);
    expect(out).toContain('L20 0');
    expect(out).toContain('L20 10');
  });
});

describe('MakeCompoundPathCommand', () => {
  it('merges 2 rects into 1 path with 2 subpaths', () => {
    const { bus, state } = setup();
    const r1 = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const r2 = createRect({ x: 20, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [r1, r2] } as GroupNode,
    });
    const result = bus.dispatch(new MakeCompoundPathCommand([r1.id, r2.id]));
    expect(result.ok).toBe(true);
    const children = (state.document().root as GroupNode).children;
    expect(children.length).toBe(1);
    expect(children[0]!.type).toBe('path');
    const subs = splitPathDIntoSubpaths((children[0] as { d: string }).d);
    expect(subs.length).toBe(2);
  });

  it('fails when fewer than 2 inputs are given', () => {
    const { bus, state } = setup();
    const r1 = createRect({ x: 0, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [r1] } as GroupNode,
    });
    const result = bus.dispatch(new MakeCompoundPathCommand([r1.id]));
    expect(result.ok).toBe(false);
  });

  it('undo restores both original nodes', () => {
    const { bus, state } = setup();
    const r1 = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const r2 = createRect({ x: 20, y: 0, width: 10, height: 10 });
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [r1, r2] } as GroupNode,
    });
    bus.dispatch(new MakeCompoundPathCommand([r1.id, r2.id]));
    bus.undo();
    const children = (state.document().root as GroupNode).children;
    expect(children.length).toBe(2);
    expect(children[0]!.type).toBe('rect');
    expect(children[1]!.type).toBe('rect');
  });
});

describe('ReleaseCompoundPathCommand', () => {
  it('splits a 2-subpath path into 2 separate paths', () => {
    const { bus, state } = setup();
    const compound = createPath('M0 0 L10 0 L10 10 Z M20 0 L30 0 L30 10 Z');
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [compound] } as GroupNode,
    });
    const result = bus.dispatch(new ReleaseCompoundPathCommand(compound.id));
    expect(result.ok).toBe(true);
    const children = (state.document().root as GroupNode).children;
    expect(children.length).toBe(2);
    expect(children[0]!.type).toBe('path');
    expect(children[1]!.type).toBe('path');
  });

  it('fails on single-subpath input', () => {
    const { bus, state } = setup();
    const simple = createPath('M0 0 L10 0 L10 10 Z');
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [simple] } as GroupNode,
    });
    const result = bus.dispatch(new ReleaseCompoundPathCommand(simple.id));
    expect(result.ok).toBe(false);
  });
});

describe('D-073 isDestructive marker — compound path commands', () => {
  /**
   * Audit Round 3 item #7 (2026-05-29): `MakeCompoundPathCommand`
   * REMOVES the operand inputs after baking transforms (linhas 119-121
   * de `compound-path.commands.ts`). This is structurally invasive
   * enough to warrant auto-snapshot before execute when the consumer
   * enables `SnapshotsLimits.autoOnDestructive`. Verified by reading
   * the source per the protocol "auditar antes de agir".
   *
   * `ReleaseCompoundPathCommand` is NOT marked because it only splits
   * an existing combined `d` back into separate paths — the original
   * combined path is recoverable via undo without external state.
   */
  it('MakeCompoundPathCommand is flagged isDestructive=true', () => {
    const cmd = new MakeCompoundPathCommand([]);
    expect(cmd.isDestructive).toBe(true);
  });

  it('ReleaseCompoundPathCommand is NOT flagged destructive (no input loss)', () => {
    const cmd = new ReleaseCompoundPathCommand('any' as never);
    // Cast to Command because the concrete class doesn't declare the
    // optional field — assertion that it stays falsy mirrors the
    // pattern used in page.commands.spec.ts:191-193.
    expect((cmd as { isDestructive?: boolean }).isDestructive).toBeFalsy();
  });
});
