/**
 * **Professional intents** — D-046 review-4.
 *
 * Conjunto de ~25 intents cobrindo as operações profissionais que um
 * editor SVG completo deve suportar via linguagem natural. Registrados
 * pelo `builtinNluPlugin` sob demanda.
 *
 * **Cobertura** (por categoria):
 *
 * - **Transformação**: rotate, flip-horizontal, flip-vertical
 * - **Estilo**: set-stroke, set-stroke-width, set-opacity, remove-fill,
 *   remove-stroke
 * - **Seleção**: select-all, deselect, select-by-type
 * - **Visibilidade**: show-selected, hide-selected
 * - **Alinhamento**: align-{left,right,center-x,top,middle,bottom}
 * - **Distribuição**: distribute-{horizontal,vertical}
 * - **Z-order**: bring-to-front, send-to-back, bring-forward, send-backward
 * - **Pathfinder**: union, intersect, subtract, exclude, divide
 * - **Conversão**: convert-to-path
 *
 * **Multi-idioma**: cada intent declara keywords PT + EN. As actions
 * referenciam canonicals do `ACTION_DICTIONARY` (PT + EN merged).
 *
 * **Multi-editor (D-042/D-043)**: handlers respeitam `runCtx.injector`
 * pra resolver services do scope ativo (per-editor).
 *
 * **Limitações documentadas** (best-effort rule-based, Fase 1):
 * - `align-*` / `distribute-*` requerem **bbox renderizado** que o
 *   handler NÃO tem acesso (D-017 headless). Por isso devolvem um
 *   warning explicando que UI consumer deve interceptar e injetar
 *   bboxes via `AlignmentService.align(bboxes, axis)`. Plugin-puro
 *   sem acesso ao DOM não consegue executar fisicamente.
 * - `flip-horizontal/vertical` usam `ResizeNodeCommand` com sx/sy=-1
 *   (não há `FlipCommand` dedicado no core).
 */
import {
  CommandBus,
  ConvertNodeToPathCommand,
  DivideCommand,
  EditorStateService,
  ExcludeCommand,
  IntersectCommand,
  MoveNodeCommand,
  RemoveNodeCommand,
  ReorderNodeCommand,
  ResizeNodeCommand,
  RotateNodeCommand,
  SetStylePropertyOnManyCommand,
  SubtractCommand,
  UnionCommand,
  collectNodes,
  findNodeById,
  type NodeId,
  type SvgNode,
} from 'svg-engine/core';
import { SelectionService } from 'svg-engine/edit';
import type { Disposable } from 'svg-engine/core';

import { NaturalLanguageService } from '../natural-language.service';
import type { NluContext } from '../types';

interface RegisterCtx {
  readonly track: (d: Disposable) => void;
}

/**
 * Registra todos os intents profissionais no `nlu`. Retorna nada
 * porque os disposables já são tracked via `ctx.track`.
 */
