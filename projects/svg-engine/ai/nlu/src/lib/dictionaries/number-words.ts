/**
 * **Number words — PT + EN.**
 *
 * Mapeia palavras de número escritas por extenso (PT/EN) para valor
 * numérico inteiro. Usado pelo `parseNumberToken` no slot-extractor
 * pra reconhecer comandos como "selecionar os três triangulos" →
 * count=3.
 *
 * **Cobertura**: 1-20 + dezenas (30, 40, ..., 100). Acima disso é
 * raro em comandos de editor SVG ("selecionar os 50 retangulos" é
 * mais natural com dígito).
 *
 * **Convenção de chave**: lowercase + SEM acento (tokenizer faz
 * `deaccent()`). Tres → `tres`, dois → `dois`, etc.
 */
export const NUMBER_WORDS: Readonly<Record<string, number>> = Object.freeze({
  // ── PT ──────────────────────────────────────────────────────
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3, // 'três' deacentuado
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14, // variante BR
  quinze: 15,
  dezesseis: 16,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50, // 'cinquenta' sem trema (deacentuado)
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,

  // ── EN ──────────────────────────────────────────────────────
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
});

/**
 * Resolve uma palavra de número (lowercased, deacentuada) pro valor
 * inteiro. Retorna `null` quando não é número conhecido.
 */
export function resolveNumberWord(word: string): number | null {
  const v = NUMBER_WORDS[word];
  return typeof v === 'number' ? v : null;
}
