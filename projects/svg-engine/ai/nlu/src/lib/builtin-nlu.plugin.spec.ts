import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CommandBus, createEmptyDocument, EditorStateService } from 'svg-engine/core';
import { MenuContributionRegistry, PluginRegistry } from 'svg-engine/edit';
import { describe, expect, it } from 'vitest';
import { builtinNluPlugin } from './builtin-nlu.plugin';
import { NaturalLanguageService } from './natural-language.service';

function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  return {
    plugins: TestBed.inject(PluginRegistry),
    nlu: TestBed.inject(NaturalLanguageService),
    menus: TestBed.inject(MenuContributionRegistry),
    bus: TestBed.inject(CommandBus),
    state,
    injector: TestBed.inject(Injector),
  };
}

describe('builtinNluPlugin', () => {
  it('installs without error and registers intents', () => {
    const { plugins, nlu } = setup();
    expect(nlu.intents().length).toBe(0);
    plugins.install(builtinNluPlugin);
    // Pelo menos os 2 customizados (create-shape + set-fill)
    expect(nlu.intents().length).toBeGreaterThanOrEqual(2);
  });

  it('auto-discovers existing menu contributions when installed AFTER them', () => {
    const { plugins, nlu, menus } = setup();
    menus.register({
      id: 'svge.test.menu.undo',
      slot: 'menu.edit',
      label: 'Undo',
      run() {
        /* no-op */
      },
    });
    plugins.install(builtinNluPlugin);
    const all = nlu.intents();
    expect(all.some((i) => i.id === 'svge.nlu.menu.svge.test.menu.undo')).toBe(true);
  });

  it('parses "criar retangulo vermelho" → create-shape com fill resolvido', async () => {
    const { plugins, nlu, injector, bus, state } = setup();
    plugins.install(builtinNluPlugin);

    const ctx = { injector };
    const candidates = nlu.parse('criar retangulo vermelho', ctx);
    const top = candidates[0];
    expect(top).toBeDefined();
    expect(top.intent.id).toBe('svge.builtin.nlu.create-shape');
    expect(top.slots['fill']).toBe('#e53935');
    expect(top.confidence).toBeGreaterThan(0.6);

    // execute deveria dispatchar InsertNodeCommand → +1 child no root.
    const before = state.document().root.children.length;
    const result = await nlu.execute('criar retangulo vermelho', ctx);
    expect(result.executed).toBe(true);
    const after = state.document().root.children.length;
    expect(after).toBe(before + 1);

    // Histórico deveria ter o command registrado pra undo.
    // Não verificamos detalhes do tipo de command pra evitar acoplamento
    // — só validamos que a side-effect aconteceu (mudança de doc).
    void bus;
  });

  it('parses "create a blue circle" em EN → cria ellipse com fill azul', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);

    const ctx = { injector };
    const before = state.document().root.children.length;
    const result = await nlu.execute('create a blue circle', ctx);
    expect(result.executed).toBe(true);
    const after = state.document().root.children.length;
    expect(after).toBe(before + 1);
    const added = state.document().root.children[after - 1];
    expect(added.type).toBe('ellipse');
    expect(added.style?.fill).toBe('#1e88e5');
  });

  it('parses "100x50" como width/height da forma criada', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);

    const ctx = { injector };
    const result = await nlu.execute('create a rect 100x50', ctx);
    expect(result.executed).toBe(true);
    const added = state.document().root.children.at(-1)!;
    expect(added.type).toBe('rect');
    if (added.type === 'rect') {
      expect(added.width).toBe(100);
      expect(added.height).toBe(50);
    }
  });

  it('survives fuzzy typos: "criar retangulo" → create-shape', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);

    const ctx = { injector };
    // 'retangle' typo de 'retangulo'/'rectangle'
    const candidates = nlu.parse('criar retangle', ctx);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].intent.id).toBe('svge.builtin.nlu.create-shape');

    void state;
  });
});
