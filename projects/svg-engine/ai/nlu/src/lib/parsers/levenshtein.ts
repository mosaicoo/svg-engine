/**
 * Distância de Levenshtein — edit distance clássica (insertion,
 * deletion, substitution; cada uma custa 1). Usada pelo fuzzy
 * matcher pra encontrar a palavra mais próxima no dicionário quando
 * o usuário digita errado ("vermelo" → "vermelho", dist 1;
 * "retangulo" → "retangulo", dist 0).
 *
 * **Implementação**: 2-row DP (memória O(min(m,n))), curto-circuita
 * cedo via "early termination on max distance" — útil porque o
 * matcher fuzzy só aceita distâncias pequenas (≤ 2 default) e abandonar
 * cedo evita varrer a tabela inteira pra strings totalmente diferentes.
 *
 * **Sem cache**: as strings são curtas (tokens de palavras, ≤ 20
 * chars) e o overhead de hashmap supera o custo de recomputar. Se
 * benchmarks futuros mostrarem hot spot, adicionar cache LRU
 * Map<`${a}|${b}`, number> com cap pequeno.
 *
 * **Zero deps** (requisito Fase 1 D-046).
 */

/**
 * Calcula a distância de Levenshtein entre `a` e `b`.
 *
 * @param a primeira string (lowercase + deacentuada já preferível)
 * @param b segunda string
 * @param maxDist se informado, retorna `Infinity` assim que prova
 *                que a distância real excede `maxDist` (early
 *                termination, ~10× speedup em mismatches grandes).
 * @returns distância em [0, max(a.length, b.length)] ou `Infinity`
 *          se `maxDist` foi excedida.
 */
export function levenshtein(a: string, b: string, maxDist = Infinity): number {
  // Casos triviais
  if (a === b) return 0;
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0) return lenB > maxDist ? Infinity : lenB;
  if (lenB === 0) return lenA > maxDist ? Infinity : lenA;

  // Diferença absoluta de comprimento é um lower bound — se já
  // excede maxDist, abandona sem alocar nada.
  const lengthDiff = Math.abs(lenA - lenB);
  if (lengthDiff > maxDist) return Infinity;

  // Ordena pra ter a string mais curta no eixo B (menor memória).
  let s1: string = a;
  let s2: string = b;
  if (lenA > lenB) {
    s1 = b;
    s2 = a;
  }
  const m = s1.length;
  const n = s2.length;

  // 2-row DP: linha anterior + linha atual (Int8Array é suficiente
  // pra distâncias ≤ 127 — tokens curtos garantem isso).
  let prev = new Array<number>(m + 1);
  let curr = new Array<number>(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;

  for (let j = 1; j <= n; j++) {
    curr[0] = j;
    let rowMin = curr[0];
    for (let i = 1; i <= m; i++) {
      const cost = s1.charCodeAt(i - 1) === s2.charCodeAt(j - 1) ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1, // deletion
        curr[i - 1] + 1, // insertion
        prev[i - 1] + cost, // substitution
      );
      if (curr[i] < rowMin) rowMin = curr[i];
    }
    // Early termination: se TODO o curr row já excede maxDist, não
    // há jeito da distância final ser menor.
    if (rowMin > maxDist) return Infinity;
    // Swap rows (sem realocação)
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  const dist = prev[m];
  return dist > maxDist ? Infinity : dist;
}

/**
 * Encontra o melhor match em `candidates` pra `query`, retornando
 * a string + distância. Curto-circuita em match exato.
 *
 * @param query termo a buscar (normalizado)
 * @param candidates lista de strings candidatas (normalizadas)
 * @param maxDist distância máxima aceitável; ignora candidates além disso
 * @returns `{ match, distance }` ou `null` se nenhum candidate dentro do limite
 */
export function bestMatch(
  query: string,
  candidates: readonly string[],
  maxDist: number,
): { match: string; distance: number } | null {
  if (candidates.length === 0) return null;
  let bestStr: string | null = null;
  let bestDist = maxDist + 1;
  for (const cand of candidates) {
    if (cand === query) return { match: cand, distance: 0 };
    const d = levenshtein(query, cand, maxDist);
    if (d < bestDist) {
      bestDist = d;
      bestStr = cand;
      if (d === 0) return { match: cand, distance: 0 };
    }
  }
  return bestStr === null ? null : { match: bestStr, distance: bestDist };
}
