/**
 * **Dicionário de formas — Português.**
 *
 * Mapeia vocabulário PT (nomes técnicos + semanticos UX) pra
 * {@link NluShapeKind} canonical. Separado de EN pra cobrir variantes
 * regionais isoladamente. Final merged em `shapes.ts`.
 *
 * **Convenção de chave**: lowercase + SEM acento.
 */
import type { NluShapeKind } from './shapes-canonical';

export const SHAPE_DICTIONARY_PT: Readonly<Record<string, NluShapeKind>> = Object.freeze({
  // ── RECT ────────────────────────────────────────────────────
  retangulo: 'rect',
  quadrado: 'rect',
  caixa: 'rect',
  bloco: 'rect',
  painel: 'rect',
  area: 'rect',
  moldura: 'rect',
  mesa: 'rect',
  faixa: 'rect',
  barra: 'rect',
  tabela: 'rect',

  // ── CIRCLE ──────────────────────────────────────────────────
  circulo: 'circle',
  bola: 'circle',
  esfera: 'circle',
  ponto: 'circle',
  no: 'circle', // semantic: "nó" do diagrama
  bolinha: 'circle',
  disco: 'circle',
  roda: 'circle',
  moeda: 'circle',

  // ── ELLIPSE ─────────────────────────────────────────────────
  elipse: 'ellipse',
  oval: 'ellipse',
  ovoide: 'ellipse',
  ovo: 'ellipse',

  // ── LINE ────────────────────────────────────────────────────
  linha: 'line',
  risco: 'line',
  traco: 'line',
  segmento: 'line',
  eixo: 'line',
  conexao: 'line',
  ligacao: 'line',
  conector: 'line',
  seta: 'line',
  reta: 'line',
  fio: 'line',

  // ── PATH ────────────────────────────────────────────────────
  caminho: 'path',
  trajeto: 'path',
  curva: 'path',
  trilha: 'path',
  desenho: 'path',
  rabisco: 'path',
  vetor: 'path',
  forma: 'path',
  contorno: 'path',
  silhueta: 'path',

  // ── POLYGON (kinds específicos D-046 review-5) ───────────────
  // Cada keyword mapeia pra um kind canonical próprio para que o
  // handler create-shape saiba quantos lados gerar.
  triangulo: 'triangle',
  losango: 'rhombus',
  diamante: 'rhombus',
  pentagono: 'pentagon',
  hexagono: 'hexagon',
  octogono: 'octagon',
  estrela: 'star',
  coracao: 'star', // semantic fallback (sem geometria de coração ainda)
  // Genérico (sem N específico) → default 6 lados (hexagon).
  poligono: 'polygon',
  setapoligono: 'polygon',

  // ── POLYLINE ────────────────────────────────────────────────
  polilinha: 'polyline',
  linhaquebrada: 'polyline',
  linhapoligonal: 'polyline',
  zigzag: 'polyline',
  ziguezague: 'polyline',

  // ── TEXT ────────────────────────────────────────────────────
  texto: 'text',
  letra: 'text',
  legenda: 'text',
  rotulo: 'text',
  titulo: 'text',
  palavra: 'text',
  nome: 'text',
  paragrafo: 'text',
  frase: 'text',
  etiqueta: 'text',

  // ── IMAGE ───────────────────────────────────────────────────
  imagem: 'image',
  foto: 'image',
  icone: 'image',
  figura: 'image',
  logotipo: 'image',
  logo: 'image',
  bitmap: 'image',

  // ── GROUP ───────────────────────────────────────────────────
  grupo: 'group',
  agrupamento: 'group',
  conjunto: 'group',
  camada: 'group',
  balao: 'group',
  caixaagrupada: 'group',
  pasta: 'group',

  // ── SVG ROOT ────────────────────────────────────────────────
  documento: 'svg',
  tela: 'svg',
  prancheta: 'svg',
});
