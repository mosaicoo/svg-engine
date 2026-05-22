import { bestMatch, levenshtein } from './levenshtein';

/**
 * Resultado de um match fuzzy entre um token de input e um termo
 * de dicionário/keyword.
 */
export interface FuzzyMatch {
  /** Termo do dicionário que casou. */
  readonly term: string;
  /** Token do input (preservado pra `NluMatchReason`). */
  readonly token: string;
  /** Distância de Levenshtein (0 = exato). */
  readonly distance: number;
  /**
   * Confidence sub-1 derivada da distância vs comprimento do termo.
   * Match exato = 1.0; match com 1 erro em palavra de 8 letras ~0.875.
   * Match com 2 erros em palavra de 4 letras = 0.5.
   */
  readonly score: number;
  /**
   * **`tokenIndex`** (D-046 review-10): índice do token original no
   * array de entrada. Sempre populado por {@link fuzzyMatchAny} e
   * {@link fuzzyMatchAll}; em {@link fuzzyMatchToken} fica `-1` porque
   * o caller não passa array (e sabe o índice por contexto próprio).
   *
   * **Motivação**: `NaturalLanguageService` precisa marcar o ÍNDICE
   * do token consumido (não só seu valor string) para evitar bug onde
   * `tokens.indexOf(value)` retorna sempre a 1ª ocorrência — quebrando
   * em inputs com tokens repetidos ("vermelho borda vermelho").
   */
  readonly tokenIndex: number;
}

/**
 * Política de distância adaptativa por tamanho do termo:
 * - Termos ≤ 3 chars: distância máxima 0 (matches exatos só — "rect",
 *   "red" são tão curtas que 1 typo já vira outra palavra).
 * - Termos 4–6 chars: distância máxima 1.
 * - Termos ≥ 7 chars: distância máxima 2.
 *
 * Cap absoluto: 2 (acima disso é palavra diferente, não typo).
 */
export function adaptiveMaxDistance(termLength: number): number {
  if (termLength <= 3) return 0;
  if (termLength <= 6) return 1;
  return 2;
}

/**
 * Tenta casar um único token de input contra uma lista de termos
 * (keys de dicionário OU keywords de intent), respeitando distância
 * adaptativa por tamanho do termo.
 *
 * **Retorno**: melhor match (menor distância) ou `null` se nenhum
 * dentro do orçamento de distância adaptativo.
 *
 * **Custo**: O(N) onde N = `terms.length`, com early termination
 * herdada do `levenshtein()`.
 */
export function fuzzyMatchToken(token: string, terms: readonly string[]): FuzzyMatch | null {
  if (token.length === 0 || terms.length === 0) return null;

  let best: FuzzyMatch | null = null;
  for (const term of terms) {
    if (term.length === 0) continue;
    const maxDist = adaptiveMaxDistance(term.length);
    if (term === token) {
      return { term, token, distance: 0, score: 1, tokenIndex: -1 };
    }
    // Quando o token tem comprimento absurdamente diferente do
    // termo, nem tenta — `levenshtein` retornaria Infinity rapidamente,
    // mas evitamos a chamada.
    if (Math.abs(token.length - term.length) > maxDist) continue;
    const d = levenshtein(token, term, maxDist);
    if (d === Infinity) continue;
    const score = 1 - d / Math.max(term.length, 1);
    if (best === null || d < best.distance || (d === best.distance && score > best.score)) {
      best = { term, token, distance: d, score, tokenIndex: -1 };
    }
  }
  return best;
}

/**
 * Match fuzzy de **qualquer** token de uma lista contra **qualquer**
 * termo de uma lista. Retorna o melhor casamento (ou `null`).
 *
 * Útil pra "alguma das keywords da intent aparece no input?". Pára
 * cedo no primeiro match exato (distância 0).
 */
export function fuzzyMatchAny(
  tokens: readonly string[],
  terms: readonly string[],
): FuzzyMatch | null {
  let best: FuzzyMatch | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const m = fuzzyMatchToken(token, terms);
    if (m === null) continue;
    // Popula tokenIndex com a posição real no input array (D-046 review-10).
    const matched: FuzzyMatch = { ...m, tokenIndex: i };
    if (matched.distance === 0) return matched;
    if (best === null || matched.score > best.score) best = matched;
  }
  return best;
}

/**
 * Versão "all matches" — retorna **todos** os matches fuzzy de um
 * token contra a lista, sem early-termination. Útil quando precisamos
 * de ranking completo (intent registry com muitos candidates).
 */
export function fuzzyMatchAll(
  token: string,
  terms: readonly string[],
  maxDistOverride?: number,
): readonly FuzzyMatch[] {
  if (token.length === 0) return [];
  const results: FuzzyMatch[] = [];
  for (const term of terms) {
    if (term.length === 0) continue;
    const maxDist = maxDistOverride ?? adaptiveMaxDistance(term.length);
    if (Math.abs(token.length - term.length) > maxDist) continue;
    const d = term === token ? 0 : levenshtein(token, term, maxDist);
    if (d === Infinity) continue;
    results.push({
      term,
      token,
      distance: d,
      score: 1 - d / Math.max(term.length, 1),
      tokenIndex: -1,
    });
  }
  return results.sort((a, b) => b.score - a.score);
}

// Re-export `bestMatch` for callers that want the raw 2-string
// helper without the full FuzzyMatch envelope.
export { bestMatch };
