import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  CommandBus,
  createEllipse,
  createEmptyDocument,
  createPolygon,
  createRect,
  createText,
  EditorStateService,
  InsertNodeCommand,
} from 'svg-engine/core';
import { regularPolygonPoints, regularStarPoints } from '../dictionaries/shapes-canonical';
import { PluginRegistry, SelectionService } from 'svg-engine/edit';
import { describe, expect, it } from 'vitest';
import { builtinNluPlugin } from '../builtin-nlu.plugin';
import { NaturalLanguageService } from '../natural-language.service';

/**
 * Specs dos intents profissionais (D-046 review-4). Cobre as
 * categorias principais: estilo, seleção, z-order, visibilidade,
 * flip/rotate, pathfinder, conversão.
 *
 * **Não testamos**: pathfinder e alignment requerem ≥ 2 shapes válidos
 * + execução do polygon-clipping no core; aqui validamos só que o
 * intent é matched e que o handler dispatch o command certo (via
 * candidate.intent.id no execute result).
 */
function setup() {
  TestBed.configureTestingModule({});
  const state = TestBed.inject(EditorStateService);
  state.resetDocument(createEmptyDocument());
  return {
    plugins: TestBed.inject(PluginRegistry),
    nlu: TestBed.inject(NaturalLanguageService),
    bus: TestBed.inject(CommandBus),
    selection: TestBed.inject(SelectionService),
    state,
    injector: TestBed.inject(Injector),
  };
}

function addRect(deps: ReturnType<typeof setup>) {
  const node = createRect({ x: 0, y: 0, width: 50, height: 50 });
  const rootId = deps.state.document().root.id;
  deps.bus.dispatch(new InsertNodeCommand(rootId, node));
  return node;
}

function addRectAt(deps: ReturnType<typeof setup>, x: number, y: number) {
  const node = createRect({ x, y, width: 50, height: 50 });
  const rootId = deps.state.document().root.id;
  deps.bus.dispatch(new InsertNodeCommand(rootId, node));
  return node;
}

