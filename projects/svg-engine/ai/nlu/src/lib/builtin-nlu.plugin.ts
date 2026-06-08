import {
  AUTO_PARENT,
  CommandBus,
  createEllipse,
  createLine,
  createPolygon,
  createPolyline,
  createRect,
  createText,
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
import { SHAPE_KEYS } from './dictionaries/shapes';
import {
  POLYGON_SIDES,
  regularPolygonPoints,
  regularStarPoints,
} from './dictionaries/shapes-canonical';
import { registerProfessionalIntents } from './intents/professional-intents';
import { discoverMenuIntentsReactive } from './menu-intent-discovery';
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
 *    - `set-fill` — dispatcha `SetStylePropertyOnManyCommand` com a
 *      cor resolvida do COLOR_DICTIONARY, aplicando em todos os nós
 *      selecionados num único undo step.
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

    // ── 1) Auto-discovery REATIVO (Audit #12) ────────────────────
    // Initial sync discovery (covers menus já registrados antes do
    // install — preserva o contrato observado pelo spec
    // "auto-discovers existing menu contributions when installed
    // AFTER them") + effect que atualiza a batch quando o registry
    // muda — plugins instalados DEPOIS do builtinNluPlugin agora
    // também viram intents automaticamente.
    const discovered = discoverMenuIntentsReactive(menus, nlu, ctx.injector);
    ctx.track(discovered.disposable);

    // ── 2) Intents customizados ──────────────────────────────────

    // create-shape: "criar retângulo vermelho 100x50",
    //               "add a blue circle",
    //               "desenhar elipse verde",
    //               "criar bola azul marinho"
    ctx.track(
      nlu.registerIntent({
        id: 'svge.builtin.nlu.create-shape',
        // **Keywords = todas as keys do SHAPE_DICTIONARY** (PT+EN
        // merged). Garante cobertura completa: qualquer shape mapeado
        // no dict é candidato pra create-shape automaticamente, sem
        // manter lista duplicada. Inclui octogono, texto, todas as
        // variantes regionais, semantic aliases (bola, conector, etc).
        keywords: SHAPE_KEYS,
        actionKeywords: ['create', 'add', 'draw', 'insert', 'new'],
        slots: {
          // **Slot kind 'shape'** (D-046 review-2 fix): resolve via
          // SHAPE_DICTIONARY direto — "círculo" / "circle" / "bola" /
          // "nó" todos viram 'circle'. Antes era `kind: 'enum'` que
          // exigia match contra valores canônicos só.
          shape: { kind: 'shape', optional: true, default: 'rect' },
          // `fill` SEM anchor → positional (primeira cor do input).
          // Cobre "criar retangulo vermelho" sem ruído.
          fill: { kind: 'color', optional: true },
          // `width` / `height` SEM anchor → consumidos pelo pre-pass
          // dimensão (100x50) ou positional (primeiros 2 numbers).
          width: { kind: 'number', optional: true, default: 100 },
          height: { kind: 'number', optional: true, default: 100 },
          // **`stroke`** — COM anchor ('borda'/'contorno'/'stroke'/
          // 'outline') pra que "fill vermelho borda azul" produza
          // {fill:vermelho, stroke:azul} sem que a segunda cor seja
          // ignorada pelo positional pass (que só pega a 1ª).
          stroke: {
            kind: 'color',
            optional: true,
            anchorKeywords: ['borda', 'contorno', 'stroke', 'outline'],
          },
          // **`strokeWidth`** — anchors ('espessura'/'thickness'/
          // 'tamanho'/'strokewidth') capturam o número adjacente.
          // **Caveat**: 'tamanho' é AMBÍGUO em PT (pode significar
          // dimensão geral). Se o usuário disser "criar retangulo
          // tamanho 100" sem mencionar borda, o strokeWidth virá 100
          // (rule-based best-effort). Recomenda-se "100x100" pra
          // dimensão e "espessura N" pra stroke.
          strokeWidth: {
            kind: 'number',
            optional: true,
            anchorKeywords: ['espessura', 'thickness', 'tamanho', 'strokewidth'],
          },
          // **`position`** — kind 'point' captura "100 50" ou "100x50"
          // adjacente ao anchor ('posicao'/'position'/'coordenada'/
          // 'coordinate'). Evita anchors stopword ('em', 'na', 'at')
          // que são filtrados pelo extractor.
          position: {
            kind: 'point',
            optional: true,
            anchorKeywords: ['posicao', 'position', 'coordenada', 'coordinate'],
          },
          // **`count`** — repetição: "crie 3 círculos vermelhos". Extraído
          // pelo pre-pass "número imediatamente antes de uma forma"
          // (`positional: false` p/ não colidir com dimensão). Default 1.
          count: { kind: 'number', optional: true, positional: false, default: 1 },
        },
        description:
          'Criar forma (retângulo, círculo, elipse, etc.) — suporta fill/stroke/espessura/posição',
        execute(slots, runCtx) {
          const bus = runCtx.injector.get(CommandBus);
          const state = runCtx.injector.get(EditorStateService);

          // shape agora vem JÁ RESOLVIDO pelo extractor (NluShapeKind).
          // Sem fallback hardcoded — o slot kind 'shape' garante.
          const shape = (slots['shape'] as string | undefined) ?? 'rect';
          const w = (slots['width'] as number | undefined) ?? 100;
          const h = (slots['height'] as number | undefined) ?? 100;
          const fill = slots['fill'] as string | undefined;
          const stroke = slots['stroke'] as string | undefined;
          const strokeWidth = slots['strokeWidth'] as number | undefined;
          const position = slots['position'] as { x: number; y: number } | undefined;

          // Compose style omitting undefined keys — manter `style:
          // undefined` quando nenhum apresentável (factory aplica
          // DEFAULT_STYLE). Se ANY estiver presente, builda parcial.
          let style: { fill?: string; stroke?: string; strokeWidth?: number } | undefined;
          if (fill !== undefined || stroke !== undefined || strokeWidth !== undefined) {
            style = {};
            if (fill !== undefined) style.fill = fill;
            if (stroke !== undefined) style.stroke = stroke;
            if (strokeWidth !== undefined) style.strokeWidth = strokeWidth;
          }

          const doc = state.document();
          // **PAGES-REFACTOR Fase 1**: NLU dispatched inserts now go
          // through AUTO_PARENT → CommandBus resolves to the active
          // page. `rootId` kept as the local label for readability;
          // we just pass AUTO_PARENT to InsertNodeCommand below.
          const _rootIdRetained = doc.root.id;
          void _rootIdRetained;
          const vb = doc.viewBox;
          // Center default = centro do viewBox; quando user passar
          // `position`, vira o centro explícito do shape.
          const baseCx = position ? position.x : vb.x + vb.width / 2;
          const baseCy = position ? position.y : vb.y + vb.height / 2;

          // **Repetição** — count vem do pre-pass "N <forma>" (clampado
          // 1..50). Cada iteração despacha seu PRÓPRIO command → **1 passo
          // de undo por forma**. Cascade diagonal evita empilhar.
          const count = Math.max(
            1,
            Math.min(50, Math.round((slots['count'] as number | undefined) ?? 1)),
          );
          const step = Math.max(w, h) * 0.5 + 20;
          for (let i = 0; i < count; i++) {
            const cx = baseCx + i * step;
            const cy = baseCy + i * step;

            // **Geometria por shape kind** — D-046 review-5: polygons
            // específicos (triangle/pentagon/hexagon/etc) e line/polyline/
            // text agora têm geometria REAL gerada (antes eram no-op com
            // console.warn).
            //
            // Convenções:
            // - rect: top-left em (cx-w/2, cy-h/2), tamanho w×h
            // - ellipse: centro em (cx, cy), raios w/2 × h/2
            // - circle: raio = min(w,h)/2 (mantém círculo verdadeiro)
            // - polígonos regulares: inscritos num círculo de raio min(w,h)/2
            // - line: horizontal de (cx-w/2, cy) a (cx+w/2, cy)
            // - polyline: zigzag de 3 pontos (V invertido)
            // - text: placeholder "Texto"/"Text" — fontSize = min(w,h)/3
            // - path/image/group/svg: SEM geometria (precisam de dados
            //   específicos: d-string, URL, children)
            switch (shape) {
              case 'rect': {
                const node = createRect(
                  { x: cx - w / 2, y: cy - h / 2, width: w, height: h },
                  style ? { style } : {},
                );
                bus.dispatch(new InsertNodeCommand(AUTO_PARENT, node));
                break;
              }
              case 'ellipse': {
                const node = createEllipse(
                  { cx, cy, rx: w / 2, ry: h / 2 },
                  style ? { style } : {},
                );
                bus.dispatch(new InsertNodeCommand(AUTO_PARENT, node));
                break;
              }
              case 'circle': {
                const r = Math.min(w, h) / 2;
                const node = createEllipse({ cx, cy, rx: r, ry: r }, style ? { style } : {});
                bus.dispatch(new InsertNodeCommand(AUTO_PARENT, node));
                break;
              }
              // Polígonos regulares — geometria computada a partir do kind.
              case 'triangle':
              case 'rhombus':
              case 'pentagon':
              case 'hexagon':
              case 'octagon':
              case 'polygon': {
                const sides = POLYGON_SIDES[shape] ?? 6;
                const r = Math.min(w, h) / 2;
                const points = regularPolygonPoints(cx, cy, r, sides);
                const node = createPolygon(points, style ? { style } : {});
                bus.dispatch(new InsertNodeCommand(AUTO_PARENT, node));
                break;
              }
              // Estrela — 5 pontas, raio interno = 40% do externo.
              case 'star': {
                const outerR = Math.min(w, h) / 2;
                const points = regularStarPoints(cx, cy, outerR);
                const node = createPolygon(points, style ? { style } : {});
                bus.dispatch(new InsertNodeCommand(AUTO_PARENT, node));
                break;
              }
              // Linha horizontal centrada.
              case 'line': {
                const node = createLine(
                  { x1: cx - w / 2, y1: cy, x2: cx + w / 2, y2: cy },
                  style ? { style } : {},
                );
                bus.dispatch(new InsertNodeCommand(AUTO_PARENT, node));
                break;
              }
              // Polyline zigzag (V invertido) com 3 pontos.
              case 'polyline': {
                const points = [
                  { x: cx - w / 2, y: cy + h / 4 },
                  { x: cx, y: cy - h / 4 },
                  { x: cx + w / 2, y: cy + h / 4 },
                ];
                const node = createPolyline(points, style ? { style } : {});
                bus.dispatch(new InsertNodeCommand(AUTO_PARENT, node));
                break;
              }
              // Text placeholder — "Texto" se input PT, "Text" se EN.
              // (sem acesso ao detectLanguage aqui — usa 'Texto' default).
              case 'text': {
                const fontSize = Math.max(12, Math.min(w, h) / 3);
                const node = createText(
                  {
                    x: cx,
                    y: cy + fontSize / 3, // alinhamento baseline visual aproximado
                    content: 'Texto',
                    fontSize,
                    textAnchor: 'middle',
                  },
                  style ? { style } : {},
                );
                bus.dispatch(new InsertNodeCommand(AUTO_PARENT, node));
                break;
              }
              // Sem geometria built-in: precisam de input adicional
              // (URL pra image, d-string pra path, children pra group).
              case 'path':
              case 'image':
              case 'group':
              case 'svg':
              default: {
                if (typeof console !== 'undefined') {
                  console.warn(
                    '[svge.nlu] create-shape: kind',
                    shape,
                    'requer dados específicos (URL/d-string/children) que NLU não infere. ' +
                      'Registre intent customizado (e.g., create-image com slot `url`).',
                  );
                }
                break;
              }
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

    // ── 3) Professional intents (D-046 review-4) ─────────────────
    // ~25 intents adicionais cobrindo: rotação, flip, stroke, opacidade,
    // visibilidade, z-order, pathfinder boolean ops, conversão e
    // seleção avançada. Idiomas: PT + EN nativamente em cada intent.
    registerProfessionalIntents(nlu, { track: (d) => ctx.track(d) });
  },
};
