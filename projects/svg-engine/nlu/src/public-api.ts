/*
 * Public API surface of `svg-engine/nlu` — D-046 Fase 1.
 *
 * **NLU (Natural Language Understanding) — rule-based, headless,
 * zero ML, zero download, offline.**
 *
 * Traduz texto natural ("criar retângulo vermelho 100x50", "undo",
 * "deletar seleção") em comandos dispatcháveis no `CommandBus` via:
 * - **Regex + dicionário multilíngue PT/EN** (cores, formas, ações)
 * - **Levenshtein fuzzy matching** (tolerância a typos)
 * - **Auto-discovery do `MenuContributionRegistry`** (todo menu item
 *   já registrado vira intent NLU automaticamente)
 *
 * **Por que entry point separado** (decisão revista 2026-05-22):
 *
 * Os Modos D-037 (headless puro / shell parcial / shell completo)
 * devem poder consumir `svg-engine/edit` SEM pagar o custo da camada
 * AI. Isolar `nlu` em entry point próprio garante:
 * - Tree-shake real (consumer só importa se quiser NLU).
 * - Preparação transparente para Fase 2 (`svg-engine/nlu-ml` com
 *   Transformers.js ~30–50MB) e Fase 3 (`svg-engine/nlu-slm` com
 *   WebLLM 500MB+) — cada uma carrega seu próprio peso.
 * - Consistência arquitetural: TODA a camada AI desacoplada (Modo 1
 *   sem dependência mesmo após Fase 2/3 chegarem).
 *
 * **Headless boundary (D-017)**: este entry point depende apenas de
 * `@angular/core`, `svg-engine/core` e `svg-engine/edit`. **Nada de
 * Material/CDK** — UI fica em `svg-engine/nlu-ui` (entry separado
 * com `<svge-nlu-input>` + voice via Web Speech API).
 *
 * **Surface exportada**:
 * - {@link NaturalLanguageService} — singleton root, `registerIntent`
 *   / `parse` / `execute`
 * - Tipos: {@link NluIntent}, {@link NluContext}, {@link NluCandidate},
 *   {@link NluSlotSchema}, etc.
 * - {@link builtinNluPlugin} — bootstrap opt-in com auto-discovery
 *   dos menu items + intents customizados (`create-shape`)
 * - {@link discoverMenuIntents} — helper para integrar registries customizados
 * - Dicionários: `COLOR_DICTIONARY`, `SHAPE_DICTIONARY`,
 *   `ACTION_DICTIONARY`, `STOPWORDS` (extensíveis por consumers)
 * - Parsers: `tokenize`, `levenshtein`, `fuzzyMatch*`, `extractSlots`
 *
 * **Roadmap** (vide D-046 em docs/04):
 * - **Fase 1 (este entry point)** ✅: rule-based, < 50 KB, cobre
 *   70–80% dos comandos comuns
 * - **Fase 2**: `svg-engine/nlu-ml` — intent classifier ML leve
 *   (Transformers.js, 30–50 MB lazy)
 * - **Fase 3**: `svg-engine/nlu-slm` — Small Language Model
 *   (WebLLM, 500 MB–2 GB lazy, WebGPU)
 *
 * Todas as fases reaproveitam o mesmo contrato {@link NluIntent} +
 * {@link NaturalLanguageService}.
 */

export * from './lib';
