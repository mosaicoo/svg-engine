/**
 * Dicionário de cores nomeadas — PT + EN → hex / CSS color.
 *
 * Cobre o subset mais comum em editor de SVG (cores primárias /
 * secundárias / neutros) **+ semantic colors** (success / warning /
 * danger / info / primary). Para customizar cores além desta lista,
 * plugins podem registrar intents com slot `kind: 'color'` que
 * aceita hex `#rrggbb`, `rgb(...)` ou `hsl(...)` direto no input.
 *
 * **Convenções de chaves**:
 * - **lowercase + SEM acento** (o tokenizer aplica `deaccent()` antes
 *   de buscar). PT e EN coexistem, ambos apontando pra mesma cor.
 * - Variantes claras/escuras separadas (`'azulclaro'`, `'azulescuro'`)
 *   além de detectarem-se via intensificador (vide `parseColorPhrase`).
 *
 * **Resolução avançada** feita no slot-extractor:
 * - Hex direto (`#ff0000`, `#f00`)
 * - `rgb(r, g, b)` / `rgba(r, g, b, a)`
 * - `hsl(h, s%, l%)` / `hsla(h, s%, l%, a)`
 * - Intensificadores: "azul claro" / "verde bem escuro" via
 *   `parseColorPhrase()` no `slot-extractor.ts`
 */
export const COLOR_DICTIONARY: Readonly<Record<string, string>> = Object.freeze({
  // ── Vermelhos / Reds ─────────────────────────────────────────
  vermelho: '#e53935',
  vermelha: '#e53935',
  red: '#e53935',
  vermelhoescuro: '#b71c1c',
  vermelhoclaro: '#ef5350',
  crimson: '#dc143c',
  carmesim: '#dc143c',
  vinho: '#7b1e3a',
  bordo: '#800020',
  scarlet: '#ff2400',

  // ── Azuis / Blues ────────────────────────────────────────────
  azul: '#1e88e5',
  blue: '#1e88e5',
  azulclaro: '#42a5f5',
  azulescuro: '#1565c0',
  azulmarinho: '#0d47a1',
  navy: '#0d47a1',
  marinho: '#0d47a1',
  royalblue: '#4169e1',
  skyblue: '#87ceeb',
  azulceleste: '#87ceeb',
  turquesa: '#26c6da',
  turquoise: '#26c6da',
  darkblue: '#1565c0',
  lightblue: '#42a5f5',

  // ── Verdes / Greens ──────────────────────────────────────────
  verde: '#43a047',
  green: '#43a047',
  verdeclaro: '#66bb6a',
  verdeescuro: '#2e7d32',
  lightgreen: '#66bb6a',
  darkgreen: '#2e7d32',
  limao: '#cddc39',
  lime: '#cddc39',
  oliva: '#808000',
  olive: '#808000',
  esmeralda: '#2ecc71',
  emerald: '#2ecc71',
  mint: '#98ff98',
  menta: '#98ff98',

  // ── Amarelos / Yellows ───────────────────────────────────────
  amarelo: '#fdd835',
  yellow: '#fdd835',
  dourado: '#fbc02d',
  gold: '#fbc02d',
  ouro: '#fbc02d',
  bege: '#d7ccc8',
  beige: '#d7ccc8',
  creme: '#fff3e0',
  cream: '#fff3e0',
  mostarda: '#ffb300',
  mustard: '#ffb300',

  // ── Laranjas / Oranges ───────────────────────────────────────
  laranja: '#fb8c00',
  orange: '#fb8c00',
  coral: '#ff7043',
  salmao: '#ff8a65',
  salmon: '#ff8a65',
  peach: '#ffccbc',
  pessego: '#ffccbc',

  // ── Roxos / Purples ──────────────────────────────────────────
  roxo: '#8e24aa',
  purple: '#8e24aa',
  violeta: '#7e57c2',
  violet: '#7e57c2',
  lilas: '#b39ddb',
  lavender: '#b39ddb',
  lavanda: '#b39ddb',
  indigo: '#3949ab',

  // ── Rosas / Pinks ────────────────────────────────────────────
  rosa: '#ec407a',
  pink: '#ec407a',
  rosaclaro: '#f8bbd0',
  lightpink: '#f8bbd0',
  hotpink: '#ff69b4',
  choque: '#ff1493',
  fuchsia: '#ff00ff',
  fucsia: '#ff00ff',
  magenta: '#d81b60',

  // ── Marrons / Browns ─────────────────────────────────────────
  marrom: '#6d4c41',
  brown: '#6d4c41',
  cafe: '#5d4037',
  chocolate: '#4e342e',
  areia: '#bcaaa4',
  sand: '#bcaaa4',
  terracota: '#a0522d',
  terracotta: '#a0522d',

  // ── Pretos / Blacks ──────────────────────────────────────────
  preto: '#000000',
  black: '#000000',
  grafite: '#424242',
  graphite: '#424242',
  charcoal: '#36454f',

  // ── Brancos / Whites ─────────────────────────────────────────
  branco: '#ffffff',
  white: '#ffffff',
  gelo: '#f5f5f5',
  ice: '#f5f5f5',
  neve: '#fafafa',
  snow: '#fafafa',
  offwhite: '#f8f8f2',

  // ── Cinzas / Grays ───────────────────────────────────────────
  cinza: '#9e9e9e',
  gray: '#9e9e9e',
  grey: '#9e9e9e',
  cinzaclaro: '#cfd8dc',
  lightgray: '#cfd8dc',
  lightgrey: '#cfd8dc',
  cinzaescuro: '#616161',
  darkgray: '#616161',
  darkgrey: '#616161',
  prata: '#b0bec5',
  silver: '#b0bec5',

  // ── Ciano / Cyan ─────────────────────────────────────────────
  ciano: '#00acc1',
  cyan: '#00acc1',
  aqua: '#00bcd4',
  aquamarine: '#4dd0e1',

  // ── Semantic colors (UI design system aliases) ───────────────
  // Conventional mapping aligned with Bootstrap / Material / Tailwind
  // status colors. Permite comandos como "cor de alerta", "success", etc.
  success: '#43a047',
  sucesso: '#43a047',
  warning: '#fbc02d',
  alerta: '#fbc02d',
  aviso: '#fbc02d',
  danger: '#e53935',
  perigo: '#e53935',
  erro: '#e53935',
  error: '#e53935',
  info: '#1e88e5',
  informacao: '#1e88e5',
  primary: '#1e88e5',
  primaria: '#1e88e5',
  secondary: '#9e9e9e',
  secundaria: '#9e9e9e',

  // ── Extras úteis SVG/UI ──────────────────────────────────────
  transparente: 'transparent',
  transparent: 'transparent',
  none: 'none',
  nenhum: 'none',
  semcor: 'none',
  nocolor: 'none',
  nofill: 'none',

  // ── SVG / CSS keywords ───────────────────────────────────────
  // NB: tokenizer faz lowercase, então `currentcolor` casa também o
  // `currentColor` original do CSS — preservamos casing canonical no value.
  currentcolor: 'currentColor',
  inherit: 'inherit',
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
 */
export function resolveColorName(name: string): string | null {
  return COLOR_DICTIONARY[name] ?? null;
}
