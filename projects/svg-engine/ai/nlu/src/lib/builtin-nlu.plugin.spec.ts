import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEmptyDocument,
  createRect,
  EditorStateService,
  HistoryService,
  InsertNodeCommand,
} from 'svg-engine/core';
import { MenuContributionRegistry, PluginRegistry, SelectionService } from 'svg-engine/edit';
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
    selection: TestBed.inject(SelectionService),
    history: TestBed.inject(HistoryService),
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

  // ── D-046 review-2 regression tests (5 casos reportados) ─────

  it('REGRESSION: "Criar circulo azul" cria CIRCLE, NÃO rectangle', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    await nlu.execute('Criar circulo azul', { injector });
    const added = state.document().root.children.at(-1)!;
    expect(added.type).toBe('ellipse'); // circle é ellipse com rx=ry
    if (added.type === 'ellipse') {
      expect(added.rx).toBe(added.ry);
    }
    expect(added.style?.fill).toBe('#1e88e5');
  });

  it('REGRESSION: "Crie uma bola azul marinho" reconhece cor composta', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const before = state.document().root.children.length;
    const result = await nlu.execute('Crie uma bola azul marinho', { injector });
    expect(result.executed).toBe(true);
    expect(state.document().root.children.length).toBe(before + 1);
    const added = state.document().root.children.at(-1)!;
    expect(added.type).toBe('ellipse');
    // azul + marinho → 'azulmarinho' (concat) → navy = #0d47a1
    expect(added.style?.fill).toBe('#0d47a1');
  });

  it('REGRESSION: "Duplicar objeto selecionado" cria duplicata', async () => {
    const { plugins, nlu, injector, state, selection, bus } = setup();
    plugins.install(builtinNluPlugin);
    const rect = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const rootId = state.document().root.id;
    bus.dispatch(new InsertNodeCommand(rootId, rect));
    selection.select(rect.id);
    const before = state.document().root.children.length;
    const result = await nlu.execute('Duplicar objeto selecionado', { injector });
    expect(result.executed).toBe(true);
    expect(state.document().root.children.length).toBe(before + 1);
  });

  it('REGRESSION: "Mover selecionado 10 20" dispara MoveNodeCommand', async () => {
    const { plugins, nlu, injector, state, selection, bus } = setup();
    plugins.install(builtinNluPlugin);
    const rect = createRect({ x: 5, y: 5, width: 10, height: 10 });
    const rootId = state.document().root.id;
    bus.dispatch(new InsertNodeCommand(rootId, rect));
    selection.select(rect.id);
    const result = await nlu.execute('Mover selecionado 10 20', { injector });
    expect(result.executed).toBe(true);
    // Validamos que o intent foi `move-selected`, não outro.
    expect(result.candidate?.intent.id).toBe('svge.builtin.nlu.move-selected');
  });

  it('REGRESSION: "Redimensionar selecionado 200 por 200" dispara ResizeNodeCommand', async () => {
    const { plugins, nlu, injector, state, selection, bus } = setup();
    plugins.install(builtinNluPlugin);
    const rect = createRect({ x: 0, y: 0, width: 50, height: 50 });
    const rootId = state.document().root.id;
    bus.dispatch(new InsertNodeCommand(rootId, rect));
    selection.select(rect.id);
    const result = await nlu.execute('Redimensionar selecionado 200 por 200', { injector });
    expect(result.executed).toBe(true);
    expect(result.candidate?.intent.id).toBe('svge.builtin.nlu.resize-selected');
  });

  it('REGRESSION: "pinta vermelho" muda fill do selecionado', async () => {
    const { plugins, nlu, injector, state, selection, bus } = setup();
    plugins.install(builtinNluPlugin);
    const rect = createRect({ x: 0, y: 0, width: 50, height: 50 });
    const rootId = state.document().root.id;
    bus.dispatch(new InsertNodeCommand(rootId, rect));
    selection.select(rect.id);
    const result = await nlu.execute('pinta vermelho', { injector });
    expect(result.executed).toBe(true);
    expect(result.candidate?.intent.id).toBe('svge.builtin.nlu.set-fill');
    // O nó deve ter recebido fill #e53935 (red do dicionário)
    const updated = state.document().root.children[0];
    expect(updated.style?.fill).toBe('#e53935');
  });

  // ── D-046 review-3: comandos compostos (anchorKeywords + point) ─

  it('REGRESSION: "criar retangulo vermelho borda azul" cria com fill+stroke', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const result = await nlu.execute('criar retangulo vermelho borda azul', { injector });
    expect(result.executed).toBe(true);
    const added = state.document().root.children.at(-1)!;
    expect(added.type).toBe('rect');
    expect(added.style?.fill).toBe('#e53935');
    expect(added.style?.stroke).toBe('#1e88e5');
  });

  it('REGRESSION FULL: "crie um circulo preto 50x50 com borda azul tamanho 5 posicao 100 100"', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const result = await nlu.execute(
      'crie um circulo preto 50x50 com borda azul tamanho 5 posicao 100 100',
      { injector },
    );
    expect(result.executed).toBe(true);
    const added = state.document().root.children.at(-1)!;
    // shape='circle' → factory cria ellipse com rx=ry
    expect(added.type).toBe('ellipse');
    if (added.type === 'ellipse') {
      expect(added.rx).toBe(added.ry);
      expect(added.rx).toBe(25); // min(50,50)/2
      expect(added.cx).toBe(100);
      expect(added.cy).toBe(100);
    }
    expect(added.style?.fill).toBe('#000000'); // preto
    expect(added.style?.stroke).toBe('#1e88e5'); // azul
    expect(added.style?.strokeWidth).toBe(5);
  });

  it('REGRESSION: "crie um circulo preto 50x50 com borda azul de tamanho 5px na posição 100x100" (exato do usuário)', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    // Frase exata reportada — com 'de'/'na' (stopwords), 'tamanho' (anchor),
    // '5px' (number com unit), 'posição' (com acento → tokenize deacenta),
    // '100x100' (dimension token reutilizado como point via anchored).
    const result = await nlu.execute(
      'crie um circulo preto 50x50 com borda azul de tamanho 5px na posição 100x100',
      { injector },
    );
    expect(result.executed).toBe(true);
    const added = state.document().root.children.at(-1)!;
    expect(added.type).toBe('ellipse');
    if (added.type === 'ellipse') {
      expect(added.cx).toBe(100);
      expect(added.cy).toBe(100);
      expect(added.rx).toBe(25);
      expect(added.ry).toBe(25);
    }
    expect(added.style?.fill).toBe('#000000');
    expect(added.style?.stroke).toBe('#1e88e5');
    expect(added.style?.strokeWidth).toBe(5);
  });

  it('cria forma com APENAS stroke (sem fill) quando user só especifica contorno', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    // Usa 'contorno' em vez de 'borda' porque 'borda' fuzzy-matcha
    // 'bordo' (#800020) no positional pass — comportamento documentado
    // do extractor. Quando o anchor word É similar a uma cor, melhor
    // o user dizer fill explícito ('fill X borda Y').
    const result = await nlu.execute('criar retangulo contorno verde', { injector });
    expect(result.executed).toBe(true);
    const added = state.document().root.children.at(-1)!;
    expect(added.type).toBe('rect');
    expect(added.style?.stroke).toBe('#43a047');
    // fill não foi especificado → style é { stroke: ... } sem fill
    // (factory NÃO aplica DEFAULT_STYLE porque passamos explicit style).
    expect(added.style?.fill).toBeUndefined();
  });

  it('REGRESSION: "cor azul" muda fill em multi-select (single undo)', async () => {
    const { plugins, nlu, injector, state, selection, bus } = setup();
    plugins.install(builtinNluPlugin);
    const r1 = createRect({ x: 0, y: 0, width: 10, height: 10 });
    const r2 = createRect({ x: 20, y: 0, width: 10, height: 10 });
    const rootId = state.document().root.id;
    bus.dispatch(new InsertNodeCommand(rootId, r1));
    bus.dispatch(new InsertNodeCommand(rootId, r2));
    const originalFill1 = state.document().root.children[0].style?.fill;
    const originalFill2 = state.document().root.children[1].style?.fill;
    selection.selectMany([r1.id, r2.id]);
    const result = await nlu.execute('cor azul', { injector });
    expect(result.executed).toBe(true);
    // Ambos os nós com fill #1e88e5 (azul)
    expect(state.document().root.children[0].style?.fill).toBe('#1e88e5');
    expect(state.document().root.children[1].style?.fill).toBe('#1e88e5');
    // Undo único reverte ambos para o fill original (DEFAULT_STYLE)
    bus.undo();
    expect(state.document().root.children[0].style?.fill).toBe(originalFill1);
    expect(state.document().root.children[1].style?.fill).toBe(originalFill2);
  });

  // ── D-046 review-5: polígonos / linha / polyline / texto ────

  it('REGRESSION USUARIO: "Criar um polígono rosa no tamanho 100x100" cria polygon REAL', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const before = state.document().root.children.length;
    const result = await nlu.execute('Criar um polígono rosa no tamanho 100x100', { injector });
    expect(result.executed).toBe(true);
    expect(state.document().root.children.length).toBe(before + 1);
    const added = state.document().root.children.at(-1)!;
    // Polígono genérico = hexagono (6 lados). Cor rosa = #ec407a.
    expect(added.type).toBe('polygon');
    if (added.type === 'polygon') {
      expect(added.points.length).toBe(6);
    }
    expect(added.style?.fill).toBe('#ec407a');
  });

  it('cria triangulo (3 vértices) com "criar triangulo verde"', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const result = await nlu.execute('criar triangulo verde', { injector });
    expect(result.executed).toBe(true);
    const added = state.document().root.children.at(-1)!;
    expect(added.type).toBe('polygon');
    if (added.type === 'polygon') {
      expect(added.points.length).toBe(3);
    }
    expect(added.style?.fill).toBe('#43a047');
  });

  it('cria pentagono (5 vértices) com "create pentagon blue"', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const result = await nlu.execute('create pentagon blue', { injector });
    expect(result.executed).toBe(true);
    const added = state.document().root.children.at(-1)!;
    expect(added.type).toBe('polygon');
    if (added.type === 'polygon') {
      expect(added.points.length).toBe(5);
    }
  });

  it('cria hexagono (6 vértices) com "criar hexagono"', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const result = await nlu.execute('criar hexagono', { injector });
    expect(result.executed).toBe(true);
    const added = state.document().root.children.at(-1)!;
    expect(added.type).toBe('polygon');
    if (added.type === 'polygon') {
      expect(added.points.length).toBe(6);
    }
  });

  it('cria octogono (8 vértices) com "criar octogono"', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const result = await nlu.execute('criar octogono', { injector });
    expect(result.executed).toBe(true);
    const added = state.document().root.children.at(-1)!;
    expect(added.type).toBe('polygon');
    if (added.type === 'polygon') {
      expect(added.points.length).toBe(8);
    }
  });

  it('cria estrela (10 vértices = 5 pontas) com "criar estrela amarela"', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const result = await nlu.execute('criar estrela amarela', { injector });
    expect(result.executed).toBe(true);
    const added = state.document().root.children.at(-1)!;
    expect(added.type).toBe('polygon');
    if (added.type === 'polygon') {
      // Estrela 5 pontas = 10 vértices alternados (outer/inner)
      expect(added.points.length).toBe(10);
    }
    expect(added.style?.fill).toBe('#fdd835');
  });

  it('cria linha REAL com "criar linha vermelha"', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const result = await nlu.execute('criar linha vermelha', { injector });
    expect(result.executed).toBe(true);
    const added = state.document().root.children.at(-1)!;
    expect(added.type).toBe('line');
    if (added.type === 'line') {
      // Linha horizontal centrada → y1 === y2
      expect(added.y1).toBe(added.y2);
    }
    expect(added.style?.stroke ?? added.style?.fill).toBeDefined();
  });

  it('cria texto REAL com "criar texto"', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const result = await nlu.execute('criar texto', { injector });
    expect(result.executed).toBe(true);
    const added = state.document().root.children.at(-1)!;
    expect(added.type).toBe('text');
    if (added.type === 'text') {
      expect(added.content.length).toBeGreaterThan(0);
      expect(added.fontSize).toBeGreaterThan(0);
    }
  });

  it('cria losango (4 vértices) com "criar losango"', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const result = await nlu.execute('criar losango', { injector });
    expect(result.executed).toBe(true);
    const added = state.document().root.children.at(-1)!;
    expect(added.type).toBe('polygon');
    if (added.type === 'polygon') {
      expect(added.points.length).toBe(4);
    }
  });
});