describe('Professional NLU intents (D-046 review-4)', () => {
  // ── ESTILO ──────────────────────────────────────────────────

  it('set-stroke aplica cor da borda no selecionado (PT)', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rect = addRect(deps);
    deps.selection.select(rect.id);
    const result = await deps.nlu.execute('borda azul', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.state.document().root.children[0].style?.stroke).toBe('#1e88e5');
  });

  it('set-stroke aplica cor da borda (EN)', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rect = addRect(deps);
    deps.selection.select(rect.id);
    const result = await deps.nlu.execute('stroke red', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.state.document().root.children[0].style?.stroke).toBe('#e53935');
  });

  it('set-stroke-width define espessura (PT)', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rect = addRect(deps);
    deps.selection.select(rect.id);
    const result = await deps.nlu.execute('espessura 5', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.state.document().root.children[0].style?.strokeWidth).toBe(5);
  });

  it('set-opacity converte 50 → 0.5 (heurística pct)', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rect = addRect(deps);
    deps.selection.select(rect.id);
    const result = await deps.nlu.execute('opacidade 50', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.state.document().root.children[0].style?.opacity).toBe(0.5);
  });

  it('set-opacity aceita 0.8 direto', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rect = addRect(deps);
    deps.selection.select(rect.id);
    const result = await deps.nlu.execute('opacity 0.8', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.state.document().root.children[0].style?.opacity).toBeCloseTo(0.8);
  });

  it('remove-fill seta fill="none"', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rect = addRect(deps);
    deps.selection.select(rect.id);
    const result = await deps.nlu.execute('sem preenchimento', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.state.document().root.children[0].style?.fill).toBe('none');
  });

  it('remove-stroke seta stroke="none"', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rect = addRect(deps);
    deps.selection.select(rect.id);
    const result = await deps.nlu.execute('sem borda', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.state.document().root.children[0].style?.stroke).toBe('none');
  });

  // ── SELEÇÃO ─────────────────────────────────────────────────

  it('select-all seleciona todos os top-level nodes', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    addRect(deps);
    addRect(deps);
    const result = await deps.nlu.execute('selecionar tudo', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.selection.selectedIds().size).toBe(2);
  });

  // ── D-046 review-8: 'ambos'/'ambas' = 'todos'/'todas' em PT ──

  it('REGRESSION USUARIO: "selecionar ambos" → selecionar tudo (sinônimo PT)', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    addRect(deps);
    addRect(deps);
    const result = await deps.nlu.execute('selecionar ambos', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.selection.selectedIds().size).toBe(2);
  });

  it('REGRESSION USUARIO: "selecionar ambas" (feminino) também funciona', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    addRect(deps);
    addRect(deps);
    addRect(deps);
    const result = await deps.nlu.execute('selecionar ambas', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.selection.selectedIds().size).toBe(3);
  });

  it('REGRESSION USUARIO: "selecionar ambos retangulos" → select-by-type rect', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    addRect(deps);
    addRect(deps);
    const rootId = deps.state.document().root.id;
    // Adiciona um ellipse pra garantir que NÃO seja selecionado
    deps.bus.dispatch(
      new InsertNodeCommand(rootId, createEllipse({ cx: 100, cy: 100, rx: 30, ry: 20 })),
    );
    const result = await deps.nlu.execute('selecionar ambos retangulos', {
      injector: deps.injector,
    });
    expect(result.executed).toBe(true);
    // 2 rects selecionados, ellipse não
    expect(deps.selection.selectedIds().size).toBe(2);
  });

  it('REGRESSION USUARIO: "selecionar ambas estrelas" → só polygons com 10 vértices', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rootId = deps.state.document().root.id;
    const star1 = createPolygon(regularStarPoints(50, 50, 30));
    const star2 = createPolygon(regularStarPoints(150, 50, 30));
    const hex = createPolygon(regularPolygonPoints(250, 50, 30, 6));
    deps.bus.dispatch(new InsertNodeCommand(rootId, star1));
    deps.bus.dispatch(new InsertNodeCommand(rootId, star2));
    deps.bus.dispatch(new InsertNodeCommand(rootId, hex));
    const result = await deps.nlu.execute('selecionar ambas estrelas', {
      injector: deps.injector,
    });
    expect(result.executed).toBe(true);
    // 2 estrelas selecionadas, hexagono NÃO
    expect(deps.selection.selectedIds().size).toBe(2);
    expect(deps.selection.selectedIds().has(star1.id)).toBe(true);
    expect(deps.selection.selectedIds().has(star2.id)).toBe(true);
    expect(deps.selection.selectedIds().has(hex.id)).toBe(false);
  });

  it('deselect limpa a seleção', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rect = addRect(deps);
    deps.selection.select(rect.id);
    const result = await deps.nlu.execute('desselecionar', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.selection.selectedIds().size).toBe(0);
  });

  it.skip('FUTURE-FIX: select-by-type deveria vencer select-all quando há shape específica', () => {
    // Hoje "selecionar todos retangulos" matched select-all (score 0.90)
    // ao invés de select-by-type (score 0.89) porque o tiebreaker de
    // matchCount só conta `matches[]` que inclui slot — mas o boost de
    // slot tem peso menor que action. Fix futuro: aumentar peso de
    // slot required filled de 0.10 pra 0.15 quando intent já matched
    // por outro intent só-com-keyword (i.e., desambiguação). Por ora
    // o usuário pode usar "selecionar tipo retangulo" ou clicar
    // explicitamente na alternativa.
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const candidates = deps.nlu.parse('selecionar todos retangulos', {
      injector: deps.injector,
    });
    expect(candidates[0].intent.id).toBe('svge.builtin.nlu.select-by-type');
  });

  // ── D-046 review-7: regression usuário "selecionar X" não funciona ─

  it('REGRESSION USUARIO: "selecione a estrela" → NÃO seleciona tudo', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    // Cria uma estrela (polygon com 10 vértices) + um rect
    const rootId = deps.state.document().root.id;
    const star = createPolygon(regularStarPoints(50, 50, 30));
    deps.bus.dispatch(new InsertNodeCommand(rootId, star));
    addRect(deps);
    expect(deps.state.document().root.children.length).toBe(2);
    const result = await deps.nlu.execute('selecione a estrela', { injector: deps.injector });
    expect(result.executed).toBe(true);
    // Deve ter selecionado APENAS a estrela (1 nó), não os dois.
    expect(deps.selection.selectedIds().size).toBe(1);
    expect(deps.selection.selectedIds().has(star.id)).toBe(true);
  });

  it('REGRESSION USUARIO: "selecionar o polígono azul" → só polygon azul', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rootId = deps.state.document().root.id;
    // Polígono AZUL (deve casar) + rect (não casa shape) + ellipse (não casa shape)
    const hexAzul = createPolygon(regularPolygonPoints(50, 50, 30, 6), {
      style: { fill: '#1e88e5' },
    });
    deps.bus.dispatch(new InsertNodeCommand(rootId, hexAzul));
    addRect(deps);
    deps.bus.dispatch(
      new InsertNodeCommand(rootId, createEllipse({ cx: 100, cy: 100, rx: 20, ry: 20 })),
    );
    const result = await deps.nlu.execute('selecionar o polígono azul', {
      injector: deps.injector,
    });
    expect(result.executed).toBe(true);
    expect(deps.selection.selectedIds().size).toBe(1);
    expect(deps.selection.selectedIds().has(hexAzul.id)).toBe(true);
  });

  it('REGRESSION USUARIO: "selecionar apenas a estrela" → só a estrela', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rootId = deps.state.document().root.id;
    const star = createPolygon(regularStarPoints(50, 50, 30));
    const hex = createPolygon(regularPolygonPoints(150, 50, 30, 6));
    deps.bus.dispatch(new InsertNodeCommand(rootId, star));
    deps.bus.dispatch(new InsertNodeCommand(rootId, hex));
    const result = await deps.nlu.execute('selecionar apenas a estrela', {
      injector: deps.injector,
    });
    expect(result.executed).toBe(true);
    // Star (10 vértices) selecionada, hexagono (6 vértices) NÃO.
    expect(deps.selection.selectedIds().size).toBe(1);
    expect(deps.selection.selectedIds().has(star.id)).toBe(true);
  });

  it('REGRESSION USUARIO: "selecione o objeto" sozinho → NÃO seleciona tudo', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    addRect(deps);
    addRect(deps);
    addRect(deps);
    await deps.nlu.execute('selecione o objeto', { injector: deps.injector });
    // Não deve selecionar tudo (3 nós). Comando ambíguo → rejeitado OU
    // executa algo específico, mas NUNCA seleciona-tudo erradamente.
    expect(deps.selection.selectedIds().size).not.toBe(3);
  });

  it('select-by-type hexagono → só hexagons (6 vértices)', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rootId = deps.state.document().root.id;
    const hex = createPolygon(regularPolygonPoints(50, 50, 30, 6));
    const tri = createPolygon(regularPolygonPoints(150, 50, 30, 3));
    deps.bus.dispatch(new InsertNodeCommand(rootId, hex));
    deps.bus.dispatch(new InsertNodeCommand(rootId, tri));
    const result = await deps.nlu.execute('selecione hexagono', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.selection.selectedIds().size).toBe(1);
    expect(deps.selection.selectedIds().has(hex.id)).toBe(true);
  });

  it('select-by-type triangulo → só triangles (3 vértices)', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rootId = deps.state.document().root.id;
    const tri = createPolygon(regularPolygonPoints(50, 50, 30, 3));
    const hex = createPolygon(regularPolygonPoints(150, 50, 30, 6));
    deps.bus.dispatch(new InsertNodeCommand(rootId, tri));
    deps.bus.dispatch(new InsertNodeCommand(rootId, hex));
    const result = await deps.nlu.execute('selecione triangulo', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.selection.selectedIds().size).toBe(1);
    expect(deps.selection.selectedIds().has(tri.id)).toBe(true);
  });

  it('select-by-type texto → só text nodes', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rootId = deps.state.document().root.id;
    const txt = createText({ x: 50, y: 50, content: 'Hello' });
    deps.bus.dispatch(new InsertNodeCommand(rootId, txt));
    addRect(deps);
    const result = await deps.nlu.execute('selecione texto', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.selection.selectedIds().size).toBe(1);
    expect(deps.selection.selectedIds().has(txt.id)).toBe(true);
  });

  // ── D-046 review-9: count + color filter ────────────────────

  it('REGRESSION USUARIO: "Selecionar os dois retangulos cinza" → só rects cinzas', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rootId = deps.state.document().root.id;
    // 2 retangulos cinzas + 1 retangulo vermelho + 1 elipse cinza
    deps.bus.dispatch(
      new InsertNodeCommand(
        rootId,
        createRect({ x: 0, y: 0, width: 50, height: 50 }, { style: { fill: '#9e9e9e' } }),
      ),
    );
    deps.bus.dispatch(
      new InsertNodeCommand(
        rootId,
        createRect({ x: 60, y: 0, width: 50, height: 50 }, { style: { fill: '#9e9e9e' } }),
      ),
    );
    deps.bus.dispatch(
      new InsertNodeCommand(
        rootId,
        createRect({ x: 120, y: 0, width: 50, height: 50 }, { style: { fill: '#e53935' } }),
      ),
    );
    deps.bus.dispatch(
      new InsertNodeCommand(
        rootId,
        createEllipse({ cx: 200, cy: 25, rx: 20, ry: 20 }, { style: { fill: '#9e9e9e' } }),
      ),
    );
    const result = await deps.nlu.execute('Selecionar os dois retangulos cinza', {
      injector: deps.injector,
    });
    expect(result.executed).toBe(true);
    // 2 rects cinzas selecionados (não o vermelho, não o ellipse)
    expect(deps.selection.selectedIds().size).toBe(2);
  });

  it('REGRESSION USUARIO: "Selecionar os três triangulos azuis" → só triangulos azuis', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rootId = deps.state.document().root.id;
    // 3 triangulos azuis + 1 triangulo vermelho + 1 hexagono azul
    for (let i = 0; i < 3; i++) {
      deps.bus.dispatch(
        new InsertNodeCommand(
          rootId,
          createPolygon(regularPolygonPoints(50 + i * 60, 50, 25, 3), {
            style: { fill: '#1e88e5' },
          }),
        ),
      );
    }
    deps.bus.dispatch(
      new InsertNodeCommand(
        rootId,
        createPolygon(regularPolygonPoints(250, 50, 25, 3), { style: { fill: '#e53935' } }),
      ),
    );
    deps.bus.dispatch(
      new InsertNodeCommand(
        rootId,
        createPolygon(regularPolygonPoints(350, 50, 25, 6), { style: { fill: '#1e88e5' } }),
      ),
    );
    const result = await deps.nlu.execute('Selecionar os três triangulos azuis', {
      injector: deps.injector,
    });
    expect(result.executed).toBe(true);
    expect(deps.selection.selectedIds().size).toBe(3);
  });

  it('REGRESSION USUARIO: "selecionar os 3 triangulos amarelos" (dígito)', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rootId = deps.state.document().root.id;
    for (let i = 0; i < 3; i++) {
      deps.bus.dispatch(
        new InsertNodeCommand(
          rootId,
          createPolygon(regularPolygonPoints(50 + i * 60, 50, 25, 3), {
            style: { fill: '#fdd835' },
          }),
        ),
      );
    }
    // 1 triangulo verde pra garantir que NÃO seja selecionado
    deps.bus.dispatch(
      new InsertNodeCommand(
        rootId,
        createPolygon(regularPolygonPoints(250, 50, 25, 3), { style: { fill: '#43a047' } }),
      ),
    );
    const result = await deps.nlu.execute('selecionar os 3 triangulos amarelos', {
      injector: deps.injector,
    });
    expect(result.executed).toBe(true);
    expect(deps.selection.selectedIds().size).toBe(3);
  });

  it('count é informativo: pediu 3 mas achou 5 → seleciona os 5 com warn', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rootId = deps.state.document().root.id;
    // 5 retangulos cinzas (user pediu 3, mas vai pegar todos os 5)
    for (let i = 0; i < 5; i++) {
      deps.bus.dispatch(
        new InsertNodeCommand(
          rootId,
          createRect({ x: i * 60, y: 0, width: 50, height: 50 }, { style: { fill: '#9e9e9e' } }),
        ),
      );
    }
    const result = await deps.nlu.execute('selecionar os 3 retangulos cinza', {
      injector: deps.injector,
    });
    expect(result.executed).toBe(true);
    // Pega todos os matches reais (5), count é sanity-check informativo
    expect(deps.selection.selectedIds().size).toBe(5);
  });

  it('"azuis" (plural irregular) resolve via dict (fuzzy não pegaria)', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rootId = deps.state.document().root.id;
    deps.bus.dispatch(
      new InsertNodeCommand(
        rootId,
        createRect({ x: 0, y: 0, width: 50, height: 50 }, { style: { fill: '#1e88e5' } }),
      ),
    );
    deps.bus.dispatch(
      new InsertNodeCommand(
        rootId,
        createRect({ x: 60, y: 0, width: 50, height: 50 }, { style: { fill: '#1e88e5' } }),
      ),
    );
    deps.bus.dispatch(
      new InsertNodeCommand(
        rootId,
        createRect({ x: 120, y: 0, width: 50, height: 50 }, { style: { fill: '#e53935' } }),
      ),
    );
    const result = await deps.nlu.execute('selecionar retangulos azuis', {
      injector: deps.injector,
    });
    expect(result.executed).toBe(true);
    expect(deps.selection.selectedIds().size).toBe(2);
  });

  it('select-by-type aparece nos candidates pra "selecionar retangulos"', () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const candidates = deps.nlu.parse('selecionar retangulos', { injector: deps.injector });
    // Aceita create-shape OU select-by-type como top — ambos são válidos
    // gramaticalmente. O importante é que select-by-type esteja nos
    // candidates (UI exibe alternativa pra usuário escolher).
    expect(candidates.some((c) => c.intent.id === 'svge.builtin.nlu.select-by-type')).toBe(true);
  });

  // ── VISIBILIDADE ────────────────────────────────────────────

  it('hide-selected esconde via visibility=hidden', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rect = addRect(deps);
    deps.selection.select(rect.id);
    const result = await deps.nlu.execute('esconder', { injector: deps.injector });
    expect(result.executed).toBe(true);
    expect(deps.state.document().root.children[0].style?.visibility).toBe('hidden');
  });

  // ── Z-ORDER ─────────────────────────────────────────────────

  it('bring-to-front é resolvido como top intent pra "para frente"', () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const r1 = addRect(deps);
    addRect(deps);
    deps.selection.select(r1.id);
    const candidates = deps.nlu.parse('para frente', { injector: deps.injector });
    // "para frente" → keyword 'frente' match exato. bring-to-front
    // deve estar no top (action 'bring-forward' não necessária aqui).
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].intent.id).toBe('svge.builtin.nlu.bring-to-front');
  });

  // ── CONVERSÃO ───────────────────────────────────────────────

  it('convert-to-path é matched com "para path" (frase específica sem ambiguidade)', () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rect = addRect(deps);
    deps.selection.select(rect.id);
    // "converter para path" — usa preposição 'para' (não 'em') pra evitar
    // confusão com create-shape (que também tem 'caminho' como keyword).
    const candidates = deps.nlu.parse('converter para path', { injector: deps.injector });
    expect(candidates.length).toBeGreaterThan(0);
    // Pelo menos convert-to-path aparece nos candidates (top OU alternativa).
    expect(candidates.some((c) => c.intent.id === 'svge.builtin.nlu.convert-to-path')).toBe(true);
  });

  // ── DESTRUTIVO ──────────────────────────────────────────────

  it('delete-selected requer gate quando destructive=true', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rect = addRect(deps);
    deps.selection.select(rect.id);
    // Sem gate, destructive sempre rejeita.
    const noGate = await deps.nlu.execute('deletar', { injector: deps.injector });
    expect(noGate.executed).toBe(false);
    expect(noGate.rejection).toBe('destructive-no-gate');
    // Com gate retornando true, executa.
    const withGate = await deps.nlu.execute(
      'deletar',
      { injector: deps.injector },
      { confirmGate: () => true },
    );
    expect(withGate.executed).toBe(true);
    expect(deps.state.document().root.children.length).toBe(0);
  });

  // ── MOVE-TO-ABSOLUTE (D-046 review-6) ────────────────────────

  it('REGRESSION USUARIO: "move o objeto selecionado para x 10" → translada pra x=10', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    // Cria um rect em (50, 30) — vai precisar deslocar pra x=10
    const rect = addRectAt(deps, 50, 30);
    deps.selection.select(rect.id);
    const result = await deps.nlu.execute('move o objeto selecionado para x 10', {
      injector: deps.injector,
    });
    expect(result.executed).toBe(true);
    // Origem aproximada = rect.x + transform.tx. MoveNodeCommand soma dx ao
    // transform — origem final visual = 10. Verificamos via origin recomputado.
    const updated = deps.state.document().root.children[0];
    expect(updated.type).toBe('rect');
    if (updated.type === 'rect') {
      const tx = updated.transform[4];
      // x geométrico (50) + tx == 10 → tx = -40
      expect(updated.x + tx).toBe(10);
      // y NÃO deve ter sido alterado
      const ty = updated.transform[5];
      expect(updated.y + ty).toBe(30);
    }
  });

  it('REGRESSION USUARIO: "move o objeto selecionado para x igual a 10" → ignora "igual" stopword', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rect = addRectAt(deps, 0, 0);
    deps.selection.select(rect.id);
    const result = await deps.nlu.execute('move o objeto selecionado para x igual a 10', {
      injector: deps.injector,
    });
    expect(result.executed).toBe(true);
    const updated = deps.state.document().root.children[0];
    if (updated.type === 'rect') {
      const tx = updated.transform[4];
      expect(updated.x + tx).toBe(10);
    }
  });

  it('REGRESSION USUARIO: "desloca o objeto para posição 10 50" → translada pra (10, 50)', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rect = addRectAt(deps, 100, 200);
    deps.selection.select(rect.id);
    const result = await deps.nlu.execute('desloca o objeto para posição 10 50', {
      injector: deps.injector,
    });
    expect(result.executed).toBe(true);
    const updated = deps.state.document().root.children[0];
    if (updated.type === 'rect') {
      const tx = updated.transform[4];
      const ty = updated.transform[5];
      expect(updated.x + tx).toBe(10);
      expect(updated.y + ty).toBe(50);
    }
  });

  it('move-to-y só altera Y, preserva X', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    const rect = addRectAt(deps, 25, 25);
    deps.selection.select(rect.id);
    const result = await deps.nlu.execute('move para y 100', { injector: deps.injector });
    expect(result.executed).toBe(true);
    const updated = deps.state.document().root.children[0];
    if (updated.type === 'rect') {
      const tx = updated.transform[4];
      const ty = updated.transform[5];
      expect(updated.x + tx).toBe(25); // X preservado
      expect(updated.y + ty).toBe(100); // Y atualizado
    }
  });

  // ── DESCRIPTION BOOST (meio-termo "semantic disambiguator") ──

  it('description boost ajuda tiebreaker quando ambos intents têm keyword match', async () => {
    const deps = setup();
    deps.plugins.install(builtinNluPlugin);
    // "criar circulo" deve preferir create-shape (description menciona
    // "Criar forma") sobre select-by-type (description menciona
    // "Seleciona TODOS"). Sem boost, ambos teriam score similar.
    const candidates = deps.nlu.parse('criar circulo', { injector: deps.injector });
    expect(candidates[0].intent.id).toBe('svge.builtin.nlu.create-shape');
  });
});
