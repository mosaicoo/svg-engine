/**
 * **Stopwords — Português.**
 *
 * Palavras de baixa informação ignoradas pelo parser pra evitar ruído
 * no matching de keywords/actions/slots. Inclui artigos, preposições,
 * conjunções, pronomes, fillers conversacionais e verbos auxiliares
 * fracos que aparecem em comandos coloquiais.
 *
 * **Não inclui** verbos de ação ("criar", "deletar"); esses estão em
 * `actions-pt.ts`. Nem cores/formas (esses são slot values).
 *
 * **Convenção de chave**: lowercase + SEM acento (consistente com
 * o tokenizer — `deaccent()` é aplicado antes do lookup).
 */
export const STOPWORDS_PT: ReadonlySet<string> = new Set<string>([
  // ── artigos / determinantes ─────────────────────────────────
  'o',
  'a',
  'os',
  'as',
  'um',
  'uma',
  'uns',
  'umas',

  // ── preposições / contrações ────────────────────────────────
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
  'pro',
  'pros',
  'pras',
  'com',
  'sem',
  'sobre',
  'sob',
  'entre',
  'ate',
  'desde',

  // ── conjunções / pronomes / advérbios curtos ────────────────
  'e',
  'ou',
  'mas',
  'porem',
  'tambem',
  'que',
  'quem',
  'qual',
  'isso',
  'esse',
  'essa',
  'este',
  'esta',
  'aquele',
  'aquela',
  'aqui',
  'la',
  'ali',
  'ai',
  'onde',
  'quando',
  'enquanto',
  'porque',

  // ── fillers conversacionais ─────────────────────────────────
  'porfavor',
  'favor',
  'gentileza',
  'tipo',
  'meio',
  'ok',
  'okey',
  'beleza',
  'massa',
  'show',
  'entao',
  'enfim',
  'pois',

  // ── verbos auxiliares pouco relevantes ──────────────────────
  // Removem ruído sem perder semântica: "quero criar X" vira
  // "criar X" — o canonical 'create' ainda é detectado.
  'pode',
  'poderia',
  'quero',
  'queria',
  'preciso',
  'precisava',
  'gostaria',
  'gostei',
  'pretendo',
  'pretendia',

  // ── modal/temporal extras ───────────────────────────────────
  'agora',
  'ja',
  'logo',
  'depois',
  'antes',
  'sempre',
  'nunca',
  'talvez',
]);
