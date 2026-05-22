/**
 * Dicionário de formas (PT + EN) → canonical shape kind.
 *
 * O kind canonical mapeia para os factories existentes em
 * `svg-engine/core` (`createRect`, `createEllipse`, `createPath`,
 * `createLine`, `createPolygon`, `createPolyline`, `createText`,
 * `createImage`, `createGroup`). Plugins built-in usam esse mapeamento
 * pra resolver o slot `shape` (e.g., "criar retângulo" → `rect` →
 * `createRect`).
 *
 * **Convenções de chaves**:
 * - **lowercase + SEM acento** (tokenizer faz `deaccent()` antes).
 * - **PT/EN coexistem** apontando para o mesmo kind canonical —
 *   mantém a UI determinística independente do idioma do input.
 * - **Semantic aliases** ("nó" → circle, "conector" → line, "balão"
 *   → group) mapeiam vocabulário UX para shapes existentes.
 *
 * **Limitação Fase 1**: ícones nomeados ("estrela" / "coração" /
 * "engrenagem") mapeiam pra `'polygon'` ou `'path'` mas o handler
 * built-in não renderiza geometria específica deles — isso fica para
 * a fase que integrar uma icon library (Fase 1.x). Por ora caem em
 * stub honesto no `builtinNluPlugin`.
 */

/**
 * **NLU-specific shape vocabulary** — separado do `ShapeKind` em
 * `svg-engine/edit/lib/tool` (que tem `'rect' | 'ellipse' | 'polygon'`
 * pras shape tools de drawing). O NLU precisa de uma lista maior
 * (inclui `circle`, `line`, `path`, `text`, `image`, `polyline`,
 * `group`, `svg`) porque mapeia vocabulário falado/escrito, não
 * capability de tool.
 */
export type NluShapeKind =
  | 'rect'
  | 'ellipse'
  | 'circle'
  | 'line'
  | 'path'
  | 'polygon'
  | 'polyline'
  | 'text'
  | 'image'
  | 'group'
  | 'svg';

export const SHAPE_DICTIONARY: Readonly<Record<string, NluShapeKind>> = Object.freeze({
  // ── RECT / RETÂNGULOS ────────────────────────────────────────
  retangulo: 'rect',
  quadrado: 'rect',
  caixa: 'rect',
  bloco: 'rect',
  painel: 'rect',
  card: 'rect',
  area: 'rect',
  frame: 'rect',
  moldura: 'rect',

  rectangle: 'rect',
  rect: 'rect',
  square: 'rect',
  box: 'rect',
  block: 'rect',
  panel: 'rect',

  // ── CIRCLE / CÍRCULOS ────────────────────────────────────────
  circulo: 'circle',
  bola: 'circle',
  esfera: 'circle',
  ponto: 'circle',
  dot: 'circle',
  no: 'circle', // semantic: "nó" do diagrama
  node: 'circle',

  circle: 'circle',
  round: 'circle',

  // ── ELLIPSE / ELIPSE ─────────────────────────────────────────
  elipse: 'ellipse',
  oval: 'ellipse',
  ovoide: 'ellipse',

  ellipse: 'ellipse',
  ovalshape: 'ellipse',

  // ── LINE / LINHAS ────────────────────────────────────────────
  linha: 'line',
  risco: 'line',
  traco: 'line',
  segmento: 'line',
  eixo: 'line',
  conexao: 'line',
  ligacao: 'line',
  conector: 'line', // semantic: conector entre nós
  seta: 'line', // simplificação Fase 1 — marker-end registrado como follow-up

  line: 'line',
  stroke: 'line',
  segment: 'line',
  connector: 'line',
  connection: 'line',
  arrow: 'line',

  // ── PATH / CAMINHOS ──────────────────────────────────────────
  caminho: 'path',
  trajeto: 'path',
  curva: 'path',
  spline: 'path',
  trilha: 'path',
  contorno: 'path',
  desenho: 'path',
  rabisco: 'path',
  vetor: 'path',
  forma: 'path',
  estrada: 'path', // semantic: "desenhe uma estrada"

  path: 'path',
  curve: 'path',
  route: 'path',
  contour: 'path',
  vector: 'path',
  freehand: 'path',
  pen: 'path',
  shape: 'path',

  // ── POLYGON / POLÍGONOS ──────────────────────────────────────
  poligono: 'polygon',
  hexagono: 'polygon',
  pentagono: 'polygon',
  octogono: 'polygon',
  losango: 'polygon',
  diamante: 'polygon',
  triangulo: 'polygon',
  estrela: 'polygon', // Fase 1: cai como polígono genérico; icon system pra estrela real é follow-up
  coracao: 'polygon', // idem

  polygon: 'polygon',
  hexagon: 'polygon',
  pentagon: 'polygon',
  octagon: 'polygon',
  diamond: 'polygon',
  rhombus: 'polygon',
  triangle: 'polygon',
  star: 'polygon',
  heart: 'polygon',

  // ── POLYLINE / POLILINHA ─────────────────────────────────────
  polilinha: 'polyline',
  linhaquebrada: 'polyline',
  linhapoligonal: 'polyline',

  polyline: 'polyline',
  brokenline: 'polyline',

  // ── TEXT / TEXTO ─────────────────────────────────────────────
  texto: 'text',
  letra: 'text',
  legenda: 'text',
  rotulo: 'text',
  titulo: 'text',
  palavra: 'text',
  nome: 'text',

  text: 'text',
  label: 'text',
  title: 'text',
  caption: 'text',
  word: 'text',

  // ── IMAGE / IMAGEM ───────────────────────────────────────────
  imagem: 'image',
  foto: 'image',
  icone: 'image',
  figura: 'image',
  logotipo: 'image',
  logo: 'image',

  image: 'image',
  picture: 'image',
  photo: 'image',
  icon: 'image',

  // ── GROUP / AGRUPAMENTO ──────────────────────────────────────
  grupo: 'group',
  agrupamento: 'group',
  conjunto: 'group',
  container: 'group',
  camada: 'group',
  balao: 'group', // semantic: "balão" de fala — group de path+text
  tooltip: 'group',

  group: 'group',
  containergroup: 'group',
  layergroup: 'group',

  // ── SVG ROOT / DOCUMENTO ─────────────────────────────────────
  svg: 'svg',
  documento: 'svg',
  tela: 'svg',
  canvas: 'svg',
  prancheta: 'svg',

  document: 'svg',
  artboard: 'svg',
  workspace: 'svg',
});

/** Keys disponíveis pro fuzzy matcher. */
export const SHAPE_KEYS: readonly string[] = Object.freeze(Object.keys(SHAPE_DICTIONARY));

/**
 * Resolve um nome de forma (lowercased + deacentuado) para kind.
 * Retorna `null` quando não é uma forma conhecida.
 */
export function resolveShapeKind(name: string): NluShapeKind | null {
  return SHAPE_DICTIONARY[name] ?? null;
}
