/**
 * **Stopwords — English.**
 *
 * Low-information words ignored by the parser to avoid noise in
 * keyword/action/slot matching. Includes articles, prepositions,
 * conjunctions, pronouns, conversational fillers and weak modal verbs.
 *
 * Does NOT include action verbs ("create", "delete") — those live in
 * `actions-en.ts`. Nor colors/shapes (those are slot values).
 *
 * **Key convention**: lowercase, no diacritics.
 */
export const STOPWORDS_EN: ReadonlySet<string> = new Set<string>([
  // ── articles ────────────────────────────────────────────────
  'a',
  'an',
  'the',

  // ── prepositions / conjunctions ─────────────────────────────
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
  'over',
  'under',
  'into',
  'onto',
  'upon',
  'and',
  'or',
  'but',
  'nor',
  'yet',

  // ── demonstratives / locatives ──────────────────────────────
  'that',
  'this',
  'these',
  'those',
  'it',
  'its',
  'there',
  'here',
  'where',
  'when',
  'which',
  'who',
  'what',

  // ── conversational fillers ──────────────────────────────────
  'please',
  'kindly',
  'okay',
  'ok',
  'well',
  'just',
  'maybe',
  'perhaps',
  'sure',
  'fine',
  'cool',

  // ── weak intent verbs ───────────────────────────────────────
  'want',
  'wants',
  'wanted',
  'need',
  'needs',
  'needed',
  'would',
  'could',
  'should',
  'might',
  'may',
  'can',
  'will',
  'shall',

  // ── modal/temporal extras ───────────────────────────────────
  'now',
  'soon',
  'later',
  'before',
  'after',
  'always',
  'never',
  'often',

  // ── equality / filler (D-046 review-6) ──────────────────────
  'equals',
  'equal',
  'is',
  'are',
  'value',

  // ── object reference fillers ────────────────────────────────
  'object',
  'objects',
  'element',
  'elements',
  'selected',
  'current',
  // 'item' / 'items' NÃO incluídos — podem ser slot names em
  // intents customizados de plugins.
]);
