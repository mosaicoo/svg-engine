import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { CommandBus } from '../command-bus/command-bus.service';
import { createEmptyDocument } from '../document/document-factory';
import { createGroup, createRect } from '../model';
import { EditorStateService } from '../state/editor-state.service';
import { type NodeId } from '../types/node-id';
import { type InsertParentResolver } from './command';
import { AUTO_PARENT, InsertNodeCommand } from './insert-node.command';
import { INSERT_PARENT_RESOLVER } from './insert-parent-resolver.token';

/**
 * **PAGES-REFACTOR Fase 1** specs — verifies the contract that
 * `InsertNodeCommand` with `parentId: AUTO_PARENT` is resolved via
 * `CommandContext.parentResolver`, falling back to the document root
 * when no resolver is wired (headless / Node usage).
 */
describe('PAGES-REFACTOR Fase 1 — InsertNodeCommand + AUTO_PARENT', () => {
  describe('Without INSERT_PARENT_RESOLVER (headless / core-only)', () => {
    function setup() {
      TestBed.configureTestingModule({});
      const state = TestBed.inject(EditorStateService);
      state.resetDocument(createEmptyDocument());
      return { state, bus: TestBed.inject(CommandBus) };
    }

    it('AUTO_PARENT falls back to doc.root.id when no resolver is provided', () => {
      const { state, bus } = setup();
      const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
      const cmd = new InsertNodeCommand(AUTO_PARENT, rect);
      bus.dispatch(cmd);

      expect(cmd.getResolvedParentId()).toBe(state.document().root.id);
      // Node landed at the root level.
      expect(state.document().root.children.map((c) => c.id)).toContain(rect.id);
    });

    it('Explicit parentId is honoured (back-compat path)', () => {
      const { state, bus } = setup();
      // Seed: root contains a group; we'll insert a rect INTO that group.
      const group = createGroup([], {});
      state.setDocument({
        ...state.document(),
        root: { ...state.document().root, children: [group] },
      });
      const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
      const cmd = new InsertNodeCommand(group.id, rect);
      bus.dispatch(cmd);

      expect(cmd.getResolvedParentId()).toBe(group.id);
      // Root has only the group; the rect went inside the group.
      const root = state.document().root;
      expect(root.children.length).toBe(1);
      const updatedGroup = root.children[0];
      if (updatedGroup === undefined || updatedGroup.type !== 'group') {
        throw new Error('expected the group still at top-level');
      }
      expect(updatedGroup.children.map((c) => c.id)).toContain(rect.id);
    });
  });

  describe('With INSERT_PARENT_RESOLVER wired (editor scope)', () => {
    /**
     * Resolver double — emulates `ActivePageService.resolveAutoParent()`
     * without importing svg-engine/edit (preserves core's headless
     * boundary). Returns whatever id the test handed it at construction.
     */
    class FakeResolver implements InsertParentResolver {
      constructor(private readonly fixedId: NodeId) {}
      resolveAutoParent(): NodeId {
        return this.fixedId;
      }
    }

    it('AUTO_PARENT lands in the resolver-returned parent id (e.g., active page)', () => {
      const groupId: NodeId = 'fake-page-id' as NodeId;
      // Seed the doc with a group whose id matches the resolver's value.
      const group = { ...createGroup([], {}), id: groupId };
      TestBed.configureTestingModule({
        providers: [{ provide: INSERT_PARENT_RESOLVER, useValue: new FakeResolver(groupId) }],
      });
      const state = TestBed.inject(EditorStateService);
      state.resetDocument({
        ...createEmptyDocument(),
        root: { ...createEmptyDocument().root, children: [group] },
      });
      const bus = TestBed.inject(CommandBus);

      const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
      const cmd = new InsertNodeCommand(AUTO_PARENT, rect);
      bus.dispatch(cmd);

      expect(cmd.getResolvedParentId()).toBe(groupId);
      // Rect landed inside the resolver-returned group, not at root.
      const root = state.document().root;
      expect(root.children.length).toBe(1);
      const updatedGroup = root.children[0];
      if (updatedGroup === undefined || updatedGroup.type !== 'group') {
        throw new Error('expected the group still at top-level');
      }
      expect(updatedGroup.children.map((c) => c.id)).toContain(rect.id);
    });

    it('Explicit parentId still wins over the resolver', () => {
      const resolverId: NodeId = 'resolver-id' as NodeId;
      const explicitGroupId: NodeId = 'explicit-id' as NodeId;
      const resolverGroup = { ...createGroup([], {}), id: resolverId };
      const explicitGroup = { ...createGroup([], {}), id: explicitGroupId };
      TestBed.configureTestingModule({
        providers: [{ provide: INSERT_PARENT_RESOLVER, useValue: new FakeResolver(resolverId) }],
      });
      const state = TestBed.inject(EditorStateService);
      state.resetDocument({
        ...createEmptyDocument(),
        root: { ...createEmptyDocument().root, children: [resolverGroup, explicitGroup] },
      });
      const bus = TestBed.inject(CommandBus);

      const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
      const cmd = new InsertNodeCommand(explicitGroupId, rect);
      bus.dispatch(cmd);

      expect(cmd.getResolvedParentId()).toBe(explicitGroupId);
      // Rect landed in the explicit group, NOT in the resolver's group.
      const explicit = state.document().root.children.find((c) => c.id === explicitGroupId);
      const resolver = state.document().root.children.find((c) => c.id === resolverId);
      if (explicit === undefined || explicit.type !== 'group') {
        throw new Error('expected explicit group at top-level');
      }
      if (resolver === undefined || resolver.type !== 'group') {
        throw new Error('expected resolver group at top-level');
      }
      expect(explicit.children.map((c) => c.id)).toContain(rect.id);
      expect(resolver.children.map((c) => c.id)).not.toContain(rect.id);
    });
  });
});