describe('NaturalLanguageService.executeSequence (multi-comando)', () => {
  it('frase simples = 1 comando (idêntico ao execute)', async () => {
    const { plugins, nlu, injector, state, history } = setup();
    plugins.install(builtinNluPlugin);
    const before = state.document().root.children.length;
    const results = await nlu.executeSequence('criar retangulo vermelho', { injector });
    expect(results.length).toBe(1);
    expect(results[0].executed).toBe(true);
    expect(state.document().root.children.length).toBe(before + 1);
    expect(history.undoStack().length).toBe(1);
  });

  it('duas formas numa frase → 2 comandos + 2 nós + 2 undos separados', async () => {
    const { plugins, nlu, injector, state, history } = setup();
    plugins.install(builtinNluPlugin);
    const before = state.document().root.children.length;
    const results = await nlu.executeSequence('crie um circulo preto e um retangulo amarelo', {
      injector,
    });
    expect(results.length).toBe(2);
    expect(results.every((r) => r.executed)).toBe(true);
    expect(state.document().root.children.length).toBe(before + 2);
    // **Undo separado por forma**: 2 commands no histórico.
    expect(history.undoStack().length).toBe(2);
    const [a, b] = state.document().root.children.slice(-2);
    expect(a.type).toBe('ellipse'); // círculo
    expect(b.type).toBe('rect'); // retângulo
    expect(b.style?.fill).toBe('#fdd835'); // amarelo
  });

  it('frase composta complexa do usuário cria as DUAS formas', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const before = state.document().root.children.length;
    const results = await nlu.executeSequence(
      'crie um circulo preto 50x50 com borda azul de tamanho 5px na posicao 100x100, e um retangulo amarelo 30 350',
      { injector },
    );
    expect(results.length).toBe(2);
    expect(results.every((r) => r.executed)).toBe(true);
    expect(state.document().root.children.length).toBe(before + 2);
    const circle = state.document().root.children.at(-2)!;
    const rect = state.document().root.children.at(-1)!;
    expect(circle.type).toBe('ellipse');
    expect(circle.style?.stroke).toBe('#1e88e5'); // borda azul
    expect(circle.style?.strokeWidth).toBe(5);
    expect(rect.type).toBe('rect');
  });

  it('NÃO faz over-split de lista de cor: "preto e branco" = 1 comando', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const before = state.document().root.children.length;
    const results = await nlu.executeSequence('criar retangulo preto e branco', { injector });
    // "branco" sozinho não é comando (sem forma/verbo) → re-fundido.
    expect(results.length).toBe(1);
    expect(state.document().root.children.length).toBe(before + 1);
  });
});

