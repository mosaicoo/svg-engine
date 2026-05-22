/**
 * **Dicionário de cores — Português (PT-BR/PT-PT).**
 *
 * Mantido **separado de EN** pra que extensões idiomáticas / regionais
 * (variantes brasileiras vs portuguesas, gírias, neologismos) possam
 * ser revisadas isoladamente. O dict final consumido pelo parser
 * (`COLOR_DICTIONARY` em `colors.ts`) faz merge de PT + EN.
 *
 * **Convenção de chave**: lowercase + SEM acento (o tokenizer aplica
 * `deaccent()` antes da busca). NÃO duplicar com EN — se a palavra é a
 * mesma nos dois idiomas (e.g., `'royalblue'` é universal CSS), coloque
 * SÓ em `colors-en.ts`.
 *
 * **Por que separar por idioma**:
 * - Auditoria: ver lacunas de vocabulário PT vs EN sem ler 200 linhas.
 * - Manutenção: adicionar variante regional sem tocar EN.
 * - Detecção de idioma (`detectLanguage()` em `language-detect.ts`)
 *   usa contagem de hits por dict pra estimar idioma dominante.
 */
export const COLOR_DICTIONARY_PT: Readonly<Record<string, string>> = Object.freeze({
  // ── Vermelhos ────────────────────────────────────────────────
  vermelho: '#e53935',
  vermelha: '#e53935',
  vermelhoescuro: '#b71c1c',
  vermelhoclaro: '#ef5350',
  carmesim: '#dc143c',
  vinho: '#7b1e3a',
  bordo: '#800020',
  bordeaux: '#800020',
  rubi: '#9b111e',
  tijolo: '#cb4154',
  sangue: '#8b0000',

  // ── Azuis ────────────────────────────────────────────────────
  azul: '#1e88e5',
  azulclaro: '#42a5f5',
  azulescuro: '#1565c0',
  azulmarinho: '#0d47a1',
  marinho: '#0d47a1',
  azulceleste: '#87ceeb',
  azulroyal: '#4169e1',
  turquesa: '#26c6da',
  petroleo: '#003f5c',
  cobalto: '#0047ab',
  anil: '#3949ab',

  // ── Verdes ───────────────────────────────────────────────────
  verde: '#43a047',
  verdeclaro: '#66bb6a',
  verdeescuro: '#2e7d32',
  limao: '#cddc39',
  oliva: '#808000',
  esmeralda: '#2ecc71',
  menta: '#98ff98',
  musgo: '#8a9a5b',
  jade: '#00a86b',
  pistache: '#93c572',
  verdeagua: '#a4dded',

  // ── Amarelos ─────────────────────────────────────────────────
  amarelo: '#fdd835',
  dourado: '#fbc02d',
  ouro: '#fbc02d',
  bege: '#d7ccc8',
  creme: '#fff3e0',
  mostarda: '#ffb300',
  trigo: '#f5deb3',
  marfim: '#fffff0',

  // ── Laranjas ─────────────────────────────────────────────────
  laranja: '#fb8c00',
  salmao: '#ff8a65',
  pessego: '#ffccbc',
  abobora: '#ff7518',
  ferrugem: '#b7410e',
  cobre: '#b87333',

  // ── Roxos ────────────────────────────────────────────────────
  roxo: '#8e24aa',
  violeta: '#7e57c2',
  lilas: '#b39ddb',
  lavanda: '#b39ddb',
  uva: '#522d80',
  ameixa: '#8e4585',
  berinjela: '#3b001e',

  // ── Rosas ────────────────────────────────────────────────────
  rosa: '#ec407a',
  rosaclaro: '#f8bbd0',
  rosachoque: '#ff1493',
  rosaquente: '#ff69b4',
  fucsia: '#ff00ff',

  // ── Marrons ──────────────────────────────────────────────────
  marrom: '#6d4c41',
  cafe: '#5d4037',
  chocolate: '#4e342e',
  areia: '#bcaaa4',
  terracota: '#a0522d',
  caramelo: '#af6e4d',
  canela: '#d2691e',
  noz: '#5d4e37',

  // ── Pretos ───────────────────────────────────────────────────
  preto: '#000000',
  preta: '#000000',
  grafite: '#424242',
  carvao: '#36454f',
  fumaca: '#738276',

  // ── Brancos ──────────────────────────────────────────────────
  branco: '#ffffff',
  branca: '#ffffff',
  gelo: '#f5f5f5',
  neve: '#fafafa',
  perola: '#eae0c8',

  // ── Cinzas ───────────────────────────────────────────────────
  cinza: '#9e9e9e',
  cinzaclaro: '#cfd8dc',
  cinzaescuro: '#616161',
  prata: '#b0bec5',
  chumbo: '#7a8288',
  acoescovado: '#8c8c8c',

  // ── Ciano ────────────────────────────────────────────────────
  ciano: '#00acc1',

  // ── Semantic (PT) ────────────────────────────────────────────
  sucesso: '#43a047',
  alerta: '#fbc02d',
  aviso: '#fbc02d',
  perigo: '#e53935',
  erro: '#e53935',
  informacao: '#1e88e5',
  primaria: '#1e88e5',
  secundaria: '#9e9e9e',

  // ── Extras úteis SVG/UI (PT) ─────────────────────────────────
  transparente: 'transparent',
  nenhum: 'none',
  nenhuma: 'none',
  semcor: 'none',
  semfundo: 'none',
  sempreenchimento: 'none',
});
