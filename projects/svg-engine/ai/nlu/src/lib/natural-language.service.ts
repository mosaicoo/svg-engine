import { Injectable, signal, type Signal } from '@angular/core';
import type { Disposable } from 'svg-engine/core';

import { resolveActionCanonical, type ActionCanonical } from './dictionaries/actions';
import { resolveColorName } from './dictionaries/colors';
import { resolveShapeKind } from './dictionaries/shapes';
import { isStopword } from './dictionaries/stopwords';
import { fuzzyMatchAny } from './parsers/fuzzy-match';
import { extractSlots } from './parsers/slot-extractor';
import { tokenize } from './parsers/tokenize';
import {
  ACTION_BONUS_CANONICAL,
  ACTION_BONUS_DIRECT,
  AUTO_EXECUTE_THRESHOLD,
  DEFAULT_MAX_RESULTS,
  DEFAULT_PARSE_THRESHOLD,
  DESCRIPTION_BOOST_MAX,
  DESCRIPTION_BOOST_PER_HIT,
  KEYWORD_WEIGHT_ACTION_ONLY,
  KEYWORD_WEIGHT_FULL,
  KEYWORD_WEIGHT_KEYWORDS_ONLY,
  KEYWORD_WEIGHT_SLOTS_ONLY,
  SLOT_BONUS_ANCHORED,
  SLOT_BONUS_OPTIONAL,
  SLOT_BONUS_REQUIRED,
  SLOT_PENALTY_REQUIRED_MISSING,
  TIEBREAKER_EPSILON,
} from './scoring/scoring-constants';
import type {
  NluCandidate,
  NluContext,
  NluExecuteOptions,
  NluExecuteResult,
  NluIntent,
  NluMatchReason,
  NluParseOptions,
} from './types';

/**
 * **`NaturalLanguageService`** — D-046? Fase 1 (rule-based NLU).
 *
 * Singleton root-provided que registra {@link NluIntent}s e
 * traduz texto livre em comandos dispatcháveis. Composição direta
 * dos parsers (`tokenize` → `fuzzyMatch` → `extractSlots`) com
 * scoring de confidence.
 *
 * **Algoritmo de `parse(text)`**:
 *
 * 1. **Tokenize**: lowercase + deacento + split (preserva números/hex).
 * 2. **Para cada intent registrado**, calcula `score`:
 *    a. **Keywords**: fuzzy match com adaptive distance. Se nenhuma
 *       keyword bate (nem aproximada), pula a intent. Score base do
 *       melhor match.
 *    b. **Action keywords** (opcional): match contra `actionKeywords`
 *       da intent + lookup canonical no `ACTION_DICTIONARY`. Eleva
 *       score quando casa.
 *    c. **Slots**: extrai com `extractSlots`. Slots obrigatórios não
 *       preenchidos penalizam (subtrai 0.15 cada). Slots opcionais
 *       preenchidos elevam levemente (0.05 cada).
 *    d. **Penalidade por distância**: cada match fuzzy não-exato
 *       reduz o score proporcionalmente.
 * 3. **Sort + filter** por threshold + cap em `maxResults`.
 *
 * **`execute(text)`**: parse + auto-execute se ≥ `autoExecuteThreshold`
 * (default 0.7), respeitando `confirmGate` pra destrutivos.
 *
 * **Multi-editor (D-042/D-043)**: o `NluContext` recebido pelos
 * handlers tem `injector` do consumer — services devem ser resolvidos
 * dele, nunca cacheados em closure.
 *
 * **Por que `Injectable({ providedIn: 'root' })`**: o registry de
 * intents é global (todos os editors compartilham a definição), mas
 * a EXECUÇÃO é per-scope via `NluContext.injector`. Mesmo padrão
 * que `MenuContributionRegistry`.
 */
@Injectable({ providedIn: 'root' })
export class NaturalLanguageService {
  private readonly _intents = signal<readonly NluIntent[]>([]);

  /** Snapshot reativo dos intents registrados (insertion order). */
  readonly intents: Signal<readonly NluIntent[]> = this._intents.asReadonly();

