/**
 * **NLU (Natural Language Understanding) — D-046 Fase 1.**
 *
 * Rule-based pipeline (regex + dicionário multilíngue PT/EN +
 * Levenshtein fuzzy matching) — zero ML, zero download, funciona
 * offline. Permite traduzir texto livre do usuário em comandos
 * dispatcháveis no `CommandBus`.
 *
 * **API pública**:
 * - {@link NaturalLanguageService} — registry + parse + execute
 * - {@link NluIntent} / {@link NluContext} / {@link NluCandidate} —
 *   contratos de intent + resultado
 * - {@link builtinNluPlugin} — bootstrap opt-in com auto-discovery
 *   dos menu items + intent `create-shape` exemplar
 * - Dictionaries: `COLOR_DICTIONARY`, `SHAPE_DICTIONARY`,
 *   `ACTION_DICTIONARY`, `STOPWORDS` (extensíveis por consumers)
 * - Parsers: `tokenize`, `levenshtein`, `fuzzyMatch*`, `extractSlots`
 *
 * **Fase 2 (ML classifier) e Fase 3 (SLM)**: entry points separados
 * (`svg-engine/ai/nlu-ml`, `svg-engine/ai/nlu-slm`) reaproveitarão o
 * mesmo contrato {@link NluIntent} / {@link NaturalLanguageService}.
 */

export * from './types';
export * from './natural-language.service';
export * from './menu-intent-discovery';
export * from './builtin-nlu.plugin';
export * from './parsers';
export * from './dictionaries';
// REVISÃO-SUPERFÍCIE: `scoring` (constantes + scorer.types) é plumbing
// interno do motor — não anunciado, não usado por consumidores
// (nlu-ui/apps). Removido da superfície pública. parsers/dictionaries
// permanecem (anunciados no docstring como extensíveis por consumidores).
export * from './dictionary-registry.service';
export * from './voice-provider';
// D-093 — LLM intent-resolver layer (Ollama provider + contract + resolver).
export * from './llm';
