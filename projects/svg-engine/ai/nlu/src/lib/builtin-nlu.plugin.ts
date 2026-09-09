import { type Injector } from '@angular/core';
import {
  AUTO_PARENT,
  CommandBus,
  createEllipse,
  createLine,
  createPath,
  createPolygon,
  createPolyline,
  createRect,
  createText,
  DuplicateNodeCommand,
  EditorStateService,
  generateNodeId,
  InsertNodeCommand,
  MoveNodeCommand,
  ResizeNodeCommand,
  SetStylePropertyOnManyCommand,
  type NodeId,
} from '@mosaicoo/svg-engine/core';
import {
  type EditorPlugin,
  MenuContributionRegistry,
  PLUGIN_API_VERSION,
} from '@mosaicoo/svg-engine/edit';
import { SelectionService } from '@mosaicoo/svg-engine/edit';
import {
  buildGradientMarkup,
  type GradientGeometry,
  type GradientLibraryItem,
  type GradientStop,
  GradientLibraryService,
} from '@mosaicoo/svg-engine/edit';
import { SHAPE_KEYS } from './dictionaries/shapes';
import {
  POLYGON_SIDES,
  regularPolygonPoints,
  regularStarPoints,
} from './dictionaries/shapes-canonical';
import { drawIcon } from './icons';
import { adjustHexLightness, HEX_COLOR_RE } from './parsers/color-functions';
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
/**
 * Layouts de repetição do `create-shape` (quando `count > 1`):
 * - `diagonal` (default) — cascata diagonal (offset x+y), evita empilhar.
 * - `row` — em linha (mesma y, x crescente).
 * - `column` — em coluna (mesmo x, y crescente).
 * - `grid` — em grade quadrada (colunas = ceil(√count)).
 * - `scatter` — distribuído pela página inteira (células do viewBox).
 */
type NluRepeatLayout = 'diagonal' | 'row' | 'column' | 'grid' | 'scatter';

/**
 * Vocabulário PT/EN → layout. Casado por slot enum com **`fuzzy:false`**
 * (match exato) pra evitar falso-positivo "grande"→"grade". Por isso
 * inclui plurais/gêneros explicitamente — sem fuzzy, o 's'/'a' final
 * não é tolerado.
 */
const LAYOUT_KEYWORDS: readonly string[] = Object.freeze([
  // grid
  'grade',
  'grades',
  'grid',
  'matriz',
  'malha',
  // row
  'linha',
  'linhas',
  'fileira',
  'fileiras',
  'row',
  'horizontal',
  // column
  'coluna',
  'colunas',
  'column',
  'columns',
  'vertical',
  'pilha',
  'empilhado',
  'empilhados',
  // diagonal
  'diagonal',
  'cascata',
  'cascade',
  // scatter (distribuído pela página)
  'espalhado',
  'espalhados',
  'espalhada',
  'espalhadas',
  'distribuido',
  'distribuidos',
  'distribuida',
  'distribuidas',
  'disperso',
  'dispersos',
  'scatter',
  'spread',
]);

/** Normaliza a keyword extraída (PT/EN, plural/gênero) → layout canônico. */
function resolveLayout(raw: string | undefined): NluRepeatLayout {
  switch (raw) {
    case 'linha':
    case 'linhas':
    case 'fileira':
    case 'fileiras':
    case 'row':
    case 'horizontal':
      return 'row';
    case 'coluna':
    case 'colunas':
    case 'column':
    case 'columns':
    case 'vertical':
    case 'pilha':
    case 'empilhado':
    case 'empilhados':
      return 'column';
    case 'grade':
    case 'grades':
    case 'grid':
    case 'matriz':
    case 'malha':
      return 'grid';
    case 'espalhado':
    case 'espalhados':
    case 'espalhada':
    case 'espalhadas':
    case 'distribuido':
    case 'distribuidos':
    case 'distribuida':
    case 'distribuidas':
    case 'disperso':
    case 'dispersos':
    case 'scatter':
    case 'spread':
      return 'scatter';
    default:
      return 'diagonal';
  }
}

