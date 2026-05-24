import { TestBed } from '@angular/core/testing';
import { CommandBus, createSymbolUse, EditorStateService, type GroupNode } from 'svg-engine/core';
import { describe, expect, it } from 'vitest';

import { provideSvgEnginePlugin } from '../../plugin/provide-plugin';
import { provideSvgEngineEditorScope } from '../../scope';
import { builtinSymbolsPlugin, BUILTIN_SYMBOLS } from './builtin-symbols';
import { InsertSymbolInstanceCommand } from './insert-symbol-instance.command';
import { ActiveSymbolsService, SymbolLibraryService } from './symbol-library.service';

/**
 * D-059 — Symbol Library full master/instance specs.
 * 1. Plugin registers the 4 builtins in the catalog.
 * 2. ActiveSymbolsService derives <symbol> markup from
 *    SymbolUseNode references in the document.
 * 3. InsertSymbolInstanceCommand inserts a SymbolUseNode.
 * 4. Editing the master via update() preserves instances (they
 *    still reference by id — re-paint happens at render time).
 */

function setup() {
  TestBed.configureTestingModule({
    providers: [provideSvgEngineEditorScope(), provideSvgEnginePlugin(builtinSymbolsPlugin)],
  });
  return {
    catalog: TestBed.inject(SymbolLibraryService),
    active: TestBed.inject(ActiveSymbolsService),
    state: TestBed.inject(EditorStateService),
    bus: TestBed.inject(CommandBus),
  };
}

describe('builtinSymbolsPlugin — registra 4 builtins no catalog', () => {
  it('registra star, arrow, heart, gear', () => {
    const { catalog } = setup();
    const ids = catalog.items().map((i) => i.id);
    expect(ids).toContain('svge.builtin.symbol.star');
    expect(ids).toContain('svge.builtin.symbol.arrow');
    expect(ids).toContain('svge.builtin.symbol.heart');
    expect(ids).toContain('svge.builtin.symbol.gear');
    expect(catalog.items().length).toBe(BUILTIN_SYMBOLS.length);
  });

  it('cada builtin tem master + buildMarkup que emite <symbol id="...">', () => {
    const { catalog } = setup();
    for (const item of catalog.items()) {
      expect(item.master).toBeDefined();
      const markup = item.buildMarkup();
      expect(markup).toContain(`id="${item.id}"`);
      expect(markup.startsWith('<symbol')).toBe(true);
      expect(markup).toContain('</symbol>');
    }
  });
});

describe('ActiveSymbolsService — derivação de active <symbol> defs', () => {
  it('retorna vazio quando o doc não tem SymbolUseNode', () => {
    const { active } = setup();
    expect(active.activeSymbolIds()).toEqual([]);
    expect(active.buildAllActiveSymbolsMarkup()).toBe('');
  });

  it('detecta um SymbolUseNode no documento', () => {
    const { active, state } = setup();
    const use = createSymbolUse({
      symbolId: 'svge.builtin.symbol.star',
      x: 0,
      y: 0,
      width: 64,
      height: 64,
    });
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [use] } as GroupNode,
    });
    expect(active.activeSymbolIds()).toContain('svge.builtin.symbol.star');
    expect(active.buildAllActiveSymbolsMarkup()).toContain('id="svge.builtin.symbol.star"');
  });

  it('filtra ids não registrados no catalog (defensivo)', () => {
    const { active, state } = setup();
    const use = createSymbolUse({ symbolId: 'unknown.symbol', x: 0, y: 0 });
    state.setDocument({
      ...state.document(),
      root: { ...state.document().root, children: [use] } as GroupNode,
    });
    expect(active.activeSymbolIds()).toEqual([]);
  });
});

describe('InsertSymbolInstanceCommand — insert + undo', () => {
  it('insere SymbolUseNode referenciando symbolId', () => {
    const { bus, state } = setup();
    const cmd = new InsertSymbolInstanceCommand('svge.builtin.symbol.star', 10, 20, 64, 64);
    const res = bus.dispatch(cmd);
    expect(res.ok).toBe(true);
    const children = (state.document().root as GroupNode).children;
    expect(children.length).toBe(1);
    expect(children[0]!.type).toBe('symbol-use');
    const node = children[0] as {
      symbolId: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
    };
    expect(node.symbolId).toBe('svge.builtin.symbol.star');
    expect(node.x).toBe(10);
    expect(node.y).toBe(20);
    expect(node.width).toBe(64);
    expect(node.height).toBe(64);
    expect(cmd.getInsertedId()).not.toBeNull();
  });

  it('undo remove a instância', () => {
    const { bus, state } = setup();
    bus.dispatch(new InsertSymbolInstanceCommand('svge.builtin.symbol.heart', 0, 0));
    expect((state.document().root as GroupNode).children.length).toBe(1);
    bus.undo();
    expect((state.document().root as GroupNode).children.length).toBe(0);
  });
});

describe('Master/instance propagation — editing master via catalog.update()', () => {
  it('substituindo o master mantém as instâncias linkadas pelo id', () => {
    const { catalog, state, bus } = setup();
    bus.dispatch(new InsertSymbolInstanceCommand('svge.builtin.symbol.star', 0, 0));
    bus.dispatch(new InsertSymbolInstanceCommand('svge.builtin.symbol.star', 100, 0));
    const children = (state.document().root as GroupNode).children;
    expect(children.length).toBe(2);
    expect((children[0] as { symbolId: string }).symbolId).toBe('svge.builtin.symbol.star');
    expect((children[1] as { symbolId: string }).symbolId).toBe('svge.builtin.symbol.star');

    // Edit the master — replace with a different master.
    const star = catalog.get('svge.builtin.symbol.star')!;
    const newMaster = { ...star, name: 'Star (edited)' };
    catalog.update('svge.builtin.symbol.star', newMaster);

    // Instances unchanged in the document tree (still reference by id).
    const after = (state.document().root as GroupNode).children;
    expect(after.length).toBe(2);
    expect((after[0] as { symbolId: string }).symbolId).toBe('svge.builtin.symbol.star');
    // Catalog reflects the edit.
    expect(catalog.get('svge.builtin.symbol.star')!.name).toBe('Star (edited)');
  });
});
