import {
  CommandBus,
  createEllipse,
  createRect,
  DuplicateNodeCommand,
  EditorStateService,
  InsertNodeCommand,
  MoveNodeCommand,
  ResizeNodeCommand,
  SetStylePropertyOnManyCommand,
  type NodeId,
} from 'svg-engine/core';
import { type EditorPlugin, MenuContributionRegistry, PLUGIN_API_VERSION } from 'svg-engine/edit';
import { SelectionService } from 'svg-engine/edit';
import { discoverMenuIntents } from './menu-intent-discovery';
import { NaturalLanguageService } from './natural-language.service';

/**
 * **`builtinNluPlugin`** — D-046 Fase 1 (rule-based NLU bootstrap).
 *
 * Plugin opt-in que popula o {@link NaturalLanguageService} com:
 *
 * 1. **Auto-discovery** dos {@link MenuContributionRegistry} contributions
 *    — todo menu item / toolbar item / context item já registrado vira
 *    intent NLU (label tokenizado vira keywords, expandidas
 *    multilíngue via ACTION_DICTIONARY → "duplicar" PT casa com label
 *    "Duplicate" EN).
 * 2. **Intents customizados** que extraem slots:
 *    - `create-shape` — usa slot `kind: 'shape'` que resolve "círculo"
 *      → 'circle', "bola" → 'circle', "retângulo" → 'rect' etc. via
 *      SHAPE_DICTIONARY automaticamente.
 *    - `set-fill` — stub honesto (aguarda SetStyleCommand no core)
 *    - **`move-selected`** — desloca os nós selecionados por `dx, dy`
 *      via `MoveNodeCommand`.
 *    - **`resize-selected`** — escala os nós por fator `sx, sy` via
 *      `ResizeNodeCommand` (anchor = top-left do bbox conhecido).
 *    - **`duplicate-selected`** — duplica via `DuplicateNodeCommand`.
 *
 * **Opt-in** (mesmo padrão de `builtinMenuContributionsPlugin` D-043):
 * consumers explicitamente provisionam via
 * `provideSvgEnginePlugin(builtinNluPlugin)`. Apps headless puro
 * (Modo 1 D-037) NÃO precisam instalar — sem ele, o
 * `NaturalLanguageService` existe mas começa sem intents.
 *
 * **Ordem de install**: se o consumer também instala
 * `builtinMenuContributionsPlugin`, **instale-o ANTES** deste para que
 * o auto-discovery encontre as contribuições. Plugin system dispara
 * em ordem de `provideSvgEnginePlugin()`.
 *
 * **Multi-editor (D-042/D-043)**: o `execute()` dos intents respeita
 * o `ctx.injector` recebido pelo `NaturalLanguageService.execute()` —
 * `CommandBus`, `EditorStateService`, `SelectionService` resolvidos
 * do scope ativo.
 *
 * **Limitação importante de move-selected / resize-selected**:
 * comandos absolutos ("mover PARA 10, 10" / "redimensionar PARA 200x200")
 * requerem o bbox renderizado do nó (SVG DOM ref) que está fora do
 * escopo headless (D-017). Por isso aqui interpretamos números como:
 * - move: **deslocamento relativo** (dx, dy do estado atual)
 * - resize: **fator de escala** (sx, sy multiplicam o tamanho atual)
 *
 * Plugin do shell que tenha acesso ao SVG ref pode registrar intents
 * `move-to` / `resize-to` absolutos via `nlu.registerIntent`.
 */
