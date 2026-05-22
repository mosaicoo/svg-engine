/**
 * Stopwords (PT + EN) — palavras de baixa informação ignoradas
 * pelo parser pra evitar ruído no matching de keywords/actions/slots.
 *
 * Inclui artigos, preposições comuns, conjunções, pronomes,
 * **fillers conversacionais** ("por favor", "tipo", "ok") e
 * **verbos auxiliares fracos** ("quero", "preciso", "would", "could")
 * que aparecem em comandos coloquiais ("**por favor** crie um
 * retângulo", "**quero** desenhar uma elipse"). Stopwords NÃO
 * participam de match de keyword nem viram slot value — só ocupariam
 * ruído.
 *
 * **Não inclui** verbos de ação ("criar", "deletar"); esses estão
 * em `actions.ts` e SÃO relevantes. Nem cores/formas (esses são
 * slot values).
 *
 * **Stopwords em lowercase, sem acento** (consistente com o tokenizer
 * — `deaccent()` é aplicado antes do lookup).
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
  'mas',
  'tambem', // "também" deacentuado
  'que',
  'isso',
  'esse',
  'essa',
  'este',
  'esta',
  'aquele',
  'aquela',
  'aqui',
  'la', // "lá" deacentuado
  'ali',
  'ai', // "aí" deacentuado

  // ── PT: fillers conversacionais ─────────────────────────────
  'porfavor', // colado, caso usuário digite junto
  'favor',
  'gentileza',
  'tipo',
  'meio',
  'ok',
  'beleza',

  // ── PT: verbos auxiliares pouco relevantes (intent fraca) ───
  // Removem ruído sem perder semântica: "quero criar X" vira
  // "criar X" — o canonical 'create' ainda é detectado.
  'pode',
  'poderia',
  'quero',
  'preciso',
  'gostaria',

  // ── EN: artigos ─────────────────────────────────────────────
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
  'but',

  // ── EN: demonstrativos / localização ────────────────────────
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'there',
  'here',

  // ── EN: conversational fillers ──────────────────────────────
  'please',
  'kindly',
  'okay',
  'well',
  'just',

  // ── EN: weak intent verbs ───────────────────────────────────
  'want',
  'need',
  'would',
  'could',
  'can',
]);

/**
 * `true` se o token é uma stopword (case-insensitive, sem acento).
 * O caller é responsável por já ter tokenizado/normalizado.
 */
export function isStopword(token: string): boolean {
  return STOPWORDS.has(token);
}
