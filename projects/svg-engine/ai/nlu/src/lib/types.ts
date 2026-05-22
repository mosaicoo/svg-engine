import type { Injector } from '@angular/core';

/**
 * **NLU (Natural Language Understanding) types — D-046? Fase 1**
 *
 * Rule-based natural-language → command pipeline. Zero ML, zero
 * external download — pure regex + dictionary + Levenshtein fuzzy
 * matching. Cobre ~70–80% dos comandos comuns ("undo", "delete",
 * "criar retângulo vermelho"). Fase 2 (ML classifier) e Fase 3 (SLM)
 * são entry points separados que reúsam esse mesmo contrato.
 *
 * **Entry point separado `svg-engine/ai/nlu`** (não dentro de `edit`)
 * pra que a camada AI fique 100% desacoplada — Modo 1 (headless puro
 * D-037) não importa nada de `ai/` quando não usar. Fase 2 e 3
 * (Transformers.js / WebLLM) entram em `svg-engine/ai/nlu-ml` e
 * `svg-engine/ai/nlu-slm`, ambos reaproveitando o contrato
 * {@link NluIntent} / {@link NaturalLanguageService} definido aqui.
 *
 * **Por que mirrors `MenuContributionContext`**: o NLU é uma surface
 * a mais (`<svge-menu-bar>`, `<svge-toolbar>`, `<svge-context-menu>`
 * + agora command palette por voz/texto). Mantém-se o mesmo
 * contrato multi-editor scope (D-042/D-043): `injector` na ctx,
 * services resolvidos lazy do scope ativo.
 */

/**
 * Per-fire context passed to {@link NluIntent.execute} (and to the
 * NLU service `parse` / `execute` entry points). Espelho exato do
 * {@link MenuContributionContext} pra que handlers reaproveitem a
 * mesma resolução de scope ativo (per-editor no D-042).
 */
export interface NluContext {
  /**
   * Injector do consumer (UI component que disparou o parse — command
   * palette, voice input, etc). Em apps route-scoped, é o injector
   * do editor ativo; em single-editor é equivalente ao root.
   */
  readonly injector: Injector;
}

/**
 * Tipo declarativo de slot que um intent pode extrair do input.
 *
 * **Variantes**:
 * - `number`: número decimal/inteiro (com unidade opcional como `px`).
 * - `color`: nome de cor (PT/EN via dicionário) OU hex `#rrggbb` /
 *   `rgb()` / `hsl()`, com suporte a **intensificadores adjacentes**
 *   ("azul claro", "verde bem escuro") via `parseColorPhrase`.
 * - `shape`: nome de forma (PT/EN via `SHAPE_DICTIONARY`) — resolve
 *   automaticamente "círculo"→`circle`, "retângulo"→`rect`,
 *   "balão"→`group`, etc. **Use este em vez de `enum` quando o
 *   slot for forma SVG** — `enum` exige match exato do canonical
 *   ('rect'), não suporta vocabulário PT/EN nem aliases semânticos.
 * - `enum`: valor de uma lista fechada (lookup case-insensitive,
 *   com fuzzy match dist ≤ 1). Use para domínios fechados sem
 *   vocabulário multilíngue (e.g., 'landscape'/'portrait').
 * - `string`: token livre — usado raramente, intent precisa ser
 *   tolerante a ruído.
 *
 * **`optional`**: quando `false` (default), confidence cai abaixo do
 * threshold se o slot não for preenchido. Quando `true`, o slot é
 * preenchido com `default` (ou `undefined`) e confidence mantém.
 */
export type NluSlotSchema =
  | { readonly kind: 'number'; readonly optional?: boolean; readonly default?: number }
  | {
      readonly kind: 'color';
      readonly optional?: boolean;
      readonly default?: string;
    }
  | {
      readonly kind: 'shape';
      readonly optional?: boolean;
      readonly default?: string;
    }
  | {
      readonly kind: 'enum';
      readonly values: readonly string[];
      readonly optional?: boolean;
      readonly default?: string;
    }
  | { readonly kind: 'string'; readonly optional?: boolean; readonly default?: string };

/**
 * Definição de um intent registrável no {@link NaturalLanguageService}.
 *
 * **Filosofia**:
 * - `keywords`: palavras-chave **disparadoras** (PT/EN). Match exato
 *   (após tokenize/deacento) vira anchor da intent — se nenhuma
 *   keyword aparecer (mesmo aproximada via Levenshtein), o intent
 *   nem é considerado candidato.
 * - `slots`: opcionais; cada um declara `kind` (number/color/enum/string)
 *   e se é `optional`. Extractor preenche o que conseguir.
 * - `execute`: handler que recebe slots já extraídos + ctx. MUST NOT
 *   throw — falhas devem ser logged + ignored (assim como
 *   `MenuContribution.run`).
 *
 * **Multi-editor (D-042/D-043)**: `execute` recebe `NluContext` e
 * deve resolver services do `ctx.injector` — não capturar root
 * services em closures.
 *
 * **Exemplo**:
 * ```ts
 * nlu.registerIntent({
 *   id: 'create-rect',
 *   keywords: ['rectangle', 'rect', 'retângulo', 'retangulo'],
 *   actionKeywords: ['create', 'add', 'criar', 'desenhar'],
 *   slots: {
 *     fill: { kind: 'color', optional: true },
 *     width: { kind: 'number', optional: true, default: 100 },
 *     height: { kind: 'number', optional: true, default: 100 },
 *   },
 *   execute(slots, ctx) {
 *     const bus = ctx.injector.get(CommandBus);
 *     bus.dispatch(new InsertNodeCommand(rootId, createRect({...}, {style: {fill: slots.fill}})));
 *   },
 * });
 * ```
 */