export function registerProfessionalIntents(nlu: NaturalLanguageService, ctx: RegisterCtx): void {
  // ╔═══════════════════════════════════════════════════════════╗
  // ║ TRANSFORMAÇÃO                                              ║
  // ╚═══════════════════════════════════════════════════════════╝

  // ── rotate-selected: "rotacionar 45", "girar 90 graus", "rotate 30"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.rotate-selected',
      keywords: [
        // PT
        'rotacionar',
        'rotacione',
        'girar',
        'gire',
        'rodar',
        'rode',
        'virar',
        'vire',
        'rotacao',
        'rotação',
        // EN
        'rotate',
        'spin',
        'turn',
        'twist',
        'rotation',
      ],
      actionKeywords: ['rotate'],
      slots: {
        width: { kind: 'number', optional: false }, // ângulo em graus
      },
      description: 'Rotaciona os nós selecionados pelo ângulo dado (graus, sentido horário)',
      execute(slots, runCtx) {
        const bus = runCtx.injector.get(CommandBus);
        const state = runCtx.injector.get(EditorStateService);
        const selection = runCtx.injector.get(SelectionService);
        const ids = [...selection.selectedIds()];
        if (ids.length === 0) {
          warn('rotate-selected: nada selecionado');
          return;
        }
        const degrees = (slots['width'] as number | undefined) ?? 0;
        const radians = (degrees * Math.PI) / 180;
        // Pivot = centro do viewBox (sem acesso ao bbox real).
        // Plugins com acesso ao DOM podem registrar `rotate-around-center`
        // próprio usando bbox do nó.
        const vb = state.document().viewBox;
        const pivot = { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 };
        for (const id of ids) {
          bus.dispatch(new RotateNodeCommand(id, radians, pivot));
        }
      },
    }),
  );

  // ── flip-horizontal: "espelhar horizontal", "flip h", "inverter horizontal"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.flip-horizontal',
      keywords: [
        // PT
        'espelhar',
        'espelhe',
        'espelhamento',
        'inverter',
        'inverta',
        'refletir',
        'reflita',
        'horizontal',
        'horizontalmente',
        // EN
        'flip',
        'mirror',
        'reflect',
        'reverse',
      ],
      // 'horizontal' deve aparecer pra desambiguar de vertical
      actionKeywords: ['flip'],
      slots: {
        // Slot `axis` enum permite que "espelhar horizontal" preencha
        // automaticamente — único valor possível 'horizontal' pra esse intent.
        axis: {
          kind: 'enum',
          values: ['horizontal', 'horiz', 'h', 'eixox', 'xaxis'],
          optional: false,
        },
      },
      description:
        'Espelha (flip) horizontalmente os nós selecionados em torno do centro do viewBox',
      execute(_slots, runCtx) {
        flipSelected(runCtx, 'horizontal');
      },
    }),
  );

  // ── flip-vertical: "espelhar vertical", "flip v", "inverter vertical"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.flip-vertical',
      keywords: [
        'espelhar',
        'espelhe',
        'inverter',
        'inverta',
        'refletir',
        'reflita',
        'vertical',
        'verticalmente',
        'flip',
        'mirror',
        'reflect',
        'reverse',
      ],
      actionKeywords: ['flip'],
      slots: {
        axis: {
          kind: 'enum',
          values: ['vertical', 'vert', 'v', 'eixoy', 'yaxis'],
          optional: false,
        },
      },
      description: 'Espelha (flip) verticalmente os nós selecionados em torno do centro do viewBox',
      execute(_slots, runCtx) {
        flipSelected(runCtx, 'vertical');
      },
    }),
  );

  // ╔═══════════════════════════════════════════════════════════╗
  // ║ ESTILO                                                     ║
  // ╚═══════════════════════════════════════════════════════════╝

  // ── set-stroke: "borda azul", "cor da borda vermelho", "stroke red"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.set-stroke',
      keywords: [
        // PT
        'borda',
        'contorno',
        'traco',
        'traço',
        'linha',
        // EN
        'stroke',
        'outline',
        'border',
      ],
      slots: {
        color: { kind: 'color', optional: false },
      },
      description: 'Aplica a cor de borda (stroke) aos nós selecionados',
      execute(slots, runCtx) {
        const color = slots['color'] as string | undefined;
        if (color === undefined) return;
        setStyleOnSelected(runCtx, 'stroke', color, 'set-stroke');
      },
    }),
  );

  // ── set-stroke-width: "espessura 5", "borda grossa 3", "thickness 2px"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.set-stroke-width',
      keywords: [
        // PT
        'espessura',
        'grossura',
        'largura',
        'tamanho',
        // EN
        'thickness',
        'width',
        'strokewidth',
      ],
      slots: {
        width: { kind: 'number', optional: false },
      },
      description: 'Define a espessura da borda (stroke width) dos nós selecionados',
      execute(slots, runCtx) {
        const w = slots['width'] as number | undefined;
        if (w === undefined || w < 0) return;
        setStyleOnSelected(runCtx, 'strokeWidth', w, 'set-stroke-width');
      },
    }),
  );

  // ── set-opacity: "opacidade 50", "transparência 0.5", "opacity 80%"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.set-opacity',
      keywords: [
        // PT
        'opacidade',
        'transparencia',
        'transparência',
        'translucido',
        'visibilidade',
        // EN
        'opacity',
        'transparency',
        'alpha',
        'fade',
      ],
      slots: {
        width: { kind: 'number', optional: false }, // 0..1 OR 0..100
      },
      description: 'Define a opacidade (0–1 ou 0–100%) dos nós selecionados',
      execute(slots, runCtx) {
        let raw = (slots['width'] as number | undefined) ?? 1;
        // Heurística: >1 → assumimos porcentagem (50 → 0.5)
        if (raw > 1) raw = raw / 100;
        const opacity = Math.max(0, Math.min(1, raw));
        setStyleOnSelected(runCtx, 'opacity', opacity, 'set-opacity');
      },
    }),
  );

  // ── remove-fill: "sem preenchimento", "no fill", "remover cor"
  //
  // Implementação combina 2 keywords obrigatórias semanticamente:
  // - keyword 1 = "preenchimento"/"fill"/"cor"/"fundo" (substantivo)
  // - actionKeyword = canonical 'delete' (sinônimo de "sem"/"remover"
  //   = remoção). Sem isso o intent não dispara — protege contra
  //   confusão com set-fill.
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.remove-fill',
      keywords: [
        // PT
        'preenchimento',
        'fundo',
        // EN
        'fill',
        'background',
        // Versões coladas (caso usuário digite sem espaço)
        'sempreenchimento',
        'semfundo',
        'nofill',
        'nocolor',
      ],
      actionKeywords: ['delete'], // 'sem'/'remover'/'limpar' viram canonical 'delete'
      description: 'Remove o preenchimento (fill = none) dos nós selecionados',
      execute(_slots, runCtx) {
        setStyleOnSelected(runCtx, 'fill', 'none', 'remove-fill');
      },
    }),
  );

  // ── remove-stroke: "sem borda", "no stroke", "remover contorno"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.remove-stroke',
      keywords: [
        // PT
        'borda',
        'contorno',
        'traco',
        // EN
        'stroke',
        'outline',
        'border',
        // Colados
        'semborda',
        'semcontorno',
        'nostroke',
        'noborder',
      ],
      actionKeywords: ['delete'],
      description: 'Remove a borda (stroke = none) dos nós selecionados',
      execute(_slots, runCtx) {
        setStyleOnSelected(runCtx, 'stroke', 'none', 'remove-stroke');
      },
    }),
  );

  // ╔═══════════════════════════════════════════════════════════╗
  // ║ SELEÇÃO                                                    ║
  // ╚═══════════════════════════════════════════════════════════╝

  // ── select-all: "selecionar tudo", "select all", "todos"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.select-all',
      keywords: ['tudo', 'todos', 'todas', 'all', 'everything', 'tudoselecionado'],
      actionKeywords: ['select', 'select-all'],
      description: 'Seleciona TODOS os nós top-level do documento',
      execute(_slots, runCtx) {
        const state = runCtx.injector.get(EditorStateService);
        const selection = runCtx.injector.get(SelectionService);
        const topIds = state.document().root.children.map((n) => n.id);
        if (topIds.length === 0) {
          warn('select-all: documento vazio');
          return;
        }
        selection.selectMany(topIds);
      },
    }),
  );

  // ── deselect: "desselecionar", "deselect", "limpar seleção"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.deselect',
      keywords: [
        'desselecionar',
        'desselecione',
        'desmarcar',
        'desmarque',
        'limpar',
        'limpe',
        'deselect',
        'unselect',
        'clear',
      ],
      actionKeywords: ['deselect'],
      description: 'Limpa a seleção (nenhum nó selecionado)',
      execute(_slots, runCtx) {
        const selection = runCtx.injector.get(SelectionService);
        selection.clear();
      },
    }),
  );

  // ── select-by-type: "selecionar todos retangulos", "select all circles"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.select-by-type',
      keywords: [
        // PT shapes
        'retangulo',
        'retangulos',
        'quadrado',
        'quadrados',
        'circulo',
        'circulos',
        'elipse',
        'elipses',
        'linha',
        'linhas',
        'texto',
        'textos',
        'grupo',
        'grupos',
        'caminho',
        'caminhos',
        // EN shapes
        'rectangle',
        'rectangles',
        'rect',
        'rects',
        'square',
        'squares',
        'circle',
        'circles',
        'ellipse',
        'ellipses',
        'line',
        'lines',
        'text',
        'texts',
        'group',
        'groups',
        'path',
        'paths',
      ],
      actionKeywords: ['select', 'select-all'],
      slots: {
        shape: { kind: 'shape', optional: false },
      },
      description:
        'Seleciona TODOS os nós de um tipo específico (rect, circle, ellipse, line, text, etc)',
      execute(slots, runCtx) {
        const shape = slots['shape'] as string | undefined;
        if (shape === undefined) return;
        const state = runCtx.injector.get(EditorStateService);
        const selection = runCtx.injector.get(SelectionService);
        const matches: NodeId[] = [];
        // 'circle' do NLU mapeia pra ellipse no core (ellipse com rx=ry).
        // Pra select-by-type, considere ambos.
        const targetTypes: readonly SvgNode['type'][] =
          shape === 'circle' ? ['ellipse'] : [shape as SvgNode['type']];
        for (const node of collectNodes(state.document().root)) {
          if (targetTypes.includes(node.type)) matches.push(node.id);
        }
        if (matches.length === 0) {
          warn(`select-by-type: nenhum ${shape} encontrado`);
          return;
        }
        selection.selectMany(matches);
      },
    }),
  );

  // ╔═══════════════════════════════════════════════════════════╗
  // ║ VISIBILIDADE                                               ║
  // ╚═══════════════════════════════════════════════════════════╝

  // ── show-selected: "mostrar selecionado", "show", "exibir"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.show-selected',
      keywords: [
        'mostrar',
        'mostre',
        'exibir',
        'exiba',
        'visualizar',
        'visualize',
        'revelar',
        'revele',
        'show',
        'display',
        'reveal',
        'unhide',
      ],
      actionKeywords: ['show'],
      description: 'Torna visíveis os nós selecionados (visibility: visible)',
      execute(_slots, runCtx) {
        setStyleOnSelected(runCtx, 'visibility', 'visible', 'show');
      },
    }),
  );

  // ── hide-selected: "esconder selecionado", "hide", "ocultar"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.hide-selected',
      keywords: ['esconder', 'esconda', 'ocultar', 'oculte', 'hide', 'conceal'],
      actionKeywords: ['hide'],
      description: 'Esconde os nós selecionados (visibility: hidden)',
      execute(_slots, runCtx) {
        setStyleOnSelected(runCtx, 'visibility', 'hidden', 'hide');
      },
    }),
  );

  // ╔═══════════════════════════════════════════════════════════╗
  // ║ Z-ORDER                                                    ║
  // ╚═══════════════════════════════════════════════════════════╝

  // ── bring-to-front: "trazer para frente", "front", "topo"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.bring-to-front',
      keywords: ['frente', 'topo', 'front', 'top', 'acima', 'cima'],
      actionKeywords: ['bring-forward'],
      description: 'Traz os nós selecionados para o topo do z-order',
      execute(_slots, runCtx) {
        reorderSelected(runCtx, 'toFront');
      },
    }),
  );

  // ── send-to-back: "enviar para tras", "back", "fundo"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.send-to-back',
      keywords: ['tras', 'fundo', 'back', 'bottom', 'abaixo', 'baixo'],
      actionKeywords: ['send-backward'],
      description: 'Envia os nós selecionados para o fundo do z-order',
      execute(_slots, runCtx) {
        reorderSelected(runCtx, 'toBack');
      },
    }),
  );

  // ── bring-forward: "avancar", "forward", "uma frente"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.bring-forward',
      keywords: ['avancar', 'avance', 'forward', 'subir', 'suba', 'umafrente'],
      actionKeywords: ['bring-forward'],
      description: 'Avança os nós selecionados uma posição no z-order',
      execute(_slots, runCtx) {
        reorderSelected(runCtx, 'forward');
      },
    }),
  );

  // ── send-backward: "recuar", "backward", "umatras"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.send-backward',
      keywords: ['recuar', 'recue', 'backward', 'descer', 'desca', 'umatras'],
      actionKeywords: ['send-backward'],
      description: 'Recua os nós selecionados uma posição no z-order',
      execute(_slots, runCtx) {
        reorderSelected(runCtx, 'backward');
      },
    }),
  );

  // ╔═══════════════════════════════════════════════════════════╗
  // ║ PATHFINDER (boolean ops)                                   ║
  // ╚═══════════════════════════════════════════════════════════╝

  // ── pathfinder-union: "unir", "fundir", "union"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.pathfinder-union',
      keywords: [
        'unir',
        'una',
        'unificar',
        'unifique',
        'fundir',
        'funda',
        'mesclar',
        'mescle',
        'union',
        'unify',
        'weld',
        'fuse',
        'merge',
      ],
      actionKeywords: ['union'],
      description: 'Combina (Union) os paths selecionados em uma única forma',
      execute(_slots, runCtx) {
        runPathfinder(runCtx, 'union');
      },
    }),
  );

  // ── pathfinder-intersect: "intersectar", "cruzar", "intersect"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.pathfinder-intersect',
      keywords: [
        'intersectar',
        'intersecte',
        'cruzar',
        'cruze',
        'intersecao',
        'interseccao',
        'intersect',
        'intersection',
        'cross',
      ],
      actionKeywords: ['intersect'],
      description: 'Mantém apenas a área de sobreposição (Intersect) dos paths',
      execute(_slots, runCtx) {
        runPathfinder(runCtx, 'intersect');
      },
    }),
  );

  // ── pathfinder-subtract: "subtrair", "menos", "subtract"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.pathfinder-subtract',
      keywords: [
        'subtrair',
        'subtraia',
        'menos',
        'remover2',
        'subtract',
        'minus',
        'difference',
        'diferenca',
      ],
      actionKeywords: ['subtract'],
      description: 'Subtrai o segundo path do primeiro (Subtract / Minus Front)',
      execute(_slots, runCtx) {
        runPathfinder(runCtx, 'subtract');
      },
    }),
  );

  // ── pathfinder-exclude: "excluir", "xor", "exclude"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.pathfinder-exclude',
      keywords: ['excluda', 'excluir2', 'xor', 'exclude', 'excluir', 'exclua'],
      actionKeywords: ['exclude'],
      description: 'Remove a sobreposição mútua (XOR / Exclude)',
      execute(_slots, runCtx) {
        runPathfinder(runCtx, 'exclude');
      },
    }),
  );

  // ── pathfinder-divide: "fatiar", "dividir", "divide"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.pathfinder-divide',
      keywords: ['fatiar', 'fatie', 'divide', 'divida', 'recortar2', 'slice', 'split2'],
      actionKeywords: ['divide'],
      description: 'Divide os paths em regiões pelas intersecções (cada região vira shape)',
      execute(_slots, runCtx) {
        runPathfinder(runCtx, 'divide');
      },
    }),
  );

  // ╔═══════════════════════════════════════════════════════════╗
  // ║ CONVERSÃO                                                  ║
  // ╚═══════════════════════════════════════════════════════════╝

  // ── convert-to-path: "converter em caminho", "to path"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.convert-to-path',
      keywords: ['caminho', 'path', 'vetor', 'vector'],
      actionKeywords: ['convert'],
      description: 'Converte rect/ellipse/line/polygon/polyline selecionados em <path>',
      execute(_slots, runCtx) {
        const bus = runCtx.injector.get(CommandBus);
        const selection = runCtx.injector.get(SelectionService);
        const ids = [...selection.selectedIds()];
        if (ids.length === 0) {
          warn('convert-to-path: nada selecionado');
          return;
        }
        for (const id of ids) {
          bus.dispatch(new ConvertNodeToPathCommand(id));
        }
      },
    }),
  );

  // ╔═══════════════════════════════════════════════════════════╗
  // ║ MOVE-TO-ABSOLUTE (D-046 review-6)                          ║
  // ╠════════════════════════════════════════════════════════════╣
  // ║ Posicionamento ABSOLUTO — diferente do move-selected que    ║
  // ║ é relativo (dx, dy). Aqui o user diz "para x 10" ou         ║
  // ║ "posição 100 50" e o nó vai literalmente PRA aquela         ║
  // ║ coordenada. Implementação: lê o origin atual do nó          ║
  // ║ (geométrico + transform.translate), calcula dx/dy delta,    ║
  // ║ dispatcha MoveNodeCommand. Headless (sem bbox renderizado). ║
  // ╚═══════════════════════════════════════════════════════════╝

  // ── move-to-position: "para posição 100 50", "para 100 50"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.move-to-position',
      keywords: [
        // PT
        'mover',
        'mova',
        'move',
        'movem',
        'movimentar',
        'movimente',
        'movimenta',
        'deslocar',
        'desloque',
        'desloca',
        'arrastar',
        'arraste',
        'arrasta',
        'posicionar',
        'posicione',
        'posiciona',
        // EN
        'drag',
        'shift',
        'position',
        'translate',
      ],
      actionKeywords: ['move'],
      slots: {
        position: {
          kind: 'point',
          optional: false,
          anchorKeywords: ['posicao', 'position', 'coordenada', 'coordinate', 'para', 'to'],
        },
      },
      description:
        'Move os nós selecionados pra POSIÇÃO absoluta (x, y) — diferente do "move dx dy" que é relativo',
      execute(slots, runCtx) {
        const position = slots['position'] as { x: number; y: number } | undefined;
        if (position === undefined) return;
        moveToAbsolute(runCtx, position.x, position.y);
      },
    }),
  );

  // ── move-to-x: "para x 10", "x igual a 100", "x = 50"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.move-to-x',
      keywords: [
        // mesmas keywords de move (move-to-position) — desambiguação
        // por SLOT: este intent só dispara se SLOT 'x' for preenchido.
        'mover',
        'mova',
        'move',
        'movimenta',
        'movimente',
        'desloca',
        'desloque',
        'deslocar',
        'posicionar',
        'posicione',
        // O próprio token 'x' também serve de keyword pra disparar.
        'x',
        'horizontal',
      ],
      actionKeywords: ['move'],
      slots: {
        targetX: {
          kind: 'number',
          optional: false,
          anchorKeywords: ['x', 'horizontal'],
        },
      },
      description: 'Move os nós selecionados pra coordenada X absoluta (eixo horizontal)',
      execute(slots, runCtx) {
        const x = slots['targetX'] as number | undefined;
        if (x === undefined) return;
        moveToAbsolute(runCtx, x, null);
      },
    }),
  );

  // ── move-to-y: "para y 20", "y igual a 50"
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.move-to-y',
      keywords: [
        'mover',
        'mova',
        'move',
        'movimenta',
        'movimente',
        'desloca',
        'desloque',
        'deslocar',
        'posicionar',
        'posicione',
        'y',
        'vertical',
      ],
      actionKeywords: ['move'],
      slots: {
        targetY: {
          kind: 'number',
          optional: false,
          anchorKeywords: ['y', 'vertical'],
        },
      },
      description: 'Move os nós selecionados pra coordenada Y absoluta (eixo vertical)',
      execute(slots, runCtx) {
        const y = slots['targetY'] as number | undefined;
        if (y === undefined) return;
        moveToAbsolute(runCtx, null, y);
      },
    }),
  );

  // ╔═══════════════════════════════════════════════════════════╗
  // ║ DELETE (destructive)                                       ║
  // ╚═══════════════════════════════════════════════════════════╝

  // ── delete-selected: "deletar", "excluir", "delete"
  // NB: o menu já tem um intent auto-discovered "Delete" via menu item,
  // mas este é mais robusto pra ditado por voz (sinônimos PT/EN).
  ctx.track(
    nlu.registerIntent({
      id: 'svge.builtin.nlu.delete-selected',
      keywords: [
        // PT
        'deletar',
        'delete2',
        'deleta',
        'apagar',
        'apague',
        'remover',
        'remova',
        'excluir3',
        'eliminar',
        'elimine',
        // EN
        'erase',
        'destroy',
        'discard',
      ],
      actionKeywords: ['delete'],
      destructive: true,
      description: 'DESTRUTIVO: remove permanentemente os nós selecionados',
      execute(_slots, runCtx) {
        const bus = runCtx.injector.get(CommandBus);
        const selection = runCtx.injector.get(SelectionService);
        const ids = [...selection.selectedIds()];
        if (ids.length === 0) {
          warn('delete-selected: nada selecionado');
          return;
        }
        for (const id of ids) {
          bus.dispatch(new RemoveNodeCommand(id));
        }
      },
    }),
  );
}