/**
 * Calcula `{cx, cy}` por índice conforme o `layout`. `baseCx/baseCy` é o
 * centro (centro do viewBox ou a `position` explícita). `vb` é o viewBox —
 * usado só pelo `scatter`, que **ignora a base** e distribui as formas pela
 * página inteira (células uniformes). `row`/`column`/`grid` usam passo
 * limpo (tamanho + gap); `diagonal` preserva a cascata legada (meio passo).
 */
function computeLayoutPositions(
  layout: NluRepeatLayout,
  count: number,
  baseCx: number,
  baseCy: number,
  w: number,
  h: number,
  vb: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): { cx: number; cy: number }[] {
  const positions: { cx: number; cy: number }[] = [];
  const diagStep = Math.max(w, h) * 0.5 + 20; // cascata diagonal (legado)
  const cell = Math.max(w, h) + 20; // separação limpa p/ row/column/grid

  if (layout === 'scatter') {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const cellW = vb.width / cols;
    const cellH = vb.height / rows;
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.push({ cx: vb.x + (col + 0.5) * cellW, cy: vb.y + (row + 0.5) * cellH });
    }
    return positions;
  }

  if (layout === 'grid') {
    const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
    for (let i = 0; i < count; i++) {
      positions.push({
        cx: baseCx + (i % cols) * cell,
        cy: baseCy + Math.floor(i / cols) * cell,
      });
    }
    return positions;
  }

  if (layout === 'row') {
    for (let i = 0; i < count; i++) positions.push({ cx: baseCx + i * cell, cy: baseCy });
    return positions;
  }

  if (layout === 'column') {
    for (let i = 0; i < count; i++) positions.push({ cx: baseCx, cy: baseCy + i * cell });
    return positions;
  }

  // diagonal (default) — preserva o comportamento de cascata original.
  for (let i = 0; i < count; i++) {
    positions.push({ cx: baseCx + i * diagStep, cy: baseCy + i * diagStep });
  }
  return positions;
}

/**
 * Spec de gradiente extraído pelo pre-pass do slot-extractor (tipo +
 * direção + cores na ordem). O handler deriva os stops e a geometria.
 */
interface NluGradientSpec {
  readonly kind: 'linear' | 'radial';
  readonly direction: 'horizontal' | 'vertical' | 'diagonal';
  readonly colors: readonly string[];
}

/**
 * Deriva os stops do gradiente:
 * - **1 cor**: clara (offset 0) → escura (offset 1) via adjustHexLightness
 *   quando hex; cor não-hex (keyword CSS) vira par degenerado (mesma cor).
 * - **N cores**: distribuídas uniformemente (offset i/(n-1)).
 */
function gradientStops(colors: readonly string[]): GradientStop[] {
  if (colors.length === 1) {
    const c = colors[0];
    if (HEX_COLOR_RE.test(c)) {
      return [
        { offset: 0, color: adjustHexLightness(c, 0.18) },
        { offset: 1, color: adjustHexLightness(c, -0.18) },
      ];
    }
    return [
      { offset: 0, color: c },
      { offset: 1, color: c },
    ];
  }
  const n = colors.length;
  return colors.map((color, i) => ({ offset: i / (n - 1), color }));
}

/**
 * Geometria (objectBoundingBox 0..1) por tipo/direção:
 * - radial: centro (0.5, 0.5), raio 0.5 (direção ignorada).
 * - linear horizontal: (0,0)→(1,0); vertical: (0,0)→(0,1); diagonal: (0,0)→(1,1).
 */
function gradientGeometry(spec: NluGradientSpec): GradientGeometry {
  if (spec.kind === 'radial') return { cx: 0.5, cy: 0.5, r: 0.5 };
  if (spec.direction === 'vertical') return { x1: 0, y1: 0, x2: 0, y2: 1 };
  if (spec.direction === 'diagonal') return { x1: 0, y1: 0, x2: 1, y2: 1 };
  return { x1: 0, y1: 0, x2: 1, y2: 0 }; // horizontal (default)
}

