/**
 * **Language detection** — PT vs EN baseado em contagem de hits nos
 * dicts por idioma.
 *
 * **Algoritmo**: pra cada token tokenizado, conta quantos hits ele
 * tem em cada dict (stopwords/actions/colors/shapes) por idioma.
 * Retorna o idioma com mais hits. Empate → `'unknown'`.
 *
 * **Por que rule-based em vez de ML lib**: zero deps, ~1ms latência,
 * cobre os 2 idiomas que o produto oficialmente suporta. Quando
 * adicionarmos ES/FR/DE, vale revisitar com modelo dedicado.
 *
 * **Uso**: informativo / instrumentação / UX hints. NÃO altera o
 * comportamento do parser (que consulta o merged dict sempre).
 * Util pra UI mostrar "idioma detectado: PT" e/ou pra Fase 2 ML
 * carregar modelo do idioma certo.
 */
import { ACTION_DICTIONARY_EN } from './actions-en';
import { ACTION_DICTIONARY_PT } from './actions-pt';
import { COLOR_DICTIONARY_EN } from './colors-en';
import { COLOR_DICTIONARY_PT } from './colors-pt';
import { SHAPE_DICTIONARY_EN } from './shapes-en';
import { SHAPE_DICTIONARY_PT } from './shapes-pt';
import { STOPWORDS_EN } from './stopwords-en';
import { STOPWORDS_PT } from './stopwords-pt';

/** Idiomas suportados oficialmente pela NLU. */
export type NluLanguage = 'pt' | 'en' | 'unknown';

/**
 * Resultado da detecção — idioma + contagem de hits por dict pra debug.
 */
export interface LanguageDetectResult {
  readonly language: NluLanguage;
  readonly hits: {
    readonly pt: number;
    readonly en: number;
  };
}

/**
 * Detecta idioma dominante de uma sequência de tokens (já
 * tokenizados via `tokenize()`).
 *
 * **Retorna `'unknown'`** quando:
 * - Zero tokens
 * - Zero hits em ambos os idiomas (texto só de números/hex/símbolos)
 * - Empate exato (igual número de hits PT e EN)
 *
 * Caller decide o fallback (default PT? Persistido na UI?).
 */
export function detectLanguage(tokens: readonly string[]): LanguageDetectResult {
  if (tokens.length === 0) {
    return { language: 'unknown', hits: { pt: 0, en: 0 } };
  }

  let ptHits = 0;
  let enHits = 0;

  for (const tok of tokens) {
    // Cada token contribui pra contagem do idioma onde aparece.
    // Tokens que estão SÓ em EN dict (ex: 'square', 'blue') contam pra EN.
    // Tokens que estão SÓ em PT dict (ex: 'quadrado', 'azul') contam pra PT.
    // Tokens universais (CSS keywords como 'navy', dígitos) não contam.
    const inPt =
      STOPWORDS_PT.has(tok) ||
      tok in ACTION_DICTIONARY_PT ||
      tok in COLOR_DICTIONARY_PT ||
      tok in SHAPE_DICTIONARY_PT;
    const inEn =
      STOPWORDS_EN.has(tok) ||
      tok in ACTION_DICTIONARY_EN ||
      tok in COLOR_DICTIONARY_EN ||
      tok in SHAPE_DICTIONARY_EN;

    // Universal token (em ambos) não atribui — não é discriminador.
    if (inPt && !inEn) ptHits++;
    else if (inEn && !inPt) enHits++;
  }

  if (ptHits === 0 && enHits === 0) {
    return { language: 'unknown', hits: { pt: 0, en: 0 } };
  }
  if (ptHits === enHits) {
    return { language: 'unknown', hits: { pt: ptHits, en: enHits } };
  }

  return {
    language: ptHits > enHits ? 'pt' : 'en',
    hits: { pt: ptHits, en: enHits },
  };
}