// ╔═══════════════════════════════════════════════════════════════╗
// ║ HELPERS                                                        ║
// ╚═══════════════════════════════════════════════════════════════╝

type RunCtx = NluContext;

function warn(msg: string): void {
  if (typeof console !== 'undefined') {
    console.warn(`[svge.nlu] ${msg}`);
  }
}

function setStyleOnSelected(
  runCtx: RunCtx,
  key: 'fill' | 'stroke' | 'strokeWidth' | 'opacity' | 'visibility',
  value: string | number,
  label: string,
): void {
  const bus = runCtx.injector.get(CommandBus);
  const selection = runCtx.injector.get(SelectionService);
  const ids = [...selection.selectedIds()] as readonly NodeId[];
  if (ids.length === 0) {
    warn(`${label}: nada selecionado`);
    return;
  }
  bus.dispatch(new SetStylePropertyOnManyCommand(ids, key, value));
}

function flipSelected(runCtx: RunCtx, axis: 'horizontal' | 'vertical'): void {
  const bus = runCtx.injector.get(CommandBus);
  const state = runCtx.injector.get(EditorStateService);
  const selection = runCtx.injector.get(SelectionService);
  const ids = [...selection.selectedIds()];
  if (ids.length === 0) {
    warn(`flip-${axis}: nada selecionado`);
    return;
  }
  // Anchor = centro do viewBox (sem bbox real disponível).
  const vb = state.document().viewBox;
  const anchor = { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 };
  const sx = axis === 'horizontal' ? -1 : 1;
  const sy = axis === 'vertical' ? -1 : 1;
  for (const id of ids) {
    bus.dispatch(new ResizeNodeCommand(id, anchor, sx, sy));
  }
}

