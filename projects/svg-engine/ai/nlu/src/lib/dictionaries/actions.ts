/**
 * Dicionário de verbos / ações (PT + EN) → categoria canonical.
 *
 * O nome canonical (`'create'`, `'delete'`, `'undo'`...) é o que
 * intents declaram em `actionKeywords`. Mapeia inúmeras formas de
 * dizer a mesma ação ("criar"/"adicionar"/"desenhar" → `'create'`)
 * para um termo único, fazendo a comparação no parser determinística
 * independente de idioma.
 *
 * **Por que mapear pra canonical em vez de listar tudo em
 * `actionKeywords`**: intents declaram só `['create']` em vez de
 * `['create', 'add', 'draw', 'criar', 'adicionar', 'desenhar']`. Tira
 * a duplicação dos plugin authors.
 *
 * **Convenções de chaves**:
 * - **lowercase + SEM acento** (o tokenizer aplica `deaccent()` antes
 *   de buscar — keys com acento NUNCA seriam matched)
 * - cobertura de conjugações PT comuns: infinitivo + imperativo
 *   (`criar`/`crie`/`cria`, `remover`/`remova`, `selecionar`/`selecione`)
 * - sem duplicates (TypeScript silently overwrites — revisar manualmente
 *   ao adicionar entradas novas)
 */
export type ActionCanonical =
  | 'create'
  | 'delete'
  | 'select'
  | 'select-all'
  | 'group'
  | 'ungroup'
  | 'undo'
  | 'redo'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'copy'
  | 'paste'
  | 'cut'
  | 'duplicate'
  | 'move'
  | 'rotate'
  | 'resize'
  | 'show'
  | 'hide'
  | 'toggle';

