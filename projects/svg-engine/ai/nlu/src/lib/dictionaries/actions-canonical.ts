/**
 * **Action canonicals** — vocabulário fechado de verbos suportados.
 *
 * Cada termo PT ou EN é mapeado pra um canonical aqui. Plugins NLU
 * declaram `actionKeywords: ['create', 'delete']` (canonicals) em
 * vez de listar todas as conjugações — o `resolveActionCanonical(token)`
 * faz a tradução transparente.
 *
 * **Por que canonical em vez de só strings**:
 * - TypeScript valida cobertura nos consumers (intent não pode
 *   declarar action que não existe).
 * - Refactor de vocabulário sem quebrar intents (renomear `'paint'`
 *   pra `'fill'` é mudança LOCAL aqui + nas tabelas).
 *
 * **Adicionar canonical novo**: 1) adiciona aqui, 2) adiciona entradas
 * em `actions-pt.ts` E `actions-en.ts`, 3) consumer plugin declara em
 * `intent.actionKeywords`. Sem step 3 o canonical é "registrado mas
 * não usado" — não quebra, mas é code-smell.
 */
export type ActionCanonical =
  | 'create'
  | 'delete'
  | 'select'
  | 'select-all'
  | 'deselect'
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
  | 'flip'
  | 'align'
  | 'distribute'
  | 'bring-forward'
  | 'send-backward'
  | 'show'
  | 'hide'
  | 'toggle'
  | 'union'
  | 'intersect'
  | 'subtract'
  | 'exclude'
  | 'divide'
  | 'convert'
  | 'lock'
  | 'unlock'
  | 'export'
  | 'import';