  /**
   * **Cache de description tokens por intent** — usado pelo
   * description-matching pass (meio-termo "semantic disambiguator"
   * SEM ML deps). Computado lazy quando o intent aparece pela 1ª vez
   * num scoring run; invalidado quando o intent é desregistrado.
   *
   * **Por que cache**: tokenize + filter stopwords é ~10ms por
   * description, e o parse roda em cada keystroke do usuário —
   * computar 30+ intents toda vez ficaria perceptível.
   */
  private readonly descriptionTokensCache = new Map<string, ReadonlySet<string>>();

  /**
   * Registra um intent novo. Retorna `Disposable` pra remover (em geral
   * trackeada pelo plugin via `ctx.track()` igual aos outros registries).
   *
   * **Erros**:
   * - Throw em `id` vazio
   * - Throw em `id` duplicado
   * - Throw em `keywords` vazio (intent sem keyword nunca seria matched)
   */
  registerIntent(intent: NluIntent): Disposable {
    if (typeof intent.id !== 'string' || intent.id.length === 0) {
      throw new Error('NaturalLanguageService.registerIntent: intent.id must be non-empty');
    }
    if (!Array.isArray(intent.keywords) || intent.keywords.length === 0) {
      throw new Error(
        `NaturalLanguageService.registerIntent: intent "${intent.id}" must declare at least one keyword`,
      );
    }
    if (this._intents().some((i) => i.id === intent.id)) {
      throw new Error(
        `NaturalLanguageService.registerIntent: intent "${intent.id}" is already registered`,
      );
    }
    this._intents.set([...this._intents(), intent]);
    // **D-046 review-10 (H4)**: pre-cache descriptionTokens AGORA
    // (no register, não lazy no parse). Elimina o cold-cache miss
    // na 1ª keystroke do user.
    this.populateDescriptionCache(intent);
    return {
      dispose: () => {
        this._intents.set(this._intents().filter((i) => i.id !== intent.id));
        this.descriptionTokensCache.delete(intent.id);
      },
    };
  }

  /**
   * Tokeniza + filtra description do intent e armazena no cache.
   * No-op se o intent não tem description ou já está cached.
   */
  private populateDescriptionCache(intent: NluIntent): void {
    if (this.descriptionTokensCache.has(intent.id)) return;
    const desc = intent.description;
    if (typeof desc !== 'string' || desc.length === 0) {
      // Cacheia Set vazio pra evitar re-check repetido
      this.descriptionTokensCache.set(intent.id, new Set());
      return;
    }
    const all = tokenize(desc);
    const filtered = new Set(all.filter((t) => !isStopword(t) && t.length >= 3));
    this.descriptionTokensCache.set(intent.id, filtered);
  }

  /**
   * **Description-matching boost** (meio-termo "semantic disambiguator"
   * sem ML deps).
   *
   * Tokeniza a `description` do intent (sem stopwords) e conta hits
   * vs tokens do input. Cada hit adiciona +0.04 (cap 0.2 total). Não
   * substitui keyword matching — só complementa quando há candidatos
   * com score próximo (e.g., dois intents com keyword exata, ambos
   * 0.65; o de description mais alinhada vence).
   *
   * **Cache**: tokens da description são computados na 1ª chamada
   * e guardados em `descriptionTokensCache` keyed por `intent.id`.
   *
   * **Quando contribui**: SEMPRE — score é monotônico. UI consumers
   * que queiram desligar podem passar `options.disableDescriptionBoost`
   * (não implementado ainda — Fase 2 quando ML chegar e a heurística
   * for mais relevante).
   */
  private descriptionBoost(intent: NluIntent, inputTokens: readonly string[]): number {
    // **D-046 review-10 (H4)**: cache é pre-populado no register, então
    // só lookup aqui (zero tokenize em hot path). Defensive: re-populate
    // se intent foi adicionado bypassing registerIntent (não suportado
    // oficialmente, mas previne crash).
    let descTokens = this.descriptionTokensCache.get(intent.id);
    if (descTokens === undefined) {
      this.populateDescriptionCache(intent);
      descTokens = this.descriptionTokensCache.get(intent.id);
    }
    if (descTokens === undefined || descTokens.size === 0) return 0;

    // Conta tokens do input que aparecem na description
    let hits = 0;
    const seen = new Set<string>();
    for (const tok of inputTokens) {
      if (seen.has(tok)) continue;
      if (isStopword(tok)) continue;
      if (descTokens.has(tok)) {
        hits++;
        seen.add(tok);
      }
    }
    // Cap configurável via DESCRIPTION_BOOST_MAX / DESCRIPTION_BOOST_PER_HIT
    const maxHits = DESCRIPTION_BOOST_MAX / DESCRIPTION_BOOST_PER_HIT;
    return Math.min(maxHits, hits) * DESCRIPTION_BOOST_PER_HIT;
  }

