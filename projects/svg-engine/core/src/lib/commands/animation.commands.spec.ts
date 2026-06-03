import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ANIMATION_KEY, DEFAULT_EASING, findTrack, readAnimationDoc } from '../animation';
import { createEmptyDocument } from '../document/document-factory';
import { EditorStateService } from '../state/editor-state.service';
import { generateNodeId } from '../types/node-id';
import { AddKeyframeCommand } from './animation.commands';

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  return { state, ctx: { state }, rootId: state.document().root.id };
}

function seedRootCustomData(state: EditorStateService, data: Record<string, unknown>): void {
  const doc = state.document();
  state.setDocument({
    ...doc,
    root: { ...doc.root, metadata: { ...doc.root.metadata, customData: data } },
  });
}

const NODE = generateNodeId();

describe('AddKeyframeCommand', () => {
  it('stores the keyframe in the container metadata.customData', () => {
    const { state, ctx, rootId } = setup();
    const r = new AddKeyframeCommand(rootId, NODE, 'x', {
      time: 0,
      value: 10,
      easing: DEFAULT_EASING,
    }).execute(ctx);
    expect(r.ok).toBe(true);
    const anim = readAnimationDoc(state.document().root);
    expect(anim).not.toBeNull();
    expect(findTrack(anim!, NODE, 'x')!.keyframes[0]).toEqual({
      time: 0,
      value: 10,
      easing: DEFAULT_EASING,
    });
  });

  it('does not touch the base node fields (non-destructive)', () => {
    const { state, ctx, rootId } = setup();
    const before = state.document().root;
    new AddKeyframeCommand(rootId, NODE, 'x', {
      time: 0,
      value: 10,
      easing: DEFAULT_EASING,
    }).execute(ctx);
    const after = state.document().root;
    // Only metadata.customData changed; the rest of the node is structurally equal.
    expect(after.children).toBe(before.children);
    expect(after.id).toBe(before.id);
  });

  it('a second keyframe merges into the same animation doc', () => {
    const { state, ctx, rootId } = setup();
    new AddKeyframeCommand(rootId, NODE, 'x', {
      time: 0,
      value: 0,
      easing: DEFAULT_EASING,
    }).execute(ctx);
    new AddKeyframeCommand(rootId, NODE, 'x', {
      time: 100,
      value: 50,
      easing: DEFAULT_EASING,
    }).execute(ctx);
    const anim = readAnimationDoc(state.document().root)!;
    expect(findTrack(anim, NODE, 'x')!.keyframes.map((k) => k.time)).toEqual([0, 100]);
  });

  it('preserves other customData keys', () => {
    const { state, ctx, rootId } = setup();
    seedRootCustomData(state, { foo: 'bar' });
    new AddKeyframeCommand(rootId, NODE, 'x', {
      time: 0,
      value: 1,
      easing: DEFAULT_EASING,
    }).execute(ctx);
    const cd = state.document().root.metadata.customData!;
    expect(cd['foo']).toBe('bar');
    expect(cd[ANIMATION_KEY]).toBeDefined();
  });

  it('undo strips customData entirely when it was absent before', () => {
    const { state, ctx, rootId } = setup();
    const cmd = new AddKeyframeCommand(rootId, NODE, 'x', {
      time: 0,
      value: 1,
      easing: DEFAULT_EASING,
    });
    cmd.execute(ctx);
    cmd.undo(ctx);
    const meta = state.document().root.metadata;
    expect(Object.prototype.hasOwnProperty.call(meta, 'customData')).toBe(false);
  });

  it('undo restores the prior customData when it existed', () => {
    const { state, ctx, rootId } = setup();
    seedRootCustomData(state, { foo: 'bar' });
    const cmd = new AddKeyframeCommand(rootId, NODE, 'x', {
      time: 0,
      value: 1,
      easing: DEFAULT_EASING,
    });
    cmd.execute(ctx);
    cmd.undo(ctx);
    const cd = state.document().root.metadata.customData!;
    expect(cd).toEqual({ foo: 'bar' });
    expect(cd[ANIMATION_KEY]).toBeUndefined();
  });

  it('fails when the container is missing', () => {
    const { ctx } = setup();
    const r = new AddKeyframeCommand(generateNodeId(), NODE, 'x', {
      time: 0,
      value: 1,
      easing: DEFAULT_EASING,
    }).execute(ctx);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/);
  });
});