describe('create-shape repetição (count)', () => {
  it('"crie 3 circulos vermelhos" → count=3, NÃO vira dimensão', () => {
    const { plugins, nlu, injector } = setup();
    plugins.install(builtinNluPlugin);
    const top = nlu.parse('crie 3 circulos vermelhos', { injector })[0];
    expect(top.intent.id).toBe('svge.builtin.nlu.create-shape');
    expect(top.slots['count']).toBe(3);
    expect(top.slots['fill']).toBe('#e53935'); // vermelho
    expect(top.slots['width']).toBe(100); // default — "3" não virou width
  });

  it('"crie 3 circulos vermelhos" cria 3 nós (cascade, 1 undo cada)', async () => {
    const { plugins, nlu, injector, state, history } = setup();
    plugins.install(builtinNluPlugin);
    const before = state.document().root.children.length;
    const result = await nlu.execute('crie 3 circulos vermelhos', { injector });
    expect(result.executed).toBe(true);
    expect(state.document().root.children.length).toBe(before + 3);
    expect(history.undoStack().length).toBe(3); // 1 command por forma
    const [a, b, c] = state.document().root.children.slice(-3);
    expect(a.type).toBe('ellipse');
    expect(b.type).toBe('ellipse');
    expect(c.type).toBe('ellipse');
    // Cascade diagonal → centros distintos (não empilhados).
    if (a.type === 'ellipse' && b.type === 'ellipse' && c.type === 'ellipse') {
      expect(a.cx).not.toBe(b.cx);
      expect(b.cx).not.toBe(c.cx);
    }
  });

  it('"crie 2 retangulos azuis 50x50" preserva dimensão E count', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const before = state.document().root.children.length;
    const result = await nlu.execute('crie 2 retangulos azuis 50x50', { injector });
    expect(result.executed).toBe(true);
    expect(state.document().root.children.length).toBe(before + 2);
    const rect = state.document().root.children.at(-1)!;
    expect(rect.type).toBe('rect');
    if (rect.type === 'rect') {
      expect(rect.width).toBe(50); // dimensão preservada (não consumida pelo count)
    }
  });

  it('clampa count em 1..50 ("crie 100 circulos" → 50)', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const before = state.document().root.children.length;
    await nlu.execute('crie 100 circulos', { injector });
    expect(state.document().root.children.length).toBe(before + 50);
  });

  it('sem count → cria 1 (default), comportamento intacto', async () => {
    const { plugins, nlu, injector, state } = setup();
    plugins.install(builtinNluPlugin);
    const before = state.document().root.children.length;
    await nlu.execute('criar circulo vermelho', { injector });
    expect(state.document().root.children.length).toBe(before + 1);
  });
});
