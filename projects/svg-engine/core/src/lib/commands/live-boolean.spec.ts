import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { CommandBus } from '../command-bus';
import { EditorStateService } from '../state';
import { createGroup, createRect } from '../model/node-factory';
import type { GroupNode } from '../model/group-node';
import type { PathNode } from '../model/path-node';
import type { RectNode } from '../model/rect-node';
import {
  getLiveBooleanOp,
  isLiveBooleanGroup,
  LIVE_BOOLEAN_KEY,
  LIVE_BOOLEAN_ROLE_KEY,
  MakeLiveBooleanCommand,
  ReleaseLiveBooleanCommand,
} from './live-boolean.commands';

/**
 * D-056 — Boolean Live (Item 6.1). Verifies that:
 *  - Make wraps inputs in a marked group with a derived result path,
 *    inputs survive as hidden children.
 *  - Release inverts the wrapping cleanly.
 *  - Type guards (isLiveBooleanGroup / getLiveBooleanOp) recognize
 *    the wrapper.
 */

function setup() {
  TestBed.configureTestingModule({});
  return {
    bus: TestBed.inject(CommandBus),
    state: TestBed.inject(EditorStateService),
  };
}

function seedTwoRects() {
  const r1 = createRect({ x: 0, y: 0, width: 30, height: 30 });
  const r2 = createRect({ x: 20, y: 20, width: 30, height: 30 });
  return { r1, r2 };
}

describe('MakeLiveBooleanCommand', () => {
  it('creates a wrapper group with svgeLiveBoolean metadata', () => {
    const { bus, state } = setup();
    const { r1, r2 } = seedTwoRects();
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [r1, r2] } as GroupNode,
    });
    const res = bus.dispatch(new MakeLiveBooleanCommand([r1.id, r2.id], 'union'));
    expect(res.ok).toBe(true);
    const children = (state.document().root as GroupNode).children;
    expect(children.length).toBe(1);
    expect(children[0]!.type).toBe('group');
    const group = children[0] as GroupNode;
    expect(group.metadata.customData?.[LIVE_BOOLEAN_KEY]).toBe('union');
    expect(isLiveBooleanGroup(group)).toBe(true);
    expect(getLiveBooleanOp(group)).toBe('union');
  });

  it('hides the original inputs and tags them with role=input', () => {
    const { bus, state } = setup();
    const { r1, r2 } = seedTwoRects();
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [r1, r2] } as GroupNode,
    });
    bus.dispatch(new MakeLiveBooleanCommand([r1.id, r2.id], 'union'));
    const group = (state.document().root as GroupNode).children[0] as GroupNode;
    const inputs = group.children.filter(
      (c) => c.metadata.customData?.[LIVE_BOOLEAN_ROLE_KEY] === 'input',
    );
    expect(inputs.length).toBe(2);
    for (const inp of inputs) {
      expect(inp.metadata.visible).toBe(false);
    }
  });

  it('produces a visible result path with role=result', () => {
    const { bus, state } = setup();
    const { r1, r2 } = seedTwoRects();
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [r1, r2] } as GroupNode,
    });
    bus.dispatch(new MakeLiveBooleanCommand([r1.id, r2.id], 'union'));
    const group = (state.document().root as GroupNode).children[0] as GroupNode;
    const results = group.children.filter(
      (c) => c.metadata.customData?.[LIVE_BOOLEAN_ROLE_KEY] === 'result',
    );
    expect(results.length).toBe(1);
    expect(results[0]!.type).toBe('path');
    const resultPath = results[0] as PathNode;
    expect(resultPath.d.length).toBeGreaterThan(0);
    expect(resultPath.metadata.visible).toBe(true);
  });

  it('fails for fewer than 2 inputs', () => {
    const { bus, state } = setup();
    const { r1 } = seedTwoRects();
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [r1] } as GroupNode,
    });
    const res = bus.dispatch(new MakeLiveBooleanCommand([r1.id], 'union'));
    expect(res.ok).toBe(false);
  });
});

describe('ReleaseLiveBooleanCommand', () => {
  it('restores both originals visible after release', () => {
    const { bus, state } = setup();
    const { r1, r2 } = seedTwoRects();
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [r1, r2] } as GroupNode,
    });
    bus.dispatch(new MakeLiveBooleanCommand([r1.id, r2.id], 'subtract'));
    const groupId = (state.document().root as GroupNode).children[0]!.id;
    bus.dispatch(new ReleaseLiveBooleanCommand(groupId));
    const children = (state.document().root as GroupNode).children;
    // Two restored rects, no group/result.
    expect(children.length).toBe(2);
    expect(children[0]!.type).toBe('rect');
    expect(children[1]!.type).toBe('rect');
    expect(children[0]!.metadata.visible).toBe(true);
    expect(children[1]!.metadata.visible).toBe(true);
    // Role tag should be cleaned up.
    expect(children[0]!.metadata.customData?.[LIVE_BOOLEAN_ROLE_KEY]).toBeUndefined();
  });

  it('fails when target node is not a live-boolean group', () => {
    const { bus, state } = setup();
    const { r1 } = seedTwoRects();
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [r1] } as GroupNode,
    });
    const res = bus.dispatch(new ReleaseLiveBooleanCommand(r1.id));
    expect(res.ok).toBe(false);
  });
});

describe('isLiveBooleanGroup type guard', () => {
  it('returns false for a regular rect', () => {
    const r: RectNode = createRect({ x: 0, y: 0, width: 10, height: 10 });
    expect(isLiveBooleanGroup(r)).toBe(false);
  });

  it('returns false for a group without the marker', () => {
    const g: GroupNode = createGroup();
    expect(isLiveBooleanGroup(g)).toBe(false);
  });
});