  /** Procura intent por id (`null` se ausente). */
  getIntent(id: string): NluIntent | null {
    return this._intents().find((i) => i.id === id) ?? null;
  }

  /**
   * Parse `text` em candidates ordenados por confidence desc.
   *
   * @param text input natural do usuário
   * @param _ctx NluContext (não usado no parse — só no execute; aqui
   *   mantido por simetria de API)
   * @param options threshold + maxResults
   */
  parse(text: string, _ctx: NluContext, options: NluParseOptions = {}): readonly NluCandidate[] {
    const threshold = options.threshold ?? DEFAULT_PARSE_THRESHOLD;
    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;

    const tokens = tokenize(text);
    if (tokens.length === 0) return [];

    // Lookup canonical de cada token (PT/EN → 'create'/'delete'/...).
    const tokenCanonicals = tokens.map((t) => resolveActionCanonical(t));

    const candidates: NluCandidate[] = [];
    for (const intent of this._intents()) {
      const matches: NluMatchReason[] = [];

      // ── (a) Keyword match — obrigatório (pelo menos uma) ──
      const keywordMatch = fuzzyMatchAny(tokens, intent.keywords);
      if (keywordMatch === null) continue; // nem candidato é

      // **`requiredAllGroups` gate** (D-046 review-7): se o intent
      // declarou grupos obrigatórios, TODOS devem ter match no input.
      // Evita "Select All" auto-discovered matchar "selecione estrela"
      // (que só tem o verbo, não tem o qualificador "tudo"/"all").
      if (intent.requiredAllGroups !== undefined && intent.requiredAllGroups.length > 0) {
        let allGroupsMatched = true;
        for (const group of intent.requiredAllGroups) {
          if (group.length === 0) continue; // grupo vazio = sempre OK (defensivo)
          const groupMatch = fuzzyMatchAny(tokens, group);
          if (groupMatch === null) {
            allGroupsMatched = false;
            break;
          }
        }
        if (!allGroupsMatched) continue; // gate falhou → não é candidato
      }

      matches.push({
        kind: 'keyword',
        term: keywordMatch.term,
        token: keywordMatch.token,
        distance: keywordMatch.distance,
        tokenIndex: keywordMatch.tokenIndex,
      });

      // **Adaptive scoring**: o peso do keyword match depende de QUAIS
      // componentes a intent declara. Intent com só `keywords` (sem
      // action, sem slots) tem peso alto (0.9) — keyword sozinho é
      // toda a informação disponível. Quando há `actionKeywords` ou
      // slots, o peso da keyword baixa pra deixar headroom pros
      // outros componentes elevarem a confidence.
      //
      // Caso típico:
      // - Intent só-keywords ("undo" via auto-discovery do menu): peso 0.9
      //   → "undo" exato vira score 0.9 (auto-execute)
      // - Intent com actionKeywords ("create rect"): peso 0.6 + action 0.25
      //   → "create rect" exato vira score 0.85 (auto-execute)
      // - Intent com slots ("create rect 100x50 red"): peso 0.55 + slots
      //   → comando completo chega ~0.95
      const hasAction = (intent.actionKeywords?.length ?? 0) > 0;
      const hasSlots = Object.keys(intent.slots ?? {}).length > 0;
      // Pesos calibrados pra que (a) intent só-keyword com match exato
      // fique acima do auto-execute threshold de 0.7 ("undo" via
      // auto-discovery → 0.75), e (b) intent com action+keyword match
      // exato seja preferida sobre só-keyword (action 0.2 + keyword 0.55
      // = 0.75, empatado, tiebreaker por matchCount escolhe).
      const keywordWeight =
        hasAction && hasSlots
          ? KEYWORD_WEIGHT_FULL
          : hasAction
            ? KEYWORD_WEIGHT_ACTION_ONLY
            : hasSlots
              ? KEYWORD_WEIGHT_SLOTS_ONLY
              : KEYWORD_WEIGHT_KEYWORDS_ONLY;
      let score = keywordWeight * keywordMatch.score;

      // ── (b) Action keyword — opcional, eleva score ──
      const actionTerms = intent.actionKeywords;
      if (actionTerms !== undefined && actionTerms.length > 0) {
        // Tenta match direto contra as actionKeywords declaradas...
        const directAction = fuzzyMatchAny(tokens, actionTerms);
        if (directAction !== null) {
          matches.push({
            kind: 'action',
            term: directAction.term,
            token: directAction.token,
            distance: directAction.distance,
            tokenIndex: directAction.tokenIndex,
          });
          // Soma um bônus de até ACTION_BONUS_DIRECT
          score = Math.min(1, score + ACTION_BONUS_DIRECT * directAction.score);
        } else {
          // ...ou via canonical lookup (e.g., intent declara ['create']
          // mas o usuário disse 'desenhar' → canonical 'create' bate).
          const desired = new Set<ActionCanonical>(
            actionTerms
              .map((a) => resolveActionCanonical(a))
              .filter((c): c is ActionCanonical => c !== null),
          );
          if (desired.size > 0) {
            for (let i = 0; i < tokenCanonicals.length; i++) {
              const c = tokenCanonicals[i];
              if (c !== null && desired.has(c)) {
                matches.push({
                  kind: 'action',
                  term: c,
                  token: tokens[i],
                  distance: 0,
                  tokenIndex: i,
                });
                score = Math.min(1, score + ACTION_BONUS_CANONICAL);
                break;
              }
            }
          }
        }
      }

      // ── (c) Slot extraction ──
      // **CRÍTICO (D-046 review-4)**: marca consumed os índices dos
      // tokens que casaram com keywords/actions ANTES da extração.
      // Sem isso, o positional pass de cor pega 'borda' (keyword de
      // set-stroke) e fuzzy-matcha pra 'bordo' (#800020) por engano.
      //
      // **Exceção crítica**: keywords que TAMBÉM são valores de slot
      // (e.g., 'circulo' é keyword de create-shape MAS também precisa
      // virar slot `shape='circle'`) NÃO podem ser consumidas — senão
      // o positional pass do slot shape não as encontra.
      //
      // Regra: marca consumed UNLESS o token resolve em shape OU cor
      // (i.e., poderia ser slot value). Actions são SEMPRE consumed
      // (verbos nunca são slot values).
      const consumedIndices = new Set<number>();
      for (const m of matches) {
        if (m.kind === 'action') {
          // Action verbs (criar/delete) nunca são slot values → consume.
          // **D-046 review-10**: usa `tokenIndex` (capturado durante
          // fuzzyMatchAny) em vez de `tokens.indexOf(value)` reverso —
          // resolve bug onde tokens repetidos só marcavam a 1ª ocorrência.
          const idx = m.tokenIndex;
          if (typeof idx === 'number' && idx >= 0 && idx < tokens.length) {
            consumedIndices.add(idx);
          }
        } else if (m.kind === 'keyword') {
          // Keyword pode ser também slot value (shape/color); skip nesse caso.
          if (resolveShapeKind(m.token) !== null) continue;
          if (resolveColorName(m.token) !== null) continue;
          const idx = m.tokenIndex;
          if (typeof idx === 'number' && idx >= 0 && idx < tokens.length) {
            consumedIndices.add(idx);
          }
        }
      }
      const slotSchemas = intent.slots ?? {};
      const slotNames = Object.keys(slotSchemas);
      const extractedSlots = extractSlots(tokens, slotSchemas, { consumedIndices });

      // Penalidades / bônus por slots
      let requiredMissing = 0;
      let optionalFilled = 0;
      let requiredFilled = 0;
      let anchoredFilled = 0; // D-046 review-6: slots preenchidos via anchor
      for (const name of slotNames) {
        const filled = extractedSlots[name] !== undefined;
        const schema = slotSchemas[name];
        if (filled) {
          // Record match reason whether optional ou required — o
          // usuário forneceu informação semântica de qualquer modo.
          // `tokenIndex: -1` pra slots porque o valor pode ter vindo
          // de uma frase composta (color phrase, point) — não há 1-to-1.
          matches.push({
            kind: 'slot',
            term: name,
            token: String(extractedSlots[name]),
            distance: 0,
            tokenIndex: -1,
          });
          if (schema.optional === true) {
            optionalFilled++;
          } else {
            requiredFilled++;
          }
          // **Anchored bonus** (D-046 review-6): se o slot tem
          // `anchorKeywords` declarado E foi preenchido (só seria via
          // anchor agora que slot-extractor é anchor-only), conta como
          // signal extra-forte. Resolve "move pra posição 10 50" →
          // move-to-position vence move-selected, porque o anchor
          // 'posicao' explícito vale mais que matching positional
          // genérico de 2 numbers.
          if (schema.anchorKeywords !== undefined && schema.anchorKeywords.length > 0) {
            anchoredFilled++;
          }
        } else if (schema.optional !== true) {
          requiredMissing++;
        }
      }
      // Required preenchidos recompensam levemente (simétrico com
      // optional). Antes do fix, "pinta de vermelho" tinha score 0.65
      // (abaixo de auto-execute) porque o required slot `color`
      // preenchido não elevava — agora vira 0.75 (auto-execute).
      score -= requiredMissing * SLOT_PENALTY_REQUIRED_MISSING;
      score += optionalFilled * SLOT_BONUS_OPTIONAL;
      score += requiredFilled * SLOT_BONUS_REQUIRED;
      score += anchoredFilled * SLOT_BONUS_ANCHORED;

      // ── (d) Description boost (D-046 review-4 meio-termo) ──
      // Tokens do input que aparecem na description do intent
      // adicionam +0.04 cada (cap 0.20). Resolve ambiguidades quando
      // dois intents têm keyword match similar mas só um descreve a
      // ação pretendida — sem dependência ML.
      score += this.descriptionBoost(intent, tokens);

      score = Math.max(0, Math.min(1, score));

      if (score >= threshold) {
        candidates.push({
          intent,
          confidence: score,
          slots: extractedSlots,
          matches,
        });
      }
    }

    // **Sort**: confidence desc. Tiebreaker: quando confidences são
    // próximos (Δ ≤ 0.05), prefere a intent com MAIS matches —
    // mais matches = mais informação extraída = melhor encaixe.
    // Isso resolve o caso "criar retangulo" entre intent que declara
    // só keyword (`retangulo`) vs intent que declara action+keyword
    // (`criar`+`retangulo`): ambas têm scores parecidos, mas a
    // segunda capturou DOIS componentes do input — deve vencer.
    candidates.sort((a, b) => {
      const diff = b.confidence - a.confidence;
      if (Math.abs(diff) > TIEBREAKER_EPSILON) return diff;
      return b.matches.length - a.matches.length;
    });
    return candidates.slice(0, maxResults);
  }

