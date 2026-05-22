/**
 * **NluScorer contract** — D-046 review-10 (Sprint 2.A / H3).
 *
 * Interface composable pra customizar o algoritmo de scoring sem
 * sobrescrever o método `parse()` inteiro do `NaturalLanguageService`.
 * Permite plugar scorers adicionais (ML re-rank, history boost,
 * semantic embeddings) em Fase 2 sem reescrever a base rule-based.
 *
 * **Estado atual** (Fase 1): `NaturalLanguageService.parse()` ainda
 * computa scoring inline. Esta interface é **forward-compatibility**
 * — Fase 2 ML pode implementar `SemanticScorer implements NluScorer`
 * e injetar via DI sem tocar no service. Refactor completo (parse
 * delegando pra `scorers: readonly NluScorer[]`) fica como follow-up
 * pós-Fase 2 (quando houver scorer real pra validar a abstração).
 *
 * **Por que não refatorar agora**: prematuramente abstrair sem 2ª
 * implementação concreta cria interface guess-work. Esta é o contrato
 * MÍNIMO descoberto pelo design da Fase 1 — Fase 2 valida ou ajusta.
 */
import type { NluCandidate } from '../types';

/**
 * Contexto passado pra cada scorer.
 */
export interface NluScoringContext {
  /** Tokens normalizados do input (já passou por `tokenize`). */
  readonly tokens: readonly string[];
  /**
   * Score atual do candidate antes deste scorer. Scorers compõem em
   * cadeia — cada um recebe o score do anterior e retorna novo score.
   */
  readonly partialScore: number;
  /**
   * Candidate em construção. Scorers podem ler `matches`, `slots`,
   * `intent.id` etc pra ajustes contextuais. Não devem MUTAR o
   * candidate (treat as readonly).
   */
  readonly candidate: NluCandidate;
}

/**
 * Scorer plugável. Cada scorer recebe o score atual e retorna novo.
 *
 * **Convenções**:
 * - Score retornado DEVE estar em [0, 1] (clamp aplicado no final).
 * - Scorers devem ser PUROS (mesma entrada → mesmo output).
 * - Não-determinístico (ML, network) é OK desde que comportamento
 *   seja documentado claramente pelo consumer.
 * - Cap em ~5ms por scorer pra não degradar UX (parse roda em
 *   keystroke).
 *
 * @example
 * ```ts
 * class HistoryBoostScorer implements NluScorer {
 *   constructor(private readonly history: Set<string>) {}
 *   score(ctx: NluScoringContext): number {
 *     // Boost intents usados recentemente
 *     const used = this.history.has(ctx.candidate.intent.id);
 *     return used ? Math.min(1, ctx.partialScore + 0.05) : ctx.partialScore;
 *   }
 * }
 * ```
 */
export interface NluScorer {
  /**
   * Identificador único do scorer (pra debug/logging).
   * Reverse-DNS recomendado: `svge.nlu.scorer.semantic`.
   */
  readonly id: string;
  /**
   * Computa novo score baseado no partial atual + contexto.
   * Retornar `ctx.partialScore` no-op (skipping este scorer pra este candidate).
   */
  score(ctx: NluScoringContext): number;
}

/**
 * **Future hook** (Fase 2): override scorers no `NaturalLanguageService`.
 * Por enquanto, o service tem scorers hardcoded inline. Esta interface
 * é exportada como API pública pra que plugins de Fase 2 já possam
 * implementar e estar prontos quando o refactor for feito.
 *
 * **Migration path** quando o refactor acontecer:
 * 1. `NaturalLanguageService` ganha `setScorers(scorers: readonly NluScorer[])`
 * 2. `parse()` substitui scoring inline por loop pelos scorers
 * 3. Default scorers (keyword, action, slot, description) viram
 *    instâncias `NluScorer` em `scoring/default-scorers.ts`
 * 4. Consumer override = `service.setScorers([...defaults, mySemantic])`
 */
export type NluScorerList = readonly NluScorer[];
