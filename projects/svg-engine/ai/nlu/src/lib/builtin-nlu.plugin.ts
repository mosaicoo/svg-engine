import {
  CommandBus,
  createEllipse,
  createRect,
  EditorStateService,
  InsertNodeCommand,
} from 'svg-engine/core';
import { type EditorPlugin, MenuContributionRegistry, PLUGIN_API_VERSION } from 'svg-engine/edit';
import { resolveShapeKind } from './dictionaries/shapes';
import { discoverMenuIntents } from './menu-intent-discovery';
import { NaturalLanguageService } from './natural-language.service';

/**
 * **`builtinNluPlugin`** — D-046? Fase 1 (rule-based NLU bootstrap).
 *
 * Plugin opt-in que popula o {@link NaturalLanguageService} com:
 *
 * 1. **Auto-discovery** dos {@link MenuContributionRegistry} contributions
 *    — todo menu item / toolbar item / context item já registrado vira
 *    intent NLU (label tokenizado vira keywords).
 * 2. **Intents customizados** que extraem slots — `create-shape` é o
 *    exemplo canônico: input "criar retângulo vermelho 100x50" produz
 *    `{ shape: 'rect', fill: '#e53935', width: 100, height: 100 }` e
 *    dispatcha `InsertNodeCommand`.
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
 * `CommandBus`, `EditorStateService` resolvidos do scope ativo.
 *
 * **Por que `create-shape` é único intent custom (e não um por
 * `rect`/`ellipse`/`circle`)**: o slot `shape: enum` desambigua,
 * mantendo a superfície de intents enxuta. Plugins terceiros podem
 * adicionar shape-specific intents quando quiserem semântica
 * especializada (e.g., "draw star" com slot `points`).
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

    // ── 2) Intents customizados com slot extraction ──────────────

    // create-shape: "criar retângulo vermelho 100x50",
    //               "add a blue circle",
    //               "desenhar elipse"
    ctx.track(
      nlu.registerIntent({
        id: 'svge.builtin.nlu.create-shape',
        // Keywords primárias: nomes de forma em PT+EN.
        keywords: [
          'retangulo',
          'quadrado',
          'caixa',
          'elipse',
          'oval',
          'circulo',
          'linha',
          'rectangle',
          'rect',
          'square',
          'box',
          'ellipse',
          'circle',
          'line',
        ],
        // Verbo de ação — eleva confidence ("criar retângulo" >> só "retângulo")
        actionKeywords: ['create', 'add', 'draw', 'insert', 'new'],
        slots: {
          shape: {
            kind: 'enum',
            values: [
              'rect',
              'ellipse',
              'circle',
              'line',
              'polygon',
              'polyline',
              'text',
              'image',
              'group',
              'svg',
              'path',
            ],
            optional: true,
          },
          fill: { kind: 'color', optional: true },
          width: { kind: 'number', optional: true, default: 100 },
          height: { kind: 'number', optional: true, default: 100 },
        },
        description: 'Cria uma forma (retângulo, elipse, círculo) na origem do canvas',
        execute(slots, runCtx) {
          // Resolve services do scope ativo (D-042/D-043).
          const bus = runCtx.injector.get(CommandBus);
          const state = runCtx.injector.get(EditorStateService);

          // shape pode vir 'rect'/'ellipse'/'circle'/'line' OU
          // resolvedo de um token PT que não é enum value direto
          // ("quadrado" → 'rect'). Tenta extrair manualmente quando
          // o enum não preencheu.
          let shape = slots['shape'] as string | undefined;
          if (shape === undefined) {
            // Procura nos keywords do próprio intent qual forma o
            // usuário citou (fallback quando o enum extractor não
            // resolveu — ex: "criar quadrado" não tem 'rect' no input).
            const keywords = [
              'retangulo',
              'quadrado',
              'caixa',
              'elipse',
              'oval',
              'circulo',
              'linha',
              'rectangle',
              'rect',
              'square',
              'box',
              'ellipse',
              'circle',
              'line',
            ];
            for (const kw of keywords) {
              const k = resolveShapeKind(kw);
              if (k !== null) {
                shape = k;
                break;
              }
            }
            shape = shape ?? 'rect';
          }

          const w = (slots['width'] as number | undefined) ?? 100;
          const h = (slots['height'] as number | undefined) ?? 100;
          const fill = slots['fill'] as string | undefined;
          const style = fill !== undefined ? { fill } : undefined;

          const doc = state.document();
          const rootId = doc.root.id;

          // Posiciona no centro do viewBox pra ficar visível.
          const vb = doc.viewBox;
          const cx = vb.x + vb.width / 2;
          const cy = vb.y + vb.height / 2;

          switch (shape) {
            case 'rect':
            case 'square':
            case 'box': {
              const node = createRect(
                { x: cx - w / 2, y: cy - h / 2, width: w, height: h },
                style ? { style } : {},
              );
              bus.dispatch(new InsertNodeCommand(rootId, node));
              break;
            }
            case 'ellipse':
            case 'oval': {
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
            // Novos shapes da Fase 1 enrich — não inventamos geometria
            // específica (anti-alucinação): line precisa de x1/y1/x2/y2,
            // polygon/polyline precisam de points, text precisa de
            // conteúdo, image precisa de URL/href, svg/group são
            // wrappers. Emitimos warn honesto pra que plugins terceiros
            // registrem intents próprios com slots semanticamente
            // adequados (e.g., create-text com slot `content`).
            //
            // Quando uma icon library ou composite-shape registry
            // chegar, este switch pode dispatchar comandos compostos.
            case 'line':
            case 'polygon':
            case 'polyline':
            case 'text':
            case 'image':
            case 'group':
            case 'svg':
            default: {
              if (typeof console !== 'undefined') {
                console.warn(
                  '[svge.nlu] create-shape: kind',
                  shape,
                  'reconhecido mas builtin handler ainda não tem geometria/comando especializado. ' +
                    'Registre um intent customizado (e.g., create-text com slot `content`, ' +
                    'create-line com x1/y1/x2/y2) ou aguarde icon library / composite commands.',
                );
              }
              break;
            }
          }
        },
      }),
    );

    // set-fill: "pinta de vermelho", "fill blue", "cor #ff0000"
    // Apenas no PRIMEIRO selected node, pra prova-de-conceito. Plugins
    // podem registrar versão multi-selection.
    ctx.track(
      nlu.registerIntent({
        id: 'svge.builtin.nlu.set-fill',
        keywords: ['cor', 'pintar', 'pinta', 'preenchimento', 'fill', 'color', 'paint'],
        slots: {
          color: { kind: 'color', optional: false },
        },
        description: 'Define a cor de preenchimento do nó selecionado',
        execute(slots, runCtx) {
          const fill = slots['color'] as string | undefined;
          if (fill === undefined) return;
          // Mantém shape do intent leve — set-fill via inline patch é
          // funcionalidade pra um SetStyleCommand futuro. Por ora,
          // registramos a intent + slot extraction e o handler emite
          // warning. Demonstra que o pipeline funciona end-to-end
          // mesmo quando o handler é stub honesto.
          //
          // **Por que não dispatchar um command improvisado**: violaria
          // "não criar implementações fictícias". Quando `SetStyleCommand`
          // existir no core, este handler é uma linha.
          //
          // (No browser, console.warn — sem efeito colateral indesejado.)
          if (typeof console !== 'undefined') {
            console.warn(
              '[svge.nlu] set-fill intent matched but SetStyleCommand not yet available. ' +
                'Resolved color:',
              fill,
              '— register a custom intent to handle styling until the command lands.',
            );
          }
          // Sanity-touch ao injector pra silenciar unused-param.
          void runCtx.injector;
        },
      }),
    );
  },
};
