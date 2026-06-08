import type { Injector } from '@angular/core';

/**
 * **NLU (Natural Language Understanding) types — D-046 Fase 1**
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
  | {
      readonly kind: 'number';
      readonly optional?: boolean;
      readonly default?: number;
      readonly anchorKeywords?: readonly string[];
      /**
       * Quando `false`, o slot **não** é preenchido pelo pass posicional
       * genérico — só por pre-passes específicos (ex.: `count` da
       * repetição, extraído como "número antes de uma forma"). Evita que
       * um número de dimensão seja capturado como contagem por engano.
       * Default `true` (positional).
       */
      readonly positional?: boolean;
    }
  | {
      readonly kind: 'color';
      readonly optional?: boolean;
      readonly default?: string;
      readonly anchorKeywords?: readonly string[];
    }
  | {
      readonly kind: 'shape';
      readonly optional?: boolean;
      readonly default?: string;
      readonly anchorKeywords?: readonly string[];
    }
  | {
      readonly kind: 'enum';
      readonly values: readonly string[];
      readonly optional?: boolean;
      readonly default?: string;
      readonly anchorKeywords?: readonly string[];
      /**
       * Quando `false`, o match do enum é **exato** (apenas
       * `values.includes(token)`), sem fuzzy Levenshtein. Use para
       * vocabulários curtos em que o fuzzy geraria falso-positivo
       * (ex.: layout `'grade'` casaria `'grande'` por distância 1).
       * Default `true` (fuzzy ligado).
       */
      readonly fuzzy?: boolean;
    }
  | {
      readonly kind: 'string';
      readonly optional?: boolean;
      readonly default?: string;
      readonly anchorKeywords?: readonly string[];
    }
  | {
      /**
       * **`point`** — extrai par `{ x, y }` de **dois números adjacentes**
       * (ex: "100 50" ou "100x50"). Combinar com `anchorKeywords`
       * (`['posicao','position','em','at']`) pra desambiguar de outros
       * slots numéricos no mesmo intent.
       */
      readonly kind: 'point';
      readonly optional?: boolean;
      readonly default?: { readonly x: number; readonly y: number };
      readonly anchorKeywords?: readonly string[];
    }
  | {
      /**
       * **`gradient`** — preenchimento por gradiente. Extraído **só** por
       * um pre-pass dedicado e **só quando a palavra-chave** ("gradiente"/
       * "degradê"/"degrade"/"gradient") aparece — assim cores sólidas
       * ("amarelo", "vermelho") seguem 100% intactas. O valor extraído é
       * `{ kind: 'linear'|'radial', direction: 'horizontal'|'vertical'|
       * 'diagonal', colors: string[] }`: o handler deriva os stops (1 cor
       * → clara→escura; N cores → distribuídas) e a geometria. Nunca é
       * posicional (não compete com o slot `fill`).
       */
      readonly kind: 'gradient';
      readonly optional?: boolean;
      /** Não usado (gradient é só pre-pass) — presente p/ uniformidade do union. */
      readonly anchorKeywords?: readonly string[];
    };

/**
 * **`anchorKeywords`** — palavras que precedem o valor do slot no
 * input ("**borda** azul" → slot `stroke=azul`; "**posição** 100 50"
 * → slot `position={x:100,y:50}`).
 *
 * Como funciona:
 * 1. Extractor faz primeiro um **pass anchored**: pra cada slot com
 *    `anchorKeywords`, procura o anchor token (exato ou fuzzy ≤1) e
 *    consome o(s) próximo(s) token(s) compatível(eis) com o `kind`.
 * 2. Depois faz o pass **posicional** normal pros slots sem anchor.
 * 3. Tokens já consumidos no anchored pass ficam de fora do posicional
 *    — evita dupla atribuição.
 *
 * Útil quando o mesmo intent tem múltiplos slots de mesmo `kind`
 * (e.g., `create-shape` com `fill` + `stroke` ambos `kind: 'color'`):
 * sem âncora, o extractor pega a primeira cor pra `fill` e ignora a
 * segunda. Com âncora `'borda'/'contorno'/'stroke'`, "fill vermelho
 * borda azul" produz `{fill:'red', stroke:'blue'}` corretamente.
 */

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
   * **`requiredAllGroups`** (D-046 review-7) — strict-AND matching:
   * cada **grupo** representa um elemento semântico do intent que
   * DEVE estar presente no input (pelo menos uma palavra do grupo
   * casa, exato ou fuzzy). Diferente de `keywords` (OR fraco),
   * requiredAllGroups exige TODOS os grupos preenchidos.
   *
   * **Caso de uso típico**: intents auto-descobertos de menu items
   * multi-token como "Select All" precisam garantir que TANTO o
   * verbo (select / selecionar / selecione) QUANTO o qualificador
   * (all / tudo / todos) apareçam — senão "selecione estrela"
   * matcharia "Select All" e selecionaria tudo erradamente.
   *
   * **Estrutura**: array de grupos; cada grupo é array de variantes
   * sinônimas pra uma posição semântica. Exemplo "Select All":
   * ```
   * requiredAllGroups: [
   *   ['select', 'selecionar', 'selecione', 'marcar', ...],  // verbo
   *   ['all', 'tudo', 'todos', 'todas', 'everything'],        // qualificador
   * ]
   * ```
   *
   * Quando `requiredAllGroups` é declarado, o `keywords` ainda é
   * usado pra ranking de confidence mas o **gate** de candidato vira
   * o requiredAllGroups (todos satisfeitos OR keywords match com ≥1
   * candidato — política pragmática).
   */
  readonly requiredAllGroups?: readonly (readonly string[])[];
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
  /**
   * Índice do token no array de input (D-046 review-10).
   *
   * Quando `kind === 'slot'`, é `-1` (slot value não é necessariamente
   * um único token — pode ter sido extraído de uma frase de cor ou
   * `kind: 'point'` compondo 2 números).
   *
   * Para `kind: 'keyword'` ou `'action'`, é o índice exato do token
   * que casou. Usado pelo extractor pra marcar consumed e evitar
   * dupla atribuição (resolve bug de `tokens.indexOf(value)` retornando
   * sempre 1ª ocorrência em inputs com tokens repetidos).
   */
  readonly tokenIndex?: number;
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
    | 'execute-error'
    | null;
  /**
   * Erro capturado quando `rejection === 'execute-error'` (D-046
   * review-10 / M4). Service envolve `intent.execute()` em try/catch
   * — handler que lança não derruba a UI nem deixa Promise pendurada.
   */
  readonly error?: Error;
}
