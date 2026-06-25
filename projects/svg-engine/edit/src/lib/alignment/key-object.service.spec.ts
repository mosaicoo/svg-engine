import { TestBed } from '@angular/core/testing';
import { generateNodeId, type NodeId } from '@mosaicoo/svg-engine/core';
import { describe, expect, it } from 'vitest';

import { SelectionService } from '../selection/selection.service';
import { KeyObjectService } from './key-object.service';

function setup() {
  TestBed.configureTestingModule({ providers: [SelectionService, KeyObjectService] });
  return {
    selection: TestBed.inject(SelectionService),
    keyObject: TestBed.inject(KeyObjectService),
  };
}

describe('KeyObjectService (D-094)', () => {
  it('starts with no key object', () => {
    const { keyObject } = setup();
    expect(keyObject.keyObjectId()).toBeNull();
    expect(keyObject.hasKeyObject()).toBe(false);
  });

  it('designates a key object that is part of the selection', () => {
    const { selection, keyObject } = setup();
    const a = generateNodeId();
    const b = generateNodeId();
    selection.selectMany([a, b]);
    keyObject.setKeyObject(a);
    expect(keyObject.keyObjectId()).toBe(a);
    expect(keyObject.hasKeyObject()).toBe(true);
  });

  it('returns null synchronously when the key object leaves the selection', () => {
    const { selection, keyObject } = setup();
    const a = generateNodeId();
    const b = generateNodeId();
    selection.selectMany([a, b]);
    keyObject.setKeyObject(a);
    expect(keyObject.keyObjectId()).toBe(a);
    // Deselect the key → the validating computed drops it immediately,
    // without waiting for the cleanup effect to flush.
    selection.deselect(a);
    expect(keyObject.keyObjectId()).toBeNull();
    expect(keyObject.hasKeyObject()).toBe(false);
  });

  it('returns null after the selection is cleared', () => {
    const { selection, keyObject } = setup();
    const a = generateNodeId();
    selection.selectMany([a, generateNodeId()]);
    keyObject.setKeyObject(a);
    selection.clear();
    expect(keyObject.keyObjectId()).toBeNull();
  });

  it('clear() resets the key object', () => {
    const { selection, keyObject } = setup();
    const a = generateNodeId();
    selection.selectMany([a, generateNodeId()]);
    keyObject.setKeyObject(a);
    keyObject.clear();
    expect(keyObject.keyObjectId()).toBeNull();
  });

  it('never surfaces a key id that is not in the current selection', () => {
    const { selection, keyObject } = setup();
    const a = generateNodeId();
    selection.selectMany([a, generateNodeId()]);
    // Designate an id that was never selected → guard returns null.
    keyObject.setKeyObject(generateNodeId() as NodeId);
    expect(keyObject.keyObjectId()).toBeNull();
  });
});
