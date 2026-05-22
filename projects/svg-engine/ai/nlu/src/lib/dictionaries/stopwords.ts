/**
 * Stopwords (PT + EN) — palavras de baixa informação ignoradas
 * pelo parser pra evitar ruído no matching de keywords/actions/slots.
 *
 * Inclui artigos, preposições comuns, conjunções e pronomes que
 * aparecem em comandos coloquiais ("criar **um** retângulo **de** cor
 * vermelha", "select **the** blue circle"). Stopwords NÃO participam
 * de match de keyword nem viram slot value — só ocupariam ruído.
 *
 * **Não inclui** verbos de ação (esses estão em `actions.ts` e SÃO
 * relevantes), nem cores/formas (esses são slot values).
 *
 * **Stopwords em lowercase, sem acento** (consistente com o tokenizer).
 */
export const STOPWORDS: ReadonlySet<string> = new Set<string>([
  // ── PT: artigos / determinantes ─────────────────────────────
  'o',
  'a',
  'os',
  'as',
  'um',
  'uma',
  'uns',
  'umas',
  // ── PT: preposições / contrações comuns ─────────────────────
  'de',
  'do',
  'da',
  'dos',
  'das',
  'em',
  'no',
  'na',
  'nos',
  'nas',
  'por',
  'para',
  'pra',
  'com',
  'sem',
  'sobre',
  // ── PT: conjunções / pronomes / advérbios curtos ────────────
  'e',
  'ou',
  'que',
  'isso',
  'esse',
  'essa',
  'este',
  'esta',
  'aqui',
  'la',
  'ali',
  // ── EN: artigos ────────────────────────────────────────────
  'a',
  'an',
  'the',
  // ── EN: preposições / conjunções ────────────────────────────
  'of',
  'in',
  'on',
  'at',
  'to',
  'from',
  'with',
  'without',
  'about',
  'for',
  'and',
  'or',
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'there',
  'here',
]);

/**
 * `true` se o token é uma stopword (case-insensitive, sem acento).
 * O caller é responsável por já ter tokenizado/normalizado.
 */
export function isStopword(token: string): boolean {
  return STOPWORDS.has(token);
}
