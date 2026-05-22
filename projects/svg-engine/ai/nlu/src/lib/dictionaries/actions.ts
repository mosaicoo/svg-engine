/**
 * Dicionário de verbos / ações — **PT + EN merged** → categoria canonical.
 *
 * Este arquivo é o ponto único consumido pelo parser (`fuzzyMatchAny`
 * pra detectar ação + lookup canonical em `tokenCanonicals`). A
 * separação por idioma vive em `actions-pt.ts` e `actions-en.ts`.
 *
 * **Por que mapear pra canonical em vez de listar tudo em
 * `actionKeywords`**: intents declaram só `['create']` em vez de
 * `['create', 'add', 'draw', 'criar', 'adicionar', 'desenhar']`. Tira
 * a duplicação dos plugin authors.
 *
 * **Convenções de chaves** (válidas em PT e EN):
 * - **lowercase + SEM acento** (o tokenizer aplica `deaccent()` antes
 *   de buscar — keys com acento NUNCA seriam matched).
 * - PT cobre infinitivo + imperativo formal/informal de cada verbo.
 * - EN cobre base form + sinônimos comuns UX/CLI.
 *
 * **Adicionar verbo novo**:
 * 1. Adiciona o `ActionCanonical` em `actions-canonical.ts` (se for
 *    canonical novo).
 * 2. Adiciona entradas em `actions-pt.ts` E `actions-en.ts` apontando
 *    pra esse canonical.
 * 3. Consumer plugin declara `actionKeywords: ['novocanonical']` no
 *    intent.
 */
import { ACTION_DICTIONARY_EN } from './actions-en';
import { ACTION_DICTIONARY_PT } from './actions-pt';

import type { ActionCanonical } from './actions-canonical';
export type { ActionCanonical } from './actions-canonical';
export { ACTION_DICTIONARY_EN } from './actions-en';
export { ACTION_DICTIONARY_PT } from './actions-pt';

/**
 * **Merged dict** — PT + EN. EN tem precedência em colisão (mas
 * convencionamos não duplicar — colisões só acontecem em CSS keywords).
 */
export const ACTION_DICTIONARY: Readonly<Record<string, ActionCanonical>> = Object.freeze({
  ...ACTION_DICTIONARY_PT,
  ...ACTION_DICTIONARY_EN,
});

/** Keys disponíveis pro fuzzy matcher. */
export const ACTION_KEYS: readonly string[] = Object.freeze(Object.keys(ACTION_DICTIONARY));

/**
 * Resolve uma palavra (lowercased + deacentuada) para ação canonical.
 * Retorna `null` quando não é verbo conhecido.
 *
 * **Multi-idioma**: consulta o merged dict (PT + EN), então funciona
 * pra qualquer input independente do idioma do usuário.
 */
export function resolveActionCanonical(word: string): ActionCanonical | null {
  return ACTION_DICTIONARY[word] ?? null;
}
