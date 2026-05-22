/**
 * Stopwords — **PT + EN merged**. Palavras de baixa informação
 * ignoradas pelo parser pra evitar ruído no matching de keywords/
 * actions/slots.
 *
 * Separadas por idioma em `stopwords-pt.ts` / `stopwords-en.ts`. Este
 * arquivo apenas faz o merge + expõe `isStopword(token)`.
 *
 * Inclui artigos, preposições comuns, conjunções, pronomes,
 * **fillers conversacionais** ("por favor", "tipo", "ok") e
 * **verbos auxiliares fracos** ("quero", "preciso", "would", "could")
 * que aparecem em comandos coloquiais ("**por favor** crie um
 * retângulo", "**quero** desenhar uma elipse"). Stopwords NÃO
 * participam de match de keyword nem viram slot value.
 *
 * **Não inclui** verbos de ação ("criar", "deletar"); esses estão
 * em `actions-*.ts` e SÃO relevantes. Nem cores/formas (esses são
 * slot values).
 */
import { STOPWORDS_EN } from './stopwords-en';
import { STOPWORDS_PT } from './stopwords-pt';

export { STOPWORDS_EN } from './stopwords-en';
export { STOPWORDS_PT } from './stopwords-pt';

/** **Merged set** — PT ∪ EN. */
export const STOPWORDS: ReadonlySet<string> = new Set<string>([...STOPWORDS_PT, ...STOPWORDS_EN]);

/**
 * `true` se o token é uma stopword (case-insensitive, sem acento).
 * O caller é responsável por já ter tokenizado/normalizado.
 *
 * **Multi-idioma**: cobre PT + EN no mesmo set.
 */
export function isStopword(token: string): boolean {
  return STOPWORDS.has(token);
}
