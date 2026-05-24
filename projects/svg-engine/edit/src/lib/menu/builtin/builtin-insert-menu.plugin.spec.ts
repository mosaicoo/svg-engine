import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEmptyDocument,
  EditorStateService,
  type RectNode,
  type EllipseNode,
  type GroupNode,
} from 'svg-engine/core';
import { describe, expect, it } from 'vitest';

import { provideSvgEnginePlugin } from '../../plugin/provide-plugin';
import { provideSvgEngineEditorScope } from '../../scope';
import { SelectionService } from '../../selection/selection.service';
import { MenuContributionRegistry } from '../menu-contribution-registry.service';
import { runContribution } from '../menu-context';
import { MENU_SLOT } from '../menu-slots';
import { builtinInsertMenuPlugin } from './builtin-insert-menu.plugin';

/**
 * D-052 — verifica que o Insert menu:
 * 1. Registra os itens canônicos no slot menu.insert
 * 2. Tem a hierarquia parent/child correta (Shape ▶ Rectangle/Ellipse/etc)
 * 3. Cada item inserts via CommandBus + selects o novo nó (run handlers)
 */

function setup() {
  TestBed.configureTestingModule({
    providers: [provideSvgEngineEditorScope(), provideSvgEnginePlugin(builtinInsertMenuPlugin)],
  });
  return {
    reg: TestBed.inject(MenuContributionRegistry),
    bus: TestBed.inject(CommandBus),
    state: TestBed.inject(EditorStateService),
    selection: TestBed.inject(SelectionService),
    injector: TestBed.inject(Injector),
  };
}

describe('builtinInsertMenuPlugin — registra os itens canônicos', () => {
  it('popula menu.insert com Shape (parent) + Text + Image + divider', () => {
    const { reg } = setup();
    const ids = reg
      .bySlot(MENU_SLOT.INSERT)()
      .map((c) => c.id);
    expect(ids).toContain('svge.insert.shape');
    expect(ids).toContain('svge.insert.text');
    expect(ids).toContain('svge.insert.image');
    expect(ids).toContain('svge.insert.divider1');
  });

  it('expõe o submenu Shape com 7 children (rect, rounded, ellipse, line, triangle, polygon, star)', () => {
    const { reg } = setup();
    const all = reg.bySlot(MENU_SLOT.INSERT)();
    const children = all.filter((c) => c.parentId === 'svge.insert.shape').map((c) => c.id);
    expect(children).toContain('svge.insert.shape.rect');
    expect(children).toContain('svge.insert.shape.rounded-rect');
    expect(children).toContain('svge.insert.shape.ellipse');
    expect(children).toContain('svge.insert.shape.line');
    expect(children).toContain('svge.insert.shape.triangle');
    expect(children).toContain('svge.insert.shape.polygon');
    expect(children).toContain('svge.insert.shape.star');
  });
});

describe('builtinInsertMenuPlugin — run handlers inserem + selecionam', () => {
  it('"Rectangle" insere um RectNode e o seleciona', () => {
    const { reg, state, selection, injector } = setup();
    state.resetDocument(createEmptyDocument());
    const initialChildren = (state.document().root as GroupNode).children.length;

    const rect = reg
      .bySlot(MENU_SLOT.INSERT)()
      .find((c) => c.id === 'svge.insert.shape.rect');
    expect(rect).toBeDefined();
    runContribution(rect!, injector);

    const children = (state.document().root as GroupNode).children;
    expect(children.length).toBe(initialChildren + 1);
    const inserted = children.at(-1)!;
    expect(inserted.type).toBe('rect');
    const r = inserted as RectNode;
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
    expect(selection.selectedIds().has(inserted.id)).toBe(true);
  });

  it('"Ellipse" insere um EllipseNode com rx/ry positivos', () => {
    const { reg, state, injector } = setup();
    state.resetDocument(createEmptyDocument());

    const ellipse = reg
      .bySlot(MENU_SLOT.INSERT)()
      .find((c) => c.id === 'svge.insert.shape.ellipse');
    runContribution(ellipse!, injector);

    const children = (state.document().root as GroupNode).children;
    const inserted = children.at(-1)!;
    expect(inserted.type).toBe('ellipse');
    const e = inserted as EllipseNode;
    expect(e.rx).toBeGreaterThan(0);
    expect(e.ry).toBeGreaterThan(0);
  });

  it('"Star" insere um PathNode (silhueta de estrela serializada como d)', () => {
    const { reg, state, injector } = setup();
    state.resetDocument(createEmptyDocument());

    const star = reg
      .bySlot(MENU_SLOT.INSERT)()
      .find((c) => c.id === 'svge.insert.shape.star');
    runContribution(star!, injector);

    const children = (state.document().root as GroupNode).children;
    const inserted = children.at(-1)!;
    expect(inserted.type).toBe('path');
  });

  it('"Text" insere um TextNode com placeholder "Text"', () => {
    const { reg, state, injector } = setup();
    state.resetDocument(createEmptyDocument());

    const text = reg
      .bySlot(MENU_SLOT.INSERT)()
      .find((c) => c.id === 'svge.insert.text');
    runContribution(text!, injector);

    const children = (state.document().root as GroupNode).children;
    const inserted = children.at(-1)!;
    expect(inserted.type).toBe('text');
    expect((inserted as { content: string }).content).toBe('Text');
  });
});