export const builtinNluPlugin: EditorPlugin = {
  id: 'svge.builtin.nlu',
  name: 'Built-in NLU (rule-based, Fase 1)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const nlu = ctx.injector.get(NaturalLanguageService);
    const menus = ctx.injector.get(MenuContributionRegistry);

    // ── 1) Auto-discovery dos menu items existentes ──────────────
    const discovered = discoverMenuIntents(menus, nlu);
    ctx.track(discovered.composedDispose);

    // ── 2) Intents customizados ──────────────────────────────────

    // create-shape: "criar retângulo vermelho 100x50",
    //               "add a blue circle",
    //               "desenhar elipse verde",
    //               "criar bola azul marinho"
    ctx.track(
      nlu.registerIntent({
        id: 'svge.builtin.nlu.create-shape',
        // Keywords primárias: nomes de forma em PT+EN + semantic aliases.
        // Mesma lista do SHAPE_DICTIONARY relevante pra create.
        keywords: [
          // PT shapes
          'retangulo',
          'quadrado',
          'caixa',
          'bloco',
          'painel',
          'card',
          'frame',
          'moldura',
          'elipse',
          'oval',
          'circulo',
          'bola',
          'esfera',
          'ponto',
          'no',
          'linha',
          'risco',
          'segmento',
          'eixo',
          'caminho',
          'curva',
          'trajeto',
          'triangulo',
          'estrela',
          'poligono',
          'hexagono',
          'pentagono',
          'losango',
          'diamante',
          // EN shapes
          'rectangle',
          'rect',
          'square',
          'box',
          'block',
          'panel',
          'ellipse',
          'circle',
          'round',
          'node',
          'line',
          'segment',
          'path',
          'curve',
          'triangle',
          'star',
          'polygon',
          'hexagon',
          'pentagon',
          'diamond',
        ],
        actionKeywords: ['create', 'add', 'draw', 'insert', 'new'],
        slots: {
          // **Slot kind 'shape'** (D-046 review-2 fix): resolve via
          // SHAPE_DICTIONARY direto — "círculo" / "circle" / "bola" /
          // "nó" todos viram 'circle'. Antes era `kind: 'enum'` que
          // exigia match contra valores canônicos só.
          shape: { kind: 'shape', optional: true, default: 'rect' },
          fill: { kind: 'color', optional: true },
          width: { kind: 'number', optional: true, default: 100 },
          height: { kind: 'number', optional: true, default: 100 },
        },
        description: 'Criar forma (retângulo, círculo, elipse, etc.) no centro do canvas',
        execute(slots, runCtx) {
          const bus = runCtx.injector.get(CommandBus);
          const state = runCtx.injector.get(EditorStateService);

          // shape agora vem JÁ RESOLVIDO pelo extractor (NluShapeKind).
          // Sem fallback hardcoded — o slot kind 'shape' garante.
          const shape = (slots['shape'] as string | undefined) ?? 'rect';
          const w = (slots['width'] as number | undefined) ?? 100;
          const h = (slots['height'] as number | undefined) ?? 100;
          const fill = slots['fill'] as string | undefined;
          const style = fill !== undefined ? { fill } : undefined;

          const doc = state.document();
          const rootId = doc.root.id;
          const vb = doc.viewBox;
          const cx = vb.x + vb.width / 2;
          const cy = vb.y + vb.height / 2;

          switch (shape) {
            case 'rect': {
              const node = createRect(
                { x: cx - w / 2, y: cy - h / 2, width: w, height: h },
                style ? { style } : {},
              );
              bus.dispatch(new InsertNodeCommand(rootId, node));
              break;
            }
            case 'ellipse': {
              const node = createEllipse({ cx, cy, rx: w / 2, ry: h / 2 }, style ? { style } : {});
              bus.dispatch(new InsertNodeCommand(rootId, node));
              break;
            }
            case 'circle': {
              const r = Math.min(w, h) / 2;
              const node = createEllipse({ cx, cy, rx: r, ry: r }, style ? { style } : {});
              bus.dispatch(new InsertNodeCommand(rootId, node));
              break;
            }
            // Shapes sem geometria built-in (anti-alucinação: precisam
            // de dados específicos que NLU não infere — line: pontos;
            // polygon: vertices; text: conteúdo; image: URL).
            case 'line':
            case 'polygon':
            case 'polyline':
            case 'text':
            case 'image':
            case 'group':
            case 'svg':
            case 'path':
            default: {
              if (typeof console !== 'undefined') {
                console.warn(
                  '[svge.nlu] create-shape: kind',
                  shape,
                  'reconhecido mas builtin handler não tem geometria/comando especializado. ' +
                    'Registre intent customizado (e.g., create-text com slot `content`) ou ' +
                    'aguarde icon library / composite commands.',
                );
              }
              break;
            }
          }
        },
      }),
    );

    // set-fill: "pinta de vermelho", "cor azul", "fill #ff0000",
    //           "preenchimento rgb(255,128,0)", "cor success"
    //
    // Aplica a cor a TODOS os nós selecionados num único undo step via
    // `SetStylePropertyOnManyCommand` (commit atômico — Ctrl+Z reverte
    // a operação inteira). Quando nada selecionado, warn no console e
    // retorna sem efeito.
    ctx.track(
      nlu.registerIntent({
        id: 'svge.builtin.nlu.set-fill',
        keywords: ['cor', 'pintar', 'pinta', 'preenchimento', 'fill', 'color', 'paint'],
        slots: { color: { kind: 'color', optional: false } },
        description: 'Aplica a cor de preenchimento aos nós selecionados',
        execute(slots, runCtx) {
          const fill = slots['color'] as string | undefined;
          if (fill === undefined) return;
          const bus = runCtx.injector.get(CommandBus);
          const selection = runCtx.injector.get(SelectionService);
          const ids = [...selection.selectedIds()] as readonly NodeId[];
          if (ids.length === 0) {
            if (typeof console !== 'undefined') {
              console.warn('[svge.nlu] set-fill: nada selecionado');
            }
            return;
          }
          // `key: 'fill'` + `value: <hex|css>` — múltiplos nós, single
          // undo. Mesmo padrão do inspector multi-select.
          bus.dispatch(new SetStylePropertyOnManyCommand(ids, 'fill', fill));
        },
      }),
    );

    // ── move-selected: "mover 10 20", "mover por 10 10",
    //                   "deslocar selecionado 50 0"
    ctx.track(
      nlu.registerIntent({
        id: 'svge.builtin.nlu.move-selected',
        keywords: [
          'mover',
          'mova',
          'move',
          'arrastar',
          'arraste',
          'drag',
          'deslocar',
          'desloque',
          'shift',
          'posicionar',
          'posicione',
          'position',
        ],
        // dx + dy obrigatórios. Pre-pass do extractor preenche
        // width/height via dimensão `100x50`; usamos os MESMOS nomes
        // pra aproveitar isso quando o usuário diz "mover 100x50".
        slots: {
          width: { kind: 'number', optional: false },
          height: { kind: 'number', optional: false },
        },
        description: 'Move (desloca relativo) os nós selecionados por dx, dy',
        execute(slots, runCtx) {
          const bus = runCtx.injector.get(CommandBus);
          const selection = runCtx.injector.get(SelectionService);
          const ids = [...selection.selectedIds()];
          if (ids.length === 0) {
            if (typeof console !== 'undefined') {
              console.warn('[svge.nlu] move-selected: nada selecionado');
            }
            return;
          }
          const dx = (slots['width'] as number | undefined) ?? 0;
          const dy = (slots['height'] as number | undefined) ?? 0;
          for (const id of ids) {
            bus.dispatch(new MoveNodeCommand(id, dx, dy));
          }
        },
      }),
    );

    // ── resize-selected: "redimensionar 2", "escalar 200%",
    //                     "resize 1.5x", "escalar 200 por 200"
    ctx.track(
      nlu.registerIntent({
        id: 'svge.builtin.nlu.resize-selected',
        keywords: [
          'redimensionar',
          'redimensione',
          'escalar',
          'escale',
          'scale',
          'rescale',
          'resize',
          'dimensionar',
          'dimensione',
          'ajustar',
          'ajuste',
          'adjust',
        ],
        slots: {
          // Reaproveita width/height pra captar "200 por 200" e "200x200".
          width: { kind: 'number', optional: false },
          height: { kind: 'number', optional: false },
        },
        description: 'Escala os nós selecionados por sx, sy (200 = 2x; 100 = manter)',
        execute(slots, runCtx) {
          const bus = runCtx.injector.get(CommandBus);
          const state = runCtx.injector.get(EditorStateService);
          const selection = runCtx.injector.get(SelectionService);
          const ids = [...selection.selectedIds()];
          if (ids.length === 0) {
            if (typeof console !== 'undefined') {
              console.warn('[svge.nlu] resize-selected: nada selecionado');
            }
            return;
          }
          // Interpretação: número >= 10 é porcentagem (200 → 2.0); < 10
          // é fator direto (2 → 2x, 1.5 → 1.5x). Heurística simples
          // que cobre as duas convenções comuns no input natural.
          const rawW = (slots['width'] as number | undefined) ?? 1;
          const rawH = (slots['height'] as number | undefined) ?? 1;
          const sx = rawW >= 10 ? rawW / 100 : rawW;
          const sy = rawH >= 10 ? rawH / 100 : rawH;
          // Anchor 0,0 (origem document). Sem acesso ao bbox aqui, o
          // resize escala em torno do canto do viewBox. Plugins que
          // queiram resize centrado podem registrar intent próprio.
          const anchor = { x: state.document().viewBox.x, y: state.document().viewBox.y };
          for (const id of ids) {
            bus.dispatch(new ResizeNodeCommand(id, anchor, sx, sy));
          }
        },
      }),
    );

    // ── duplicate-selected: "duplicar", "duplique objeto selecionado",
    //                        "duplicate selected", "clonar isto"
    ctx.track(
      nlu.registerIntent({
        id: 'svge.builtin.nlu.duplicate-selected',
        keywords: ['duplicar', 'duplique', 'duplicate', 'clonar', 'clone'],
        description: 'Duplica os nós selecionados (offset padrão 10,10)',
        execute(_slots, runCtx) {
          const bus = runCtx.injector.get(CommandBus);
          const selection = runCtx.injector.get(SelectionService);
          const ids = [...selection.selectedIds()] as readonly NodeId[];
          if (ids.length === 0) {
            if (typeof console !== 'undefined') {
              console.warn('[svge.nlu] duplicate-selected: nada selecionado');
            }
            return;
          }
          bus.dispatch(new DuplicateNodeCommand(ids));
        },
      }),
    );
  },
};