  /**
   * Parse + dispatch o top candidate.
   *
   * **Política**:
   * - `intent.destructive === true` SEM `confirmGate` → rejeita
   *   (defesa contra delete acidental).
   * - `confidence ≥ autoExecuteThreshold` (default 0.7) → executa direto
   *   (ou via confirmGate quando destrutivo).
   * - `confidence < autoExecuteThreshold` E `confirmGate` presente →
   *   chama o gate; só executa se retornar `true`.
   * - Senão → rejeita com `'below-threshold'`.
   */
  async execute(
    text: string,
    ctx: NluContext,
    options: NluExecuteOptions = {},
  ): Promise<NluExecuteResult> {
    const candidates = this.parse(text, ctx, options);
    const auto = options.autoExecuteThreshold ?? AUTO_EXECUTE_THRESHOLD;
    const gate = options.confirmGate ?? null;

    if (candidates.length === 0) {
      return {
        executed: false,
        candidate: null,
        alternatives: [],
        rejection: 'no-match',
      };
    }

    const top = candidates[0];
    const alternatives = candidates.slice(1);

    // Destrutivo sem gate → never auto-execute
    if (top.intent.destructive === true && gate === null) {
      return {
        executed: false,
        candidate: top,
        alternatives,
        rejection: 'destructive-no-gate',
      };
    }

    const needsConfirm = top.intent.destructive === true || top.confidence < auto;
    if (needsConfirm) {
      if (gate === null) {
        return {
          executed: false,
          candidate: top,
          alternatives,
          rejection: 'below-threshold',
        };
      }
      const ok = await gate(top);
      if (!ok) {
        return {
          executed: false,
          candidate: top,
          alternatives,
          rejection: 'confirmation-declined',
        };
      }
    }

    // **D-046 review-10 (M4)**: try/catch defensivo — handlers de
    // intents podem lançar (sync ou async). Sem isso, erro poluía
    // a Promise do execute() e UI ficava sem feedback.
    try {
      await top.intent.execute(top.slots, ctx);
      return { executed: true, candidate: top, alternatives, rejection: null };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (typeof console !== 'undefined') {
        console.error(`[svge.nlu] execute failed in intent "${top.intent.id}":`, error);
      }
      return {
        executed: false,
        candidate: top,
        alternatives,
        rejection: 'execute-error',
        error,
      };
    }
  }