function reorderSelected(
  runCtx: RunCtx,
  direction: 'forward' | 'backward' | 'toFront' | 'toBack',
): void {
  const bus = runCtx.injector.get(CommandBus);
  const selection = runCtx.injector.get(SelectionService);
  const ids = [...selection.selectedIds()];
  if (ids.length === 0) {
    warn(`reorder-${direction}: nada selecionado`);
    return;
  }
  for (const id of ids) {
    bus.dispatch(new ReorderNodeCommand(id, direction));
  }
}

function runPathfinder(
  runCtx: RunCtx,
  op: 'union' | 'intersect' | 'subtract' | 'exclude' | 'divide',
): void {
  const bus = runCtx.injector.get(CommandBus);
  const selection = runCtx.injector.get(SelectionService);
  const ids = [...selection.selectedIds()] as readonly NodeId[];
  if (ids.length < 2) {
    warn(`pathfinder-${op}: requer ≥ 2 nós selecionados`);
    return;
  }
  switch (op) {
    case 'union':
      bus.dispatch(new UnionCommand(ids));
      break;
    case 'intersect':
      bus.dispatch(new IntersectCommand(ids));
      break;
    case 'subtract':
      bus.dispatch(new SubtractCommand(ids));
      break;
    case 'exclude':
      bus.dispatch(new ExcludeCommand(ids));
      break;
    case 'divide':
      bus.dispatch(new DivideCommand(ids));
      break;
  }
}

