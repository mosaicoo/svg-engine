import { Injectable, signal, type Signal } from '@angular/core';
import type { Disposable } from 'svg-engine/core';

import { resolveActionCanonical, type ActionCanonical } from './dictionaries/actions';
import { fuzzyMatchAny } from './parsers/fuzzy-match';
import { extractSlots } from './parsers/slot-extractor';
import { tokenize } from './parsers/tokenize';
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
    return {
      dispose: () => {
        this._intents.set(this._intents().filter((i) => i.id !== intent.id));
      },
    };
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
    const threshold = options.threshold ?? 0.3;
    const maxResults = options.maxResults ?? 5;

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

      matches.push({
        kind: 'keyword',
        term: keywordMatch.term,
        token: keywordMatch.token,
        distance: keywordMatch.distance,
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
      const keywordWeight = hasAction && hasSlots ? 0.5 : hasAction ? 0.55 : hasSlots ? 0.65 : 0.75;
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
          });
          // Soma um bônus de até 0.25
          score = Math.min(1, score + 0.25 * directAction.score);
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
                });
                score = Math.min(1, score + 0.2);
                break;
              }
            }
          }
        }
      }

      // ── (c) Slot extraction ──
      const slotSchemas = intent.slots ?? {};
      const slotNames = Object.keys(slotSchemas);
      const extractedSlots = extractSlots(tokens, slotSchemas);

      // Penalidades / bônus por slots
      let requiredMissing = 0;
      let optionalFilled = 0;
      for (const name of slotNames) {
        const filled = extractedSlots[name] !== undefined;
        const schema = slotSchemas[name];
        if (filled) {
          if (schema.optional === true) {
            optionalFilled++;
            matches.push({
              kind: 'slot',
              term: name,
              token: String(extractedSlots[name]),
              distance: 0,
            });
          }
        } else if (schema.optional !== true) {
          requiredMissing++;
        }
      }
      score -= requiredMissing * 0.15;
      score += optionalFilled * 0.05;
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
      if (Math.abs(diff) > 0.05) return diff;
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
    const auto = options.autoExecuteThreshold ?? 0.7;
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

    await top.intent.execute(top.slots, ctx);
    return { executed: true, candidate: top, alternatives, rejection: null };
  }
}

// Re-export NluMatchReason for callers walking `candidate.matches`.
export type { NluMatchReason } from './types';