/**
 * Cria + registra um {@link GradientLibraryItem} no catálogo (root) e
 * retorna `url(#id)` p/ usar em `style.fill`. O `ActiveGradientsService`
 * escopado detecta a referência no documento e injeta o
 * `<linearGradient>` / `<radialGradient>` nos `defs` do renderer (mesmo
 * pipeline do editor de gradiente D-058). Não é undoable (o catálogo é
 * global): ao desfazer a forma, a referência some e o gradiente fica
 * inativo — não renderiza, mas permanece no catálogo (orfão inofensivo).
 */
function buildGradientFill(spec: NluGradientSpec, injector: Injector): string {
  const id = generateNodeId();
  const item: GradientLibraryItem = {
    id,
    name: 'Gradiente (NLU)',
    kind: spec.kind,
    stops: gradientStops(spec.colors),
    geometry: gradientGeometry(spec),
    buildMarkup(): string {
      return buildGradientMarkup(this);
    },
  };
  injector.get(GradientLibraryService).register(item);
  return `url(#${id})`;
}

/**
 * Coleta cores de várias formas que um array de "stops" pode ter:
 * `['#fff', …]` (strings) OU `[{ color: '#fff' }, …]` (objetos
 * `colorStops`/`stops`). Ignora entradas não-string. Pure, nunca lança.
 */
function collectGradientColors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const s of raw) {
    if (typeof s === 'string' && s.length > 0) out.push(s);
    else if (s !== null && typeof s === 'object') {
      const c = (s as Record<string, unknown>)['color'];
      if (typeof c === 'string' && c.length > 0) out.push(c);
    }
  }
  return out;
}

/** Direção do gradiente a partir de `direction` explícito ou das âncoras `from`/`to`. */
function deriveGradientDirection(
  slots: Record<string, unknown>,
): 'horizontal' | 'vertical' | 'diagonal' {
  const d = slots['direction'];
  if (d === 'horizontal' || d === 'vertical' || d === 'diagonal') return d;
  const txt = `${String(slots['from'] ?? '')} ${String(slots['to'] ?? '')}`.toLowerCase();
  const horiz = /left|right|esquerda|direita|leste|oeste/.test(txt);
  const vert = /top|bottom|up|down|cima|baixo|topo|fundo/.test(txt);
  if (horiz && vert) return 'diagonal';
  if (vert) return 'vertical';
  return 'horizontal';
}

/**
 * **D-093 Fase 10** — normaliza o slot `gradient` em um {@link NluGradientSpec},
 * tolerante a **duas** origens (e **nunca lança**, ao contrário do acesso
 * direto `slots.gradient.colors.length` que quebrava com planos do LLM):
 *
 * 1. **Rule-based**: o slot-extractor já entrega `{kind,direction,colors}`.
 * 2. **Plano do LLM**: o modelo costuma espalhar o gradiente em slots irmãos
 *    soltos — `gradient:'linear'` (string), `colorStops:[{offset,color}]` (ou
 *    `stops`/`colors`), `from`/`to`/`direction`. Aqui montamos o spec a partir
 *    deles. Sem cores reconhecíveis ⇒ `undefined` (fill sólido segue normal).
 */
function coerceGradientSpec(slots: Record<string, unknown>): NluGradientSpec | undefined {
  const g = slots['gradient'];
  // (1) rule-based: já é o spec canônico.
  if (
    g !== null &&
    typeof g === 'object' &&
    Array.isArray((g as Record<string, unknown>)['colors'])
  ) {
    const spec = g as unknown as NluGradientSpec;
    return spec.colors.length > 0 ? spec : undefined;
  }
  // (2) forma livre do LLM: cores em colorStops/stops/colors.
  let colors = collectGradientColors(slots['colorStops']);
  if (colors.length === 0) colors = collectGradientColors(slots['stops']);
  if (colors.length === 0) colors = collectGradientColors(slots['colors']);
  if (colors.length === 0) return undefined;
  const kindRaw = typeof g === 'string' ? g : slots['type'];
  const kind: NluGradientSpec['kind'] = kindRaw === 'radial' ? 'radial' : 'linear';
  return { kind, direction: deriveGradientDirection(slots), colors };
}