  /**
   * Executa um candidate **específico** (escolhido pelo usuário via UI
   * — e.g., clique numa alternativa) aplicando as mesmas regras de
   * segurança do {@link execute}: destructive sem gate rejeita;
   * confidence baixa sem gate rejeita.
   *
   * **Por que precisa de método separado**: chamar `candidate.intent.execute()`
   * direto bypassa toda a lógica de threshold/destructive. UI components
   * (`<svge-nlu-input>` alternatives list) DEVEM usar este método em
   * vez de `intent.execute()` direto, pra preservar a defesa contra
   * delete acidental.
   *
   * **Política idêntica ao `execute`**:
   * - Destrutivo SEM `confirmGate` → rejeita `'destructive-no-gate'`.
   * - Destrutivo COM gate → roda gate; só executa se aprovar.
   * - Não-destrutivo com confidence ≥ `autoExecuteThreshold` → executa.
   * - Não-destrutivo com confidence < threshold E gate presente →
   *   roda gate.
   * - Senão → `'below-threshold'`.
   *
   * @param candidate o NluCandidate a executar (vindo de `parse()`).
   * @param ctx contexto (injector do consumer).
   * @param options threshold + confirmGate.
   */
  async executeCandidate(
    candidate: NluCandidate,
    ctx: NluContext,
    options: NluExecuteOptions = {},
  ): Promise<NluExecuteResult> {
    const auto = options.autoExecuteThreshold ?? AUTO_EXECUTE_THRESHOLD;
    const gate = options.confirmGate ?? null;

    if (candidate.intent.destructive === true && gate === null) {
      return {
        executed: false,
        candidate,
        alternatives: [],
        rejection: 'destructive-no-gate',
      };
    }

    const needsConfirm = candidate.intent.destructive === true || candidate.confidence < auto;
    if (needsConfirm) {
      if (gate === null) {
        return {
          executed: false,
          candidate,
          alternatives: [],
          rejection: 'below-threshold',
        };
      }
      const ok = await gate(candidate);
      if (!ok) {
        return {
          executed: false,
          candidate,
          alternatives: [],
          rejection: 'confirmation-declined',
        };
      }
    }

    // **D-046 review-10 (M4)**: try/catch defensivo (vide execute()).
    try {
      await candidate.intent.execute(candidate.slots, ctx);
      return { executed: true, candidate, alternatives: [], rejection: null };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (typeof console !== 'undefined') {
        console.error(
          `[svge.nlu] executeCandidate failed in intent "${candidate.intent.id}":`,
          error,
        );
      }
      return {
        executed: false,
        candidate,
        alternatives: [],
        rejection: 'execute-error',
        error,
      };
    }
  }
}

// Re-export NluMatchReason for callers walking `candidate.matches`.
export type { NluMatchReason } from './types';
