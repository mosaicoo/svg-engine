/**
 * **Scoring sub-package** — D-046 review-10 (Sprint 1.B + 2.A).
 *
 * Constantes calibradas + contrato `NluScorer` pra extensibilidade.
 */
export {
  ACTION_BONUS_CANONICAL,
  ACTION_BONUS_DIRECT,
  AUTO_EXECUTE_THRESHOLD,
  DEFAULT_MAX_RESULTS,
  DEFAULT_PARSE_THRESHOLD,
  DESCRIPTION_BOOST_MAX,
  DESCRIPTION_BOOST_PER_HIT,
  expectedScore,
  KEYWORD_WEIGHT_ACTION_ONLY,
  KEYWORD_WEIGHT_FULL,
  KEYWORD_WEIGHT_KEYWORDS_ONLY,
  KEYWORD_WEIGHT_SLOTS_ONLY,
  SLOT_BONUS_ANCHORED,
  SLOT_BONUS_OPTIONAL,
  SLOT_BONUS_REQUIRED,
  SLOT_PENALTY_REQUIRED_MISSING,
  TIEBREAKER_EPSILON,
} from './scoring-constants';

export type { NluScorer, NluScorerList, NluScoringContext } from './scorer.types';
