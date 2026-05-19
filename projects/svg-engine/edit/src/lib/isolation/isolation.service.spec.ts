import { TestBed } from '@angular/core/testing';
import {
  createGroup,
  createRect,
  EditorStateService,
  generateNodeId,
  type GroupNode,
  type NodeId,
  type SvgDocument,
} from 'svg-engine/core';
import { IsolationService } from './isolation.service';

/**
 * Build a document with shape:
 *   root
 *   ├─ leafA
 *   ├─ groupA
 *   │   ├─ leafA1
 *   │   └─ groupAA
 *   │       └─ leafAA1
 *   └─ leafB
 *
 * Returns the ids so tests can navigate without re-finding nodes.
 */
function buildFixtureDoc(): {
  doc: SvgDocument;
  rootId: NodeId;
  leafA: NodeId;
  groupA: NodeId;
  leafA1: NodeId;
  groupAA: NodeId;
  leafAA1: NodeId;
  leafB: NodeId;
} {
  const leafA = createRect({ x: 0, y: 0, width: 10, height: 10 });
  const leafA1 = createRect({ x: 0, y: 0, width: 10, height: 10 });
  const leafAA1 = createRect({ x: 0, y: 0, width: 10, height: 10 });
  const groupAA = createGroup([leafAA1]);
  const groupA = createGroup([leafA1, groupAA]);
  const leafB = createRect({ x: 0, y: 0, width: 10, height: 10 });
  const root: GroupNode = createGroup([leafA, groupA, leafB]);
  const doc: SvgDocument = {
    id: generateNodeId(),
    root,
    viewBox: { x: 0, y: 0, width: 100, height: 100 },
  };
  return {
    doc,
    rootId: root.id,
    leafA: leafA.id,
    groupA: groupA.id,
    leafA1: leafA1.id,
    groupAA: groupAA.id,
    leafAA1: leafAA1.id,
    leafB: leafB.id,
  };
}

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  const isolation = TestBed.inject(IsolationService);
  isolation.exit(); // clean any leak from prior tests in the same TestBed
  const fixture = buildFixtureDoc();
  state.resetDocument(fixture.doc);
  return { state, isolation, ...fixture };
}

describe('IsolationService — defaults', () => {
  it('starts with no active isolation', () => {
    const { isolation } = setup();
    expect(isolation.isolationRootId()).toBeNull();
    expect(isolation.isActive()).toBe(false);
    expect(isolation.breadcrumbPath()).toEqual([]);
  });
});

describe('IsolationService — enter / exit', () => {
  it('enters isolation on a group node', () => {
    const { isolation, groupA } = setup();
    const changed = isolation.enter(groupA);
    expect(changed).toBe(true);
    expect(isolation.isolationRootId()).toBe(groupA);
    expect(isolation.isActive()).toBe(true);
  });

  it('refuses to isolate a leaf (non-group) node', () => {
    const { isolation, leafA } = setup();
    const changed = isolation.enter(leafA);
    expect(changed).toBe(false);
    expect(isolation.isolationRootId()).toBeNull();
  });

  it('refuses to isolate an unknown id', () => {
    const { isolation } = setup();
    const changed = isolation.enter('not-a-real-id' as NodeId);
    expect(changed).toBe(false);
    expect(isolation.isolationRootId()).toBeNull();
  });

  it('is a no-op when entering the same node twice', () => {
    const { isolation, groupA } = setup();
    isolation.enter(groupA);
    const second = isolation.enter(groupA);
    expect(second).toBe(false);
    expect(isolation.isolationRootId()).toBe(groupA);
  });

  it('exit clears isolation', () => {
    const { isolation, groupA } = setup();
    isolation.enter(groupA);
    isolation.exit();
    expect(isolation.isolationRootId()).toBeNull();
    expect(isolation.isActive()).toBe(false);
  });

  it('exit is a no-op when already exited', () => {
    const { isolation } = setup();
    isolation.exit();
    expect(isolation.isolationRootId()).toBeNull();
  });
});

describe('IsolationService — setRoot', () => {
  it('setRoot(null) exits isolation', () => {
    const { isolation, groupA } = setup();
    isolation.enter(groupA);
    isolation.setRoot(null);
    expect(isolation.isolationRootId()).toBeNull();
  });

  it('setRoot(id) enters isolation on the given group', () => {
    const { isolation, groupAA } = setup();
    isolation.setRoot(groupAA);
    expect(isolation.isolationRootId()).toBe(groupAA);
  });
});

describe('IsolationService — breadcrumbPath', () => {
  it('returns [root..target] for a nested group', () => {
    const { isolation, rootId, groupA, groupAA } = setup();
    isolation.enter(groupAA);
    expect(isolation.breadcrumbPath()).toEqual([rootId, groupA, groupAA]);
  });

  it('returns [root, target] for a direct child of root', () => {
    const { isolation, rootId, groupA } = setup();
    isolation.enter(groupA);
    expect(isolation.breadcrumbPath()).toEqual([rootId, groupA]);
  });

  it('returns [] after exiting', () => {
    const { isolation, groupA } = setup();
    isolation.enter(groupA);
    isolation.exit();
    expect(isolation.breadcrumbPath()).toEqual([]);
  });
});

describe('IsolationService — isInScope', () => {
  it('returns true for any id when no isolation is active', () => {
    const { isolation, leafA, leafB } = setup();
    expect(isolation.isInScope(leafA)).toBe(true);
    expect(isolation.isInScope(leafB)).toBe(true);
  });

  it('returns true for the isolation root itself', () => {
    const { isolation, groupA } = setup();
    isolation.enter(groupA);
    expect(isolation.isInScope(groupA)).toBe(true);
  });

  it('returns true for direct + nested descendants of the isolation root', () => {
    const { isolation, groupA, leafA1, groupAA, leafAA1 } = setup();
    isolation.enter(groupA);
    expect(isolation.isInScope(leafA1)).toBe(true);
    expect(isolation.isInScope(groupAA)).toBe(true);
    expect(isolation.isInScope(leafAA1)).toBe(true);
  });

  it('returns false for siblings of the isolation root', () => {
    const { isolation, groupA, leafA, leafB } = setup();
    isolation.enter(groupA);
    expect(isolation.isInScope(leafA)).toBe(false);
    expect(isolation.isInScope(leafB)).toBe(false);
  });
});
