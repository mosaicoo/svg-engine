/**
 * **Scoring constants** — D-046 review-10 (Sprint 1.B).
 *
 * Constantes mágicas do `parse()` extraídas pra arquivo único com
 * documentação centralizada. Calibradas empiricamente em ~50 user
 * commands durante reviews 1–9.
 *
 * **REGRA DE OURO**: qualquer mudança numérica aqui DEVE rodar
 * `scoring-constants.spec.ts` que tem fixtures cobrindo casos limite
 * (confidence exatamente 0.7, tiebreaker borderline, etc).
 *
 * ## Como o scoring funciona (visão geral)
 *
 * Para cada intent candidato (que tem ≥1 keyword match):
 *
 * 1. **Base score** = `keywordWeight × keywordMatch.score`
 *    - `keywordWeight` ∈ {0.5, 0.55, 0.65, 0.75} dependendo da
 *      complexidade do intent (vide `KEYWORD_WEIGHT_*`).
 * 2. **Action bonus** se actionKeyword presente:
 *    - Direct match: até `+ACTION_BONUS_DIRECT × score`
 *    - Canonical match: `+ACTION_BONUS_CANONICAL` (fixo)
 * 3. **Slot ajustes**:
 *    - Required missing: `-SLOT_PENALTY_REQUIRED_MISSING`
 *    - Optional filled: `+SLOT_BONUS_OPTIONAL`
 *    - Required filled: `+SLOT_BONUS_REQUIRED`
 *    - Anchored filled: `+SLOT_BONUS_ANCHORED` (bonus extra por usar anchor)
 * 4. **Description boost**: até `DESCRIPTION_BOOST_MAX` (cap em N hits).
 * 5. **Clamp** [0, 1].
 *
 * ## Targets de score por categoria
 *
 * | Cenário                                      | Score esperado |
 * |---------------------------------------------|----------------|
 * | Intent só-keyword exato ("undo")            | ~0.75          |
 * | Intent action+keyword exato ("create rect") | ~0.85          |
 * | Intent completo (kw+action+slots filled)    | ~0.90-0.95     |
 * | Intent com required missing                 | < 0.7 (gate)   |
 *
 * ## Tiebreaker
 *
 * Quando `|score_A - score_B| ≤ TIEBREAKER_EPSILON`, prefere o
 * candidato com MAIS matches em `matches[]`. Resolve conflitos
 * frequentes entre intents com keyword sobreposta.
 */

/**
 * Peso da keyword quando intent tem ambos action E slots
 * (e.g., `create-shape` com kw + actionKeywords + 7 slots).
 * Menor peso pra deixar headroom pros componentes adicionais.
 */
export const KEYWORD_WEIGHT_FULL = 0.5;

/** Peso da keyword quando intent tem action mas NÃO tem slots. */
export const KEYWORD_WEIGHT_ACTION_ONLY = 0.55;

/** Peso da keyword quando intent tem slots mas NÃO tem action. */
export const KEYWORD_WEIGHT_SLOTS_ONLY = 0.65;

/**
 * Peso da keyword quando intent tem SÓ keywords (sem action, sem slots).
 * Tipicamente menu items auto-descobertos ("Undo", "Group", "Front").
 * Match exato → 0.75 (acima do `AUTO_EXECUTE_THRESHOLD`).
 */
export const KEYWORD_WEIGHT_KEYWORDS_ONLY = 0.75;

/**
 * Bônus máximo por action keyword matched **direto** (fuzzy contra
 * `intent.actionKeywords`). Multiplicado por `match.score` ∈ [0, 1].
 */
export const ACTION_BONUS_DIRECT = 0.25;

/**
 * Bônus fixo quando action é resolvida via **canonical lookup**
 * (usuário disse "desenhar" → canonical 'create' → intent tem 'create').
 * Menor que direct porque é match aproximado de 2 níveis.
 */
export const ACTION_BONUS_CANONICAL = 0.2;

/** Penalidade por required slot **não preenchido**. */
export const SLOT_PENALTY_REQUIRED_MISSING = 0.15;

/** Bônus por optional slot preenchido (qualquer valor extraído). */
export const SLOT_BONUS_OPTIONAL = 0.05;

/** Bônus por required slot preenchido (mais peso que optional). */
export const SLOT_BONUS_REQUIRED = 0.1;

