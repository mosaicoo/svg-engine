/**
 * Tokenizer multilíngue (PT + EN) — D-046? Fase 1.
 *
 * Operações em ordem:
 * 1. Lowercase
 * 2. **Deacentuação** via `String.prototype.normalize('NFD')` + strip
 *    de marks combining — "vermelho" → "vermelho", "círculo" →
 *    "circulo", "ação" → "acao". Permite o dicionário ser keyed em
 *    ASCII puro e ainda casar com input acentuado.
 * 3. Split por whitespace + pontuação comum, **preservando**:
 *    - números (incluindo decimais `1.5`, `2,5` — pt/en)
 *    - dimensões compostas `100x50`
 *    - hex colors `#ff0000`
 * 4. Filter de tokens vazios.
 *
 * **Não filtra stopwords aqui** — algumas etapas (slot-extractor)
 * precisam dos tokens originais pra ordem posicional. Caller decide
 * quando aplicar `isStopword`.
 *
 * **Por que não usar Intl.Segmenter / NLP libs**: zero-deps é
 * requisito explícito da Fase 1 (D-046?). Tokenização "ingênua"
 * cobre o vocabulário de comandos de editor de SVG sem ruído.
 */

/**
 * Caracteres tratados como separadores de tokens. NB: `,` e `.` NÃO
 * estão aqui — eles são tratados no scanner para preservar decimais
 * PT (`1,5`) e EN (`1.5`). O scanner aplica regra contextual:
 * separa só quando NÃO está entre dígitos.
 */
const PUNCT_CHARS = /[\s;!?()\\[\]{}"'`]/;

/**
 * Normaliza um texto removendo acentos via NFD + strip de marks
 * combining (Unicode category `Mn`).
 *
 * **Por que NFD**: separa o caractere base da marca combinante
 * (`á` → `a` + ` ́ `), depois removemos só as marcas. Funciona pra PT
 * (acentos agudos, til, cedilha) e qualquer alfabeto latino estendido.
 *
 * **Edge case** mantido: caracteres sem decomposição NFD passam
 * intactos (preserva tokens em outros alfabetos se aparecerem).
 */
export function deaccent(input: string): string {
  return input.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Normaliza texto: lowercase + deacentuação. Não tokeniza — só
 * normaliza pra usar em dicionários, comparações.
 */
export function normalize(input: string): string {
  return deaccent(input.toLowerCase());
}

/**
 * `true` se `ch` é dígito ASCII `0-9`.
 */
function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

/**
 * Tokeniza um input textual seguindo a pipeline descrita no header.
 *
 * **Algoritmo (single-pass scanner)**:
 * 1. Itera caractere por caractere.
 * 2. Caractere de pontuação (`PUNCT_CHARS`) OU `,`/`.` que NÃO está
 *    entre dígitos → fecha o token corrente.
 * 3. Caractere "normal" (incluindo `,` / `.` entre dígitos) → acumula.
 * 4. Fim do input → fecha o último token se houver.
 *
 * **Retorno**: array de tokens normalizados (lowercase, sem acento),
 * sem vazios, preservando ordem de aparição (importante pro
 * slot-extractor encontrar "vermelho" depois de "fill").
 *
 * **Custo**: O(n) no tamanho do input.
 */
export function tokenize(input: string): readonly string[] {
  if (typeof input !== 'string' || input.length === 0) return [];
  const normalized = normalize(input);
  const result: string[] = [];
  let current = '';
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    const prev = i > 0 ? normalized[i - 1] : '';
    const next = i < normalized.length - 1 ? normalized[i + 1] : '';
    const isCommaOrDotBetweenDigits = (ch === ',' || ch === '.') && isDigit(prev) && isDigit(next);
    const isPunctSeparator =
      PUNCT_CHARS.test(ch) || ((ch === ',' || ch === '.') && !isCommaOrDotBetweenDigits);
    if (isPunctSeparator) {
      if (current.length > 0) {
        result.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

/**
 * Tokeniza E remove stopwords. Atalho conveniente; quando você
 * precisa preservar a ordem original (slot extraction posicional),
 * use `tokenize()` direto.
 */
export function tokenizeWithoutStopwords(
  input: string,
  stopwords: ReadonlySet<string>,
): readonly string[] {
  return tokenize(input).filter((tok) => !stopwords.has(tok));
}
