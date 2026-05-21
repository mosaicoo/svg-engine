import { Component, inject, Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEmptyDocument,
  createGroup,
  createRect,
  EditorStateService,
  generateNodeId,
  InsertNodeCommand,
} from 'svg-engine/core';
import { describe, expect, it } from 'vitest';

import { IsolationService } from '../isolation/isolation.service';
import { LayersService } from '../layers/layers.service';
import { SelectionService } from '../selection/selection.service';
import { provideSvgEngineEditorScope } from './editor-scope.providers';

/**
 * D-042 contract: each component that lists `provideSvgEngineEditorScope()`
 * in its providers gets a FRESH instance of every state service, isolated
 * from the root and from sibling scopes.
 */
describe('provideSvgEngineEditorScope', () => {
  function makeScopedHost() {
    @Component({
      selector: 'svge-test-scoped-host',
      standalone: true,
      template: '',
      providers: [provideSvgEngineEditorScope()],
    })
    class Host {
      readonly state = inject(EditorStateService);
      readonly bus = inject(CommandBus);
      readonly selection = inject(SelectionService);
      readonly isolation = inject(IsolationService);
      readonly layers = inject(LayersService);
      readonly injector = inject(Injector);
    }
    return Host;
  }

  it('returns a non-empty Provider[] array', () => {
    const providers = provideSvgEngineEditorScope();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(10);
  });

  it('isolates EditorStateService.document() across two scoped instances', () => {
    const Host = makeScopedHost();
    const a = TestBed.createComponent(Host).componentInstance;
    const b = TestBed.createComponent(Host).componentInstance;

    // Different instances
    expect(a.state).not.toBe(b.state);
    expect(a.bus).not.toBe(b.bus);

    // Mutate scope A: insert a shape via bus (so history is consistent)
    const rect = createRect({ x: 10, y: 10, width: 20, height: 20 });
    a.bus.dispatch(new InsertNodeCommand(a.state.document().root.id, rect));

    // Scope A sees the shape; scope B remains empty (proves no bleed)
    const aRoot = a.state.document().root;
    const bRoot = b.state.document().root;
    expect(aRoot.type === 'group' && aRoot.children.length).toBe(1);
    expect(bRoot.type === 'group' && bRoot.children.length).toBe(0);
  });

  it('isolates SelectionService selection across two scoped instances', () => {
    const Host = makeScopedHost();
    const a = TestBed.createComponent(Host).componentInstance;
    const b = TestBed.createComponent(Host).componentInstance;

    const id = generateNodeId();
    a.selection.select(id);

    expect(a.selection.selectedIds().size).toBe(1);
    expect(b.selection.selectedIds().size).toBe(0);
  });

  it('isolates IsolationService.isolationRootId across two scoped instances', () => {
    const Host = makeScopedHost();
    const a = TestBed.createComponent(Host).componentInstance;
    const b = TestBed.createComponent(Host).componentInstance;

    // IsolationService.enter() validates that the node exists in the
    // document AND is a group. Seed a group in scope A's document, then
    // enter isolation on it.
    const innerGroup = createGroup([createRect({ x: 0, y: 0, width: 10, height: 10 })]);
    const docWithGroup = createEmptyDocument();
    a.state.setDocument({
      ...docWithGroup,
      root: { ...docWithGroup.root, children: [innerGroup] },
    });
    const entered = a.isolation.enter(innerGroup.id);

    expect(entered).toBe(true);
    expect(a.isolation.isolationRootId()).toBe(innerGroup.id);
    // Scope B has a fresh empty document — its IsolationService is
    // untouched, proving no bleed.
    expect(b.isolation.isolationRootId()).toBeNull();
  });

  it('isolates LayersService hidden set across two scoped instances', () => {
    const Host = makeScopedHost();
    const a = TestBed.createComponent(Host).componentInstance;
    const b = TestBed.createComponent(Host).componentInstance;

    const id = generateNodeId();
    a.layers.setVisible(id, false); // hide in scope A

    expect(a.layers.hiddenIds().has(id)).toBe(true);
    expect(b.layers.hiddenIds().has(id)).toBe(false);
    expect(a.layers.isVisible(id)).toBe(false);
    expect(b.layers.isVisible(id)).toBe(true);
  });

  it('shares NOTHING by reference between scoped Injectors', () => {
    const Host = makeScopedHost();
    const a = TestBed.createComponent(Host).componentInstance;
    const b = TestBed.createComponent(Host).componentInstance;

    expect(a.injector).not.toBe(b.injector);
    // EditorStateService resolution via scoped injectors yields different
    // instances — proves D-042 scope semantics (the per-component
    // providers override providedIn:'root').
    expect(a.injector.get(EditorStateService)).toBe(a.state);
    expect(b.injector.get(EditorStateService)).toBe(b.state);
    expect(a.injector.get(EditorStateService)).not.toBe(b.injector.get(EditorStateService));
  });
});