export const builtinNluPlugin: EditorPlugin = {
  id: 'svge.builtin.nlu',
  name: 'Built-in NLU (rule-based)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  description: 'Natural-language commands (rule-based): create shapes, set fill, and more.',
  author: 'SVGEngine',
  icon: 'smart_toy',
  category: 'nlu',

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
          // **`layout`** — arranjo da repetição quando count > 1:
          // "em grade", "em linha", "em coluna", "na diagonal" (default),
          // "espalhados"/"distribuídos" (pela página). Enum **exato**
          // (`fuzzy:false`) p/ não confundir "grande" com "grade". Sem
          // default → resolveLayout() cai em 'diagonal' (legado).
          layout: { kind: 'enum', values: LAYOUT_KEYWORDS, optional: true, fuzzy: false },
          // **`gradient`** — preenchimento por gradiente. Extraído SÓ pelo
          // pre-pass dedicado e SÓ quando a palavra-chave ("gradiente"/
          // "degradê"/"degrade") aparece — cores sólidas seguem intactas.
          // Suporta tipo (linear/radial), direção (horizontal/vertical/
          // diagonal) e 1..N cores. Vide buildGradientFill().
          gradient: { kind: 'gradient', optional: true },
          // **`content`** (D-093 Fase 5) — texto literal do nó `text`. Usado
          // pelos planos do LLM ("título"/"valor" de um card) e ignorado por
          // outras formas. **Anchor-only** de propósito: `kind:'string'`
          // posicional seria catch-all e roubaria tokens de comandos normais
          // ("criar retângulo vermelho" → content='criar'); com âncoras só
          // preenche quando precedido por "texto/conteúdo/dizendo/escrito".
          // O LLM passa `content` direto no slot (bypassa o extractor), então
          // a âncora cobre só o caminho rule-based ("texto dizendo Vendas").
          content: {
            kind: 'string',
            optional: true,
            anchorKeywords: ['texto', 'conteudo', 'content', 'dizendo', 'escrito', 'label'],
          },
          // **`fontSize`** (D-093 Fase 6) — tamanho do nó `text` (planos do
          // LLM dão hierarquia: rótulo pequeno + valor grande). **Anchor-only**
          // ('fonte'/'fontsize') p/ NÃO competir posicionalmente com
          // width/height. Ausente → fallback derivado de w/h (legado).
          fontSize: {
            kind: 'number',
            optional: true,
            anchorKeywords: ['fonte', 'fontsize'],
          },
          // **`fontWeight`** (D-093 Fase 6) — peso do nó `text`. Enum **exato**
          // (`fuzzy:false`) p/ não casar tokens aleatórios; presente ⇒ 'bold'.
          fontWeight: {
            kind: 'enum',
            values: ['bold', 'negrito'],
            optional: true,
            fuzzy: false,
          },
          // **`icon`** (D-093 Fase 8) — nome do glyph vetorial quando
          // `shape:'icon'` (PT/EN; vide {@link drawIcon}). Anchor-only
          // ('icone'/'icon'/'glifo') p/ não roubar tokens posicionais; o LLM
          // passa direto no slot. Nome desconhecido → fallback p/ círculo.
          icon: {
            kind: 'string',
            optional: true,
            anchorKeywords: ['icone', 'icon', 'glifo', 'glyph'],
          },
        },
        description:
          'Criar forma (retângulo, círculo, elipse, texto, etc.) — suporta fill/stroke/espessura/posição; para texto: content (texto literal), fontSize e fontWeight (bold)',
        execute(slots, runCtx) {
          const bus = runCtx.injector.get(CommandBus);
          const state = runCtx.injector.get(EditorStateService);

          // shape agora vem JÁ RESOLVIDO pelo extractor (NluShapeKind).
          // Sem fallback hardcoded — o slot kind 'shape' garante.
          const shape = (slots['shape'] as string | undefined) ?? 'rect';
          const w = (slots['width'] as number | undefined) ?? 100;
          const h = (slots['height'] as number | undefined) ?? 100;
          // **Gradiente** — quando o slot `gradient` está presente (gated na
          // palavra-chave no extractor), registra um gradiente e o fill vira
          // `url(#id)`; senão, o caminho de cor sólida segue 100% intacto.
          // Construído UMA vez (antes do loop de repetição): as N cópias
          // compartilham o mesmo gradiente (objectBoundingBox normaliza por
          // bbox de cada forma).
          // **D-093 Fase 10**: normaliza o slot (rule-based OU plano do LLM)
          // sem lançar — o acesso direto `slots.gradient.colors` quebrava
          // quando o LLM mandava `gradient:'linear'` + `colorStops:[…]`.
          const gradientSpec = coerceGradientSpec(slots);
          let fill = slots['fill'] as string | undefined;
          if (gradientSpec !== undefined && gradientSpec.colors.length > 0) {
            fill = buildGradientFill(gradientSpec, runCtx.injector);
          }
          const stroke = slots['stroke'] as string | undefined;
          const strokeWidth = slots['strokeWidth'] as number | undefined;
          const position = slots['position'] as { x: number; y: number } | undefined;
          // **D-093 Fase 5** — texto literal do nó `text` (planos do LLM).
          // Defensivo: só strings não-vazias; senão cai no placeholder.
          const rawContent = slots['content'];
          const textContent =
            typeof rawContent === 'string' && rawContent.trim().length > 0 ? rawContent : undefined;
          // **D-093 Fase 6** — hierarquia tipográfica do nó `text`.
          const rawFontSize = slots['fontSize'];
          const fontSizeSlot =
            typeof rawFontSize === 'number' && Number.isFinite(rawFontSize) && rawFontSize > 0
              ? rawFontSize
              : undefined;
          // fontWeight é enum ('bold'/'negrito'); presença ⇒ bold.
          const isBold = slots['fontWeight'] !== undefined;
          // **D-093 Fase 8** — nome do ícone (quando shape:'icon').
          const iconName =
            typeof slots['icon'] === 'string' ? (slots['icon'] as string) : undefined;

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
          // de undo por forma**. O `layout` (grade/linha/coluna/diagonal/
          // espalhado) decide a posição de cada cópia via
          // {@link computeLayoutPositions}; diagonal é o default (legado).
          const count = Math.max(
            1,
            Math.min(50, Math.round((slots['count'] as number | undefined) ?? 1)),
          );
          const layout = resolveLayout(slots['layout'] as string | undefined);
          const positions = computeLayoutPositions(layout, count, baseCx, baseCy, w, h, vb);
          for (let i = 0; i < count; i++) {
            const { cx, cy } = positions[i];

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
              // **D-093 Fase 8** — ícone vetorial: path traçado a partir do
              // registro {@link drawIcon}, escalado p/ a caixa min(w,h). A cor
              // (slot fill) vira o STROKE (ícones são line icons); nome
              // desconhecido cai no 'circle'. Self-contained (sem fonte externa).
              case 'icon': {
                const sz = Math.min(w, h);
                const d = drawIcon(iconName, cx, cy, sz) ?? drawIcon('circle', cx, cy, sz) ?? '';
                if (d.length === 0) break;
                const iconColor = fill ?? '#334155';
                const node = createPath(d, {
                  style: { fill: 'none', stroke: iconColor, strokeWidth: Math.max(1.5, sz / 12) },
                });
                bus.dispatch(new InsertNodeCommand(AUTO_PARENT, node));
                break;
              }
              // Text placeholder — "Texto" se input PT, "Text" se EN.
              // (sem acesso ao detectLanguage aqui — usa 'Texto' default).
              case 'text': {
                // **D-093 Fase 6**: fontSize do slot quando dado; senão
                // derivado de w/h (legado). fontWeight 'bold' quando pedido.
                const fontSize = fontSizeSlot ?? Math.max(12, Math.min(w, h) / 3);
                const node = createText(
                  {
                    x: cx,
                    y: cy + fontSize / 3, // alinhamento baseline visual aproximado
                    content: textContent ?? 'Texto',
                    fontSize,
                    fontWeight: isBold ? 'bold' : undefined,
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