export interface NluIntent {
  /** Stable unique id. Reverse-DNS recommended (`svge.builtin.nlu.create-rect`). */
  readonly id: string;
  /**
   * Palavras-chave **primárias** que identificam o intent (substantivos,
   * objetos: "rectangle", "retângulo", "circle", "círculo", "selection").
   * Pelo menos uma deve aparecer (exato ou fuzzy ≤ 2 dist) pra intent
   * ser candidato. Comparação após `tokenize` (lowercase + deacento).
   */
  readonly keywords: readonly string[];
  /**
   * Verbos / ações associadas (opcional): "create", "criar", "add",
   * "desenhar", "delete", "deletar". Quando presente, eleva confidence
   * mas não é obrigatório — alguns intents são triggados só pelo
   * substantivo ("rectangle" sozinho pode criar um). Útil pra
   * desambiguar intents que compartilham keywords (e.g.,
   * "delete circle" vs "create circle").
   */
  readonly actionKeywords?: readonly string[];
  /** Schema dos slots extraíveis (por nome). */
  readonly slots?: Record<string, NluSlotSchema>;
  /**
   * Marca o intent como **destrutivo** — UI deve pedir confirmação
   * antes de executar (mesmo confidence alta). Ex: delete, clear,
   * reset all. Default `false`.
   */
  readonly destructive?: boolean;
  /** Hint humano pra UI exibir como sugestão / autocomplete. */
  readonly description?: string;
  /** Handler executado quando o intent é o top candidate + acima do threshold. */
  execute(slots: Record<string, unknown>, ctx: NluContext): void | Promise<void>;
}

/**
 * Resultado de {@link NaturalLanguageService.parse} — um candidato
 * que casou com o input, com confidence + slots extraídos. Ordenado
 * por confidence desc.
 */
export interface NluCandidate {
  /** Intent que casou. */
  readonly intent: NluIntent;
  /**
   * Confidence em `[0, 1]`.
   * - `≥ 0.7`: executa direto.
   * - `0.4–0.7`: pede confirmação (UI decide via threshold configurável).
   * - `< 0.4`: rejeita (parse retorna candidate mesmo assim — UI usa
   *   pra sugerir alternativas).
   */
  readonly confidence: number;
  /** Slots extraídos do input (preenche `default` quando ausente). */
  readonly slots: Record<string, unknown>;
  /**
   * Razões que levaram ao score — útil pra debug + UI explicar
   * "achei isso porque casou 'criar' (exato) e 'retângulo' (fuzzy)".
   */
  readonly matches: readonly NluMatchReason[];
}

/** Detalhe de um match individual contribuindo pro confidence. */
export interface NluMatchReason {
  /** O que casou: keyword, actionKeyword, ou slot. */
  readonly kind: 'keyword' | 'action' | 'slot';
  /** O termo da intent que foi matched. */
  readonly term: string;
  /** O token do input que casou (após tokenize). */
  readonly token: string;
  /** Distância de Levenshtein (0 = exato). */
  readonly distance: number;
}

/**
 * Threshold semântico do parse. UI consumers podem customizar via
 * `parse(text, ctx, { threshold: 0.5 })`.
 */
export interface NluParseOptions {
  /** Mínimo confidence pra candidate ser retornado. Default `0.3`. */
  readonly threshold?: number;
  /** Máximo de candidates retornados (ordenados por confidence). Default `5`. */
  readonly maxResults?: number;
}

/**
 * Threshold semântico do execute. UI consumers podem customizar.
 */
export interface NluExecuteOptions extends NluParseOptions {
  /**
   * Confidence mínima pra dispatchar direto. Default `0.7`.
   * Abaixo disso, o `confirmGate` decide.
   */
  readonly autoExecuteThreshold?: number;
  /**
   * Hook opcional pra confirmação interativa (e.g., mostrar dialog
   * com "Você quis dizer: criar retângulo?"). Recebe o top candidate
   * e retorna se deve executar.
   *
   * **Default**: `null` — sem confirmação, executa qualquer
   * candidate ≥ `autoExecuteThreshold`, rejeita os abaixo.
   *
   * **Destrutivos**: quando `intent.destructive === true`,
   * `confirmGate` é **obrigatório** — sem ele, intents destrutivos
   * são sempre rejeitados (defesa contra dispatch acidental de
   * delete/clear via fuzzy match ruim).
   */
  readonly confirmGate?: ((candidate: NluCandidate) => boolean | Promise<boolean>) | null;
}

/**
 * Resultado final de {@link NaturalLanguageService.execute}.
 */
export interface NluExecuteResult {
  /** `true` se um candidate foi executado, `false` se rejeitado / abaixo do threshold / sem match. */
  readonly executed: boolean;
  /** O candidate executado (ou top candidate quando `executed === false`, pra UI exibir alternativas). */
  readonly candidate: NluCandidate | null;
  /**
   * Lista de candidates considerados (top N por confidence). Útil
   * pra UI mostrar "também achei: ...".
   */
  readonly alternatives: readonly NluCandidate[];
  /** Por que não executou (`null` quando `executed === true`). */
  readonly rejection:
    | 'no-match'
    | 'below-threshold'
    | 'confirmation-declined'
    | 'destructive-no-gate'
    | null;
}
