/**
 * Dicionário de cores — **PT + EN merged** → hex / CSS color.
 *
 * Este arquivo é o **ponto único** consumido pelo parser
 * (`slot-extractor.ts` via {@link resolveColorName}). A separação por
 * idioma fica em `colors-pt.ts` e `colors-en.ts` — esse arquivo só faz
 * o merge + expõe as APIs públicas.
 *
 * **Por que separar por idioma**:
 * - Auditoria por idioma sem ruído cross-locale.
 * - Estatísticas para `detectLanguage()` (qual idioma tem mais hits).
 * - Manutenção isolada de variantes regionais (BR vs PT, EN-US vs EN-UK).
 *
 * **Convenções de chaves** (válidas em PT e EN):
 * - **lowercase + SEM acento** (tokenizer faz `deaccent()` antes).
 * - Quando uma palavra é **idêntica nos dois idiomas** (ex: 'navy',
 *   'turquoise', CSS keywords como 'royalblue'), fica APENAS em EN.
 * - Variantes claras/escuras separadas (`'azulclaro'`, `'azulescuro'`)
 *   complementam o detector de intensificador no `parseColorPhrase`.
 *
 * **Resolução avançada** feita no slot-extractor:
 * - Hex direto (`#ff0000`, `#f00`)
 * - `rgb(r, g, b)` / `rgba(r, g, b, a)`
 * - `hsl(h, s%, l%)` / `hsla(h, s%, l%, a)`
 * - Intensificadores: "azul claro" / "verde bem escuro" via
 *   {@link parseColorPhrase} no `slot-extractor.ts`
 * - Composição de tokens adjacentes: "azul marinho" → 'azulmarinho'
 */
import { COLOR_DICTIONARY_EN } from './colors-en';
import { COLOR_DICTIONARY_PT } from './colors-pt';

export { COLOR_DICTIONARY_EN } from './colors-en';
export { COLOR_DICTIONARY_PT } from './colors-pt';

/**
 * **Merged dict** — PT + EN. EN tem precedência em colisão (mas como
 * convencionamos não duplicar, colisões só acontecem em CSS keywords
 * universais — comportamento idempotente).
 */
export const COLOR_DICTIONARY: Readonly<Record<string, string>> = Object.freeze({
  ...COLOR_DICTIONARY_PT,
  ...COLOR_DICTIONARY_EN,
});

/**
 * Lista de keys (lowercase, sem acento) — usada pelo fuzzy matcher
 * pra propor cores próximas quando o usuário digita errado
 * ("vermelo" → "vermelho").
 */
export const COLOR_KEYS: readonly string[] = Object.freeze(Object.keys(COLOR_DICTIONARY));

/**
 * Resolve um nome de cor (lowercased, deacentuado) para hex/CSS.
 * Retorna `null` quando o nome não consta no dicionário.
 *
 * **Multi-idioma**: consulta o merged dict (PT + EN), então funciona
 * pra qualquer input independente do idioma do usuário.
 */
export function resolveColorName(name: string): string | null {
  return COLOR_DICTIONARY[name] ?? null;
}
