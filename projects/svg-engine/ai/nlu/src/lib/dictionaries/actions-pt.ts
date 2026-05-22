/**
 * **Dicionário de ações — Português.**
 *
 * Mapeia conjugações PT comuns (infinitivo + imperativo afirmativo)
 * para o termo canonical (`'create'`, `'delete'`, etc) compartilhado
 * com EN. Mantido separado pra cobrir variações regionais sem ruído.
 *
 * **Convenção de chave**: lowercase + SEM acento.
 * **Cobertura mínima**: pra cada verbo, infinitivo (`mover`) +
 * imperativo formal (`mova`) + imperativo informal (`movimente`).
 */
import type { ActionCanonical } from './actions-canonical';

export const ACTION_DICTIONARY_PT: Readonly<Record<string, ActionCanonical>> = Object.freeze({
  // ── create ──────────────────────────────────────────────────
  criar: 'create',
  crie: 'create',
  cria: 'create',
  adicionar: 'create',
  adicione: 'create',
  desenhar: 'create',
  desenhe: 'create',
  inserir: 'create',
  insira: 'create',
  colocar: 'create',
  coloque: 'create',
  gerar: 'create',
  gere: 'create',
  montar: 'create',
  monte: 'create',
  novo: 'create',
  nova: 'create',
  construir: 'create',
  construa: 'create',
  fazer: 'create',
  faca: 'create',
  faz: 'create',

  // ── delete ──────────────────────────────────────────────────
  deletar: 'delete',
  deleta: 'delete',
  delete: 'delete',
  excluir: 'delete',
  exclua: 'delete',
  remover: 'delete',
  remova: 'delete',
  apagar: 'delete',
  apague: 'delete',
  eliminar: 'delete',
  elimine: 'delete',
  limpar: 'delete',
  limpe: 'delete',
  destruir: 'delete',
  destrua: 'delete',
  sumir: 'delete',
  suma: 'delete',
  // **`'sem'`** é stopword normalmente, mas como canonical 'delete'
  // permite que "sem preenchimento" / "sem borda" disparem
  // remove-fill/remove-stroke. Curto (3 chars) → exact match only no
  // fuzzy, sem risco de falso-positivo.
  sem: 'delete',

  // ── select ──────────────────────────────────────────────────
  selecionar: 'select',
  selecione: 'select',
  seleciona: 'select',
  marcar: 'select',
  marque: 'select',
  escolher: 'select',
  escolha: 'select',
  pegar: 'select',
  pegue: 'select',
  focar: 'select',
  foque: 'select',

  // ── select-all ──────────────────────────────────────────────
  // (sub-canonical pra distinguir "selecionar tudo" de "selecionar X")
  tudo: 'select-all',
  todos: 'select-all',
  todas: 'select-all',
  // Frases típicas: "selecionar tudo" → 2 tokens; o action
  // canonical resolution acontece em compound match no parser.

  // ── deselect ────────────────────────────────────────────────
  desselecionar: 'deselect',
  desselecione: 'deselect',
  deselecionar: 'deselect',
  desmarcar: 'deselect',
  desmarque: 'deselect',
  desfocar: 'deselect',
  desfoque: 'deselect',

  // ── group ───────────────────────────────────────────────────
  agrupar: 'group',
  agrupe: 'group',
  juntar: 'group',
  junte: 'group',
  unir: 'group',
  una: 'group',
  combinar: 'group',
  combine: 'group',

  // ── ungroup ─────────────────────────────────────────────────
  desagrupar: 'ungroup',
  desagrupe: 'ungroup',
  separar: 'ungroup',
  separe: 'ungroup',
  dividir: 'ungroup',
  divida: 'ungroup',
  desmembrar: 'ungroup',
  desmembre: 'ungroup',

  // ── undo ────────────────────────────────────────────────────
  desfazer: 'undo',
  desfaca: 'undo',
  voltar: 'undo',
  volte: 'undo',
  reverter: 'undo',
  reverta: 'undo',
  cancelar: 'undo',
  cancele: 'undo',

  // ── redo ────────────────────────────────────────────────────
  refazer: 'redo',
  refaca: 'redo',
  repetir: 'redo',
  repita: 'redo',
  restaurar: 'redo',
  restaure: 'redo',
  avancar: 'redo',
  avance: 'redo',

  // ── zoom-in ─────────────────────────────────────────────────
  aproximar: 'zoom-in',
  aproxime: 'zoom-in',
  ampliar: 'zoom-in',
  amplie: 'zoom-in',
  aumentar: 'zoom-in',
  aumente: 'zoom-in',
  achegar: 'zoom-in',
  achegue: 'zoom-in',

  // ── zoom-out ────────────────────────────────────────────────
  afastar: 'zoom-out',
  afaste: 'zoom-out',
  diminuir: 'zoom-out',
  diminua: 'zoom-out',
  reduzir: 'zoom-out',
  reduza: 'zoom-out',
  distanciar: 'zoom-out',
  distancie: 'zoom-out',

  // ── zoom-reset ──────────────────────────────────────────────
  resetar: 'zoom-reset',
  resete: 'zoom-reset',
  ajustar: 'zoom-reset',
  ajuste: 'zoom-reset',
  encaixar: 'zoom-reset',
  encaixe: 'zoom-reset',

  // ── clipboard ───────────────────────────────────────────────
  copiar: 'copy',
  copie: 'copy',
  colar: 'paste',
  cole: 'paste',
  recortar: 'cut',
  recorte: 'cut',
  cortar: 'cut',
  corte: 'cut',
  duplicar: 'duplicate',
  duplique: 'duplicate',
  clonar: 'duplicate',
  clone: 'duplicate',

  // ── transform ───────────────────────────────────────────────
  mover: 'move',
  mova: 'move',
  // 3ª pessoa singular + variantes (D-046 review-6): "desloca o
  // objeto", "movimenta isto" — conjugações comuns no falar PT
  // que faltavam no dict.
  movem: 'move',
  movimenta: 'move',
  movimente: 'move',
  movimentar: 'move',
  movimentem: 'move',
  arrastar: 'move',
  arraste: 'move',
  arrasta: 'move',
  deslocar: 'move',
  desloque: 'move',
  desloca: 'move',
  translada: 'move',
  translade: 'move',
  transladar: 'move',
  posicionar: 'move',
  posicione: 'move',
  posiciona: 'move',
  rotacionar: 'rotate',
  rotacione: 'rotate',
  girar: 'rotate',
  gire: 'rotate',
  rodar: 'rotate',
  rode: 'rotate',
  virar: 'rotate',
  vire: 'rotate',
  redimensionar: 'resize',
  redimensione: 'resize',
  escalar: 'resize',
  escale: 'resize',
  dimensionar: 'resize',
  dimensione: 'resize',
  espelhar: 'flip',
  espelhe: 'flip',
  inverter: 'flip',
  inverta: 'flip',
  refletir: 'flip',
  reflita: 'flip',

  // ── alignment ───────────────────────────────────────────────
  alinhar: 'align',
  alinhe: 'align',
  distribuir: 'distribute',
  distribua: 'distribute',
  espacar: 'distribute',
  espace: 'distribute',

  // ── z-order ─────────────────────────────────────────────────
  trazer: 'bring-forward',
  traga: 'bring-forward',
  avancar1: 'bring-forward', // raro; preserva canonical separation
  enviar: 'send-backward',
  envie: 'send-backward',
  recuar: 'send-backward',
  recue: 'send-backward',

  // ── visibility ──────────────────────────────────────────────
  mostrar: 'show',
  mostre: 'show',
  exibir: 'show',
  exiba: 'show',
  visualizar: 'show',
  visualize: 'show',
  revelar: 'show',
  revele: 'show',
  esconder: 'hide',
  esconda: 'hide',
  ocultar: 'hide',
  oculte: 'hide',
  alternar: 'toggle',
  alterne: 'toggle',
  trocar: 'toggle',
  troque: 'toggle',
  habilitar: 'toggle',
  habilite: 'toggle',
  desabilitar: 'toggle',
  desabilite: 'toggle',

  // ── path operations (pathfinder) ─────────────────────────────
  unificar: 'union',
  unifique: 'union',
  fundir: 'union',
  funda: 'union',
  intersectar: 'intersect',
  intersecte: 'intersect',
  cruzar: 'intersect',
  cruze: 'intersect',
  subtrair: 'subtract',
  subtraia: 'subtract',
  excluir2: 'exclude', // canonical separation de delete
  excluda: 'exclude',
  fatiar: 'divide',
  fatie: 'divide',
  recortar2: 'divide', // canonical separation de cut

  // ── conversion ──────────────────────────────────────────────
  converter: 'convert',
  converta: 'convert',
  transformar: 'convert',
  transforme: 'convert',

  // ── lock ────────────────────────────────────────────────────
  bloquear: 'lock',
  bloqueie: 'lock',
  travar: 'lock',
  trave: 'lock',
  desbloquear: 'unlock',
  desbloqueie: 'unlock',
  destravar: 'unlock',
  destrave: 'unlock',

  // ── export / import ─────────────────────────────────────────
  exportar: 'export',
  exporte: 'export',
  baixar: 'export',
  baixe: 'export',
  salvar: 'export',
  salve: 'export',
  importar: 'import',
  importe: 'import',
  carregar: 'import',
  carregue: 'import',
  abrir: 'import',
  abra: 'import',
});