export const ACTION_DICTIONARY: Readonly<Record<string, ActionCanonical>> = Object.freeze({
  // ── create / criar ──────────────────────────────────────────
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
  create: 'create',
  add: 'create',
  draw: 'create',
  insert: 'create',
  put: 'create',
  place: 'create',
  generate: 'create',
  make: 'create',
  new: 'create',

  // ── delete / deletar ────────────────────────────────────────
  deletar: 'delete',
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
  remove: 'delete',
  erase: 'delete',
  clear: 'delete',
  eliminate: 'delete',

  // ── select / selecionar ─────────────────────────────────────
  selecionar: 'select',
  selecione: 'select',
  marcar: 'select',
  marque: 'select',
  escolher: 'select',
  escolha: 'select',
  pegar: 'select',
  pegue: 'select',
  focar: 'select',
  foque: 'select',
  select: 'select',
  mark: 'select',
  choose: 'select',
  pick: 'select',
  focus: 'select',

  // ── group / agrupar ─────────────────────────────────────────
  agrupar: 'group',
  agrupe: 'group',
  juntar: 'group',
  junte: 'group',
  unir: 'group',
  una: 'group',
  combinar: 'group',
  combine: 'group',
  group: 'group',
  join: 'group',
  merge: 'group',

  // ── ungroup / desagrupar ────────────────────────────────────
  desagrupar: 'ungroup',
  desagrupe: 'ungroup',
  separar: 'ungroup',
  separe: 'ungroup',
  dividir: 'ungroup',
  divida: 'ungroup',
  desmembrar: 'ungroup',
  desmembre: 'ungroup',
  ungroup: 'ungroup',
  separate: 'ungroup',
  split: 'ungroup',
  detach: 'ungroup',

  // ── undo / desfazer ─────────────────────────────────────────
  // NB: `desfaca` / `refaca` sem cedilha — tokenizer faz deaccent.
  desfazer: 'undo',
  desfaca: 'undo',
  voltar: 'undo',
  volte: 'undo',
  reverter: 'undo',
  reverta: 'undo',
  cancelar: 'undo',
  cancele: 'undo',
  undo: 'undo',
  revert: 'undo',
  rollback: 'undo',
  cancel: 'undo',

  // ── redo / refazer ──────────────────────────────────────────
  refazer: 'redo',
  refaca: 'redo',
  repetir: 'redo',
  repita: 'redo',
  restaurar: 'redo',
  restaure: 'redo',
  avancar: 'redo',
  avance: 'redo',
  redo: 'redo',
  repeat: 'redo',
  restore: 'redo',

  // ── zoom-in / aproximar ─────────────────────────────────────
  aproximar: 'zoom-in',
  aproxime: 'zoom-in',
  ampliar: 'zoom-in',
  amplie: 'zoom-in',
  aumentar: 'zoom-in',
  aumente: 'zoom-in',
  zoomin: 'zoom-in',

  // ── zoom-out / afastar ──────────────────────────────────────
  afastar: 'zoom-out',
  afaste: 'zoom-out',
  diminuir: 'zoom-out',
  diminua: 'zoom-out',
  reduzir: 'zoom-out',
  reduza: 'zoom-out',
  distanciar: 'zoom-out',
  distancie: 'zoom-out',
  zoomout: 'zoom-out',

  // ── zoom-reset / resetar zoom ───────────────────────────────
  resetar: 'zoom-reset',
  resete: 'zoom-reset',
  zoomreset: 'zoom-reset',
  fit: 'zoom-reset',
  reset: 'zoom-reset',

  // ── clipboard ───────────────────────────────────────────────
  copiar: 'copy',
  copie: 'copy',
  copy: 'copy',

  colar: 'paste',
  cole: 'paste',
  paste: 'paste',

  recortar: 'cut',
  recorte: 'cut',
  cortar: 'cut',
  corte: 'cut',
  cut: 'cut',

  duplicar: 'duplicate',
  duplique: 'duplicate',
  clonar: 'duplicate',
  duplicate: 'duplicate',
  clone: 'duplicate',

  // ── transform / transformar ─────────────────────────────────
  mover: 'move',
  mova: 'move',
  arrastar: 'move',
  arraste: 'move',
  deslocar: 'move',
  desloque: 'move',
  posicionar: 'move',
  posicione: 'move',
  move: 'move',
  drag: 'move',
  shift: 'move',
  position: 'move',

  rotacionar: 'rotate',
  rotacione: 'rotate',
  girar: 'rotate',
  gire: 'rotate',
  rodar: 'rotate',
  rode: 'rotate',
  rotate: 'rotate',
  spin: 'rotate',
  turn: 'rotate',

  redimensionar: 'resize',
  redimensione: 'resize',
  escalar: 'resize',
  escale: 'resize',
  dimensionar: 'resize',
  dimensione: 'resize',
  ajustar: 'resize',
  ajuste: 'resize',
  resize: 'resize',
  scale: 'resize',
  rescale: 'resize',
  adjust: 'resize',

  // ── visibility / visibilidade ───────────────────────────────
  mostrar: 'show',
  mostre: 'show',
  exibir: 'show',
  exiba: 'show',
  visualizar: 'show',
  visualize: 'show',
  revelar: 'show',
  revele: 'show',
  show: 'show',
  display: 'show',
  reveal: 'show',
  visible: 'show',

  esconder: 'hide',
  esconda: 'hide',
  ocultar: 'hide',
  oculte: 'hide',
  sumir: 'hide',
  hide: 'hide',
  conceal: 'hide',
  invisible: 'hide',

  alternar: 'toggle',
  alterne: 'toggle',
  trocar: 'toggle',
  troque: 'toggle',
  inverter: 'toggle',
  inverta: 'toggle',
  habilitar: 'toggle',
  desabilitar: 'toggle',
  toggle: 'toggle',
  switch: 'toggle',
});

/** Keys disponíveis pro fuzzy matcher. */
export const ACTION_KEYS: readonly string[] = Object.freeze(Object.keys(ACTION_DICTIONARY));

/**
 * Resolve uma palavra (lowercased + deacentuada) para ação canonical.
 * Retorna `null` quando não é verbo conhecido.
 */
export function resolveActionCanonical(word: string): ActionCanonical | null {
  return ACTION_DICTIONARY[word] ?? null;
}