/**
 * **Origin aproximado do nó em coordenadas do documento** — combina
 * geometria intrínseca + componente translate do transform.
 *
 * **Headless por design (D-017)**: NÃO usa bbox renderizado. Compute
 * direto dos campos do nó (rect.x, ellipse.cx-rx, etc) + transform.e/f
 * (translation). Bom o suficiente pra "move to X" quando o user acabou
 * de criar a forma ou só fez translates puros.
 *
 * **Limitação conhecida**: ignora rotação/escala no transform. Pra um
 * nó com `transform = rotate(45°) translate(10, 20)`, o origin retornado
 * é o top-left da geometria + (10, 20), não considerando como a
 * rotação afeta a posição visual real. Aceito como aproximação
 * pragmática — fix correto exige `node-bbox.ts` (geometria
 * transformada), que vive em `core` mas o NLU não importa pra manter
 * peso baixo.
 *
 * **Retorna `null`** pra tipos sem origin computável SEM bbox renderizado:
 * `path` (precisa parsear d-string), `group` (recursivo), `svg` (root).
 */
function getNodeApproxOrigin(node: SvgNode): { x: number; y: number } | null {
  // Transform: [a, b, c, d, e, f] — e=tx, f=ty
  const tx = node.transform[4];
  const ty = node.transform[5];

  switch (node.type) {
    case 'rect':
      return { x: node.x + tx, y: node.y + ty };
    case 'ellipse':
      // Top-left do bounding box do ellipse
      return { x: node.cx - node.rx + tx, y: node.cy - node.ry + ty };
    case 'line':
      return { x: Math.min(node.x1, node.x2) + tx, y: Math.min(node.y1, node.y2) + ty };
    case 'polygon':
    case 'polyline': {
      if (node.points.length === 0) return null;
      let minX = Infinity;
      let minY = Infinity;
      for (const p of node.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
      }
      return { x: minX + tx, y: minY + ty };
    }
    case 'text':
      return { x: node.x + tx, y: node.y + ty };
    case 'image':
      return { x: node.x + tx, y: node.y + ty };
    case 'path':
    case 'group':
      // Requer parser de d-string OU bbox renderizado — fora do scope
      // headless. Caller deve dar warn e skip.
      return null;
    default:
      // Defensivo: tipos futuros caem aqui (não-exaustivo, mas safe).
      return null;
  }
}

