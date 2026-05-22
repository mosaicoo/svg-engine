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
 * **Chaves**: lowercase, sem acento (tokenizer deacenta).
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
  adicionar: 'create',
  desenhar: 'create',
  inserir: 'create',
  novo: 'create',
  nova: 'create',
  create: 'create',
  add: 'create',
  draw: 'create',
  insert: 'create',
  new: 'create',

  // ── delete / deletar ────────────────────────────────────────
  deletar: 'delete',
  excluir: 'delete',
  remover: 'delete',
  apagar: 'delete',
  delete: 'delete',
  remove: 'delete',
  erase: 'delete',

  // ── select / selecionar ─────────────────────────────────────
  selecionar: 'select',
  marcar: 'select',
  select: 'select',
  mark: 'select',

  // ── group / agrupar ─────────────────────────────────────────
  agrupar: 'group',
  group: 'group',

  // ── ungroup / desagrupar ────────────────────────────────────
  desagrupar: 'ungroup',
  ungroup: 'ungroup',

  // ── undo / desfazer ─────────────────────────────────────────
  desfazer: 'undo',
  undo: 'undo',

  // ── redo / refazer ──────────────────────────────────────────
  refazer: 'redo',
  redo: 'redo',

  // ── zoom ────────────────────────────────────────────────────
  aproximar: 'zoom-in',
  ampliar: 'zoom-in',
  afastar: 'zoom-out',
  diminuir: 'zoom-out',
  reduzir: 'zoom-out',
  resetar: 'zoom-reset',
  // EN zoom modifiers handled at intent level (combines 'zoom' + 'in'/'out')

  // ── clipboard ───────────────────────────────────────────────
  copiar: 'copy',
  copy: 'copy',
  colar: 'paste',
  paste: 'paste',
  recortar: 'cut',
  cut: 'cut',
  duplicar: 'duplicate',
  duplicate: 'duplicate',

  // ── transform ───────────────────────────────────────────────
  mover: 'move',
  move: 'move',
  rotacionar: 'rotate',
  rotate: 'rotate',
  girar: 'rotate',
  redimensionar: 'resize',
  resize: 'resize',
  escalar: 'resize',
  scale: 'resize',

  // ── visibility ──────────────────────────────────────────────
  mostrar: 'show',
  exibir: 'show',
  show: 'show',
  display: 'show',
  esconder: 'hide',
  ocultar: 'hide',
  hide: 'hide',
  alternar: 'toggle',
  toggle: 'toggle',
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