/**
 * Bônus EXTRA quando um slot foi preenchido via `anchorKeywords`
 * (não positional). Reflete que anchor é sinal forte de intenção
 * explícita do usuário ("borda azul" vs apenas "azul").
 */
export const SLOT_BONUS_ANCHORED = 0.1;

/**
 * Bônus por cada token do input que aparece na `intent.description`
 * (deduplicado). Funciona como tiebreaker semântico leve quando
 * vários intents têm keyword match similar.
 */
export const DESCRIPTION_BOOST_PER_HIT = 0.04;

/**
 * Cap máximo do `descriptionBoost` — evita que descriptions longas
 * dominem o ranking. `0.04 × 5 = 0.20` máximo total.
 */
export const DESCRIPTION_BOOST_MAX = 0.2;

/**
 * Threshold default abaixo do qual o `parse()` filtra candidatos.
 * Não confundir com `AUTO_EXECUTE_THRESHOLD` (do `execute()`).
 */
export const DEFAULT_PARSE_THRESHOLD = 0.3;

/**
 * Confidence mínima pra `execute()` disparar SEM confirmação.
 * Candidatos entre `DEFAULT_PARSE_THRESHOLD` (0.3) e este (0.7)
 * são retornados pelo `parse()` mas precisam de `confirmGate`.
 */
export const AUTO_EXECUTE_THRESHOLD = 0.7;

/**
 * Janela do tiebreaker — quando `|score_A - score_B| ≤ epsilon`,
 * critério secundário (`matches.length`) decide o vencedor.
 */
export const TIEBREAKER_EPSILON = 0.05;

/** Máximo default de candidatos retornados pelo `parse()`. */
export const DEFAULT_MAX_RESULTS = 5;

/**
 * **Sanity-check helper** — calcula a confidence esperada pra um
 * cenário canônico. Usado em scoring-constants.spec.ts pra detectar
 * quando uma mudança numérica quebra um caso de uso conhecido.
 *
 * @example
 * expectedScore({ kwScore: 1, hasAction: false, hasSlots: false })
 * // → 0.75 (KEYWORD_WEIGHT_KEYWORDS_ONLY × 1)
 */
export function expectedScore(opts: {
  /** Score do keyword match (0..1). Default 1 (exato). */
  readonly kwScore?: number;
  /** Intent declara actionKeywords? */
  readonly hasAction: boolean;
  /** Intent declara slots? */
  readonly hasSlots: boolean;
  /** Action match disparou (direct ou canonical). */
  readonly actionMatched?: 'direct' | 'canonical' | 'none';
  /** Action match score (só relevante pra 'direct'). Default 1. */
  readonly actionScore?: number;
  /** Quantos required slots preenchidos. */
  readonly requiredFilled?: number;
  /** Quantos required slots faltando. */
  readonly requiredMissing?: number;
  /** Quantos optional slots preenchidos. */
  readonly optionalFilled?: number;
  /** Quantos anchored slots preenchidos. */
  readonly anchoredFilled?: number;
  /** Hits no description boost (0..5+). */
  readonly descHits?: number;
}): number {
  const kwScore = opts.kwScore ?? 1;
  const weight =
    opts.hasAction && opts.hasSlots
      ? KEYWORD_WEIGHT_FULL
      : opts.hasAction
        ? KEYWORD_WEIGHT_ACTION_ONLY
        : opts.hasSlots
          ? KEYWORD_WEIGHT_SLOTS_ONLY
          : KEYWORD_WEIGHT_KEYWORDS_ONLY;
  let score = weight * kwScore;
  const actionMatched = opts.actionMatched ?? 'none';
  if (actionMatched === 'direct') {
    score += ACTION_BONUS_DIRECT * (opts.actionScore ?? 1);
  } else if (actionMatched === 'canonical') {
    score += ACTION_BONUS_CANONICAL;
  }
  score -= (opts.requiredMissing ?? 0) * SLOT_PENALTY_REQUIRED_MISSING;
  score += (opts.optionalFilled ?? 0) * SLOT_BONUS_OPTIONAL;
  score += (opts.requiredFilled ?? 0) * SLOT_BONUS_REQUIRED;
  score += (opts.anchoredFilled ?? 0) * SLOT_BONUS_ANCHORED;
  const descBoost = Math.min(opts.descHits ?? 0, DESCRIPTION_BOOST_MAX / DESCRIPTION_BOOST_PER_HIT);
  score += descBoost * DESCRIPTION_BOOST_PER_HIT;
  return Math.max(0, Math.min(1, score));
}