/**
 * **Move os nós selecionados pra posição absoluta** (x, y).
 *
 * Quando `targetX` ou `targetY` é `null`, esse eixo não é alterado
 * (move-to-x não toca em y; move-to-y não toca em x).
 *
 * Para cada nó:
 * 1. Pega origin atual via {@link getNodeApproxOrigin}
 * 2. Calcula dx = targetX - currentX (ou 0 se null)
 * 3. Dispatcha {@link MoveNodeCommand}(nodeId, dx, dy)
 *
 * Nós sem origin computável (`path`/`group`/`svg`) são SKIP com warn.
 * UI consumer pode registrar intent customizado pra esses tipos
 * passando bbox renderizado.
 */
function moveToAbsolute(runCtx: RunCtx, targetX: number | null, targetY: number | null): void {
  const bus = runCtx.injector.get(CommandBus);
  const state = runCtx.injector.get(EditorStateService);
  const selection = runCtx.injector.get(SelectionService);
  const ids = [...selection.selectedIds()];
  if (ids.length === 0) {
    warn('move-to-absolute: nada selecionado');
    return;
  }
  const root = state.document().root;
  let movedCount = 0;
  let skippedCount = 0;
  for (const id of ids) {
    const node = findNodeById(root, id);
    if (node === null) {
      skippedCount++;
      continue;
    }
    const origin = getNodeApproxOrigin(node);
    if (origin === null) {
      warn(`move-to-absolute: nó ${node.type} (id=${id}) sem origin computável headless — skip`);
      skippedCount++;
      continue;
    }
    const dx = targetX !== null ? targetX - origin.x : 0;
    const dy = targetY !== null ? targetY - origin.y : 0;
    // Evita dispatch de no-op (já está na posição)
    if (dx === 0 && dy === 0) continue;
    bus.dispatch(new MoveNodeCommand(id, dx, dy));
    movedCount++;
  }
  if (movedCount === 0 && skippedCount > 0) {
    warn(`move-to-absolute: ${skippedCount} nó(s) skip; nada movido`);
  }
}
