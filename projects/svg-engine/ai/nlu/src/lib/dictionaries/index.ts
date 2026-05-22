/**
 * Public API surface of NLU dictionaries.
 *
 * **Merged dicts** (PT + EN; uso recomendado pra parser):
 * - `COLOR_DICTIONARY`, `SHAPE_DICTIONARY`, `ACTION_DICTIONARY`, `STOPWORDS`
 *
 * **Per-language dicts** (uso opcional pra ferramentas de auditoria,
 * UI hints, ou Fase 2 que carrega modelo do idioma certo):
 * - `*_PT` / `*_EN` — sub-dicts isolados.
 *
 * **Language detection**: {@link detectLanguage} usa contagem de hits
 * por dict pra estimar idioma dominante (PT/EN/unknown).
 */

// Merged dicts (default API)
export { COLOR_DICTIONARY, COLOR_KEYS, resolveColorName } from './colors';
export { SHAPE_DICTIONARY, SHAPE_KEYS, resolveShapeKind, type NluShapeKind } from './shapes';
export {
  ACTION_DICTIONARY,
  ACTION_KEYS,
  resolveActionCanonical,
  type ActionCanonical,
} from './actions';
export { STOPWORDS, isStopword } from './stopwords';

// Per-language sub-dicts (avançado / auditoria)
export { COLOR_DICTIONARY_PT } from './colors-pt';
export { COLOR_DICTIONARY_EN } from './colors-en';
export { SHAPE_DICTIONARY_PT } from './shapes-pt';
export { SHAPE_DICTIONARY_EN } from './shapes-en';
export { ACTION_DICTIONARY_PT } from './actions-pt';
export { ACTION_DICTIONARY_EN } from './actions-en';
export { STOPWORDS_PT } from './stopwords-pt';
export { STOPWORDS_EN } from './stopwords-en';

// Language detection
export { detectLanguage, type NluLanguage, type LanguageDetectResult } from './language-detect';
