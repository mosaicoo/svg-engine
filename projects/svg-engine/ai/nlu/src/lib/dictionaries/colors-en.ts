/**
 * **Color dictionary — English (EN).**
 *
 * Kept separate from PT so idiomatic / regional variants can be reviewed
 * independently. Final dict consumed by the parser
 * (`COLOR_DICTIONARY` in `colors.ts`) merges PT + EN.
 *
 * **Key convention**: lowercase, no diacritics (tokenizer applies
 * `deaccent()` before lookup). Don't duplicate with PT — when a token
 * is the same in both (e.g., CSS keywords like `'royalblue'`), keep
 * it ONLY here.
 *
 * **Why split by language**:
 * - Audit: spot vocabulary gaps PT vs EN without scanning 200 lines.
 * - Maintenance: extend EN dict without touching PT.
 * - Language detection (`detectLanguage()` in `language-detect.ts`)
 *   uses per-dict hit counts to estimate the dominant input language.
 */
export const COLOR_DICTIONARY_EN: Readonly<Record<string, string>> = Object.freeze({
  // ── Reds ─────────────────────────────────────────────────────
  red: '#e53935',
  crimson: '#dc143c',
  scarlet: '#ff2400',
  maroon: '#800000',
  ruby: '#9b111e',
  brick: '#cb4154',
  blood: '#8b0000',
  cherry: '#de3163',
  rose: '#ff007f',

  // ── Blues ────────────────────────────────────────────────────
  blue: '#1e88e5',
  navy: '#0d47a1',
  royalblue: '#4169e1',
  skyblue: '#87ceeb',
  turquoise: '#26c6da',
  cobalt: '#0047ab',
  darkblue: '#1565c0',
  lightblue: '#42a5f5',
  midnightblue: '#191970',
  steelblue: '#4682b4',
  azure: '#f0ffff',
  cerulean: '#007ba7',

  // ── Greens ───────────────────────────────────────────────────
  green: '#43a047',
  lightgreen: '#66bb6a',
  darkgreen: '#2e7d32',
  lime: '#cddc39',
  olive: '#808000',
  emerald: '#2ecc71',
  mint: '#98ff98',
  moss: '#8a9a5b',
  pistachio: '#93c572',
  forestgreen: '#228b22',
  seagreen: '#2e8b57',
  teal: '#008080',

  // ── Yellows ──────────────────────────────────────────────────
  yellow: '#fdd835',
  gold: '#fbc02d',
  beige: '#d7ccc8',
  cream: '#fff3e0',
  mustard: '#ffb300',
  wheat: '#f5deb3',
  ivory: '#fffff0',
  amber: '#ffbf00',
  lemon: '#fff700',

  // ── Oranges ──────────────────────────────────────────────────
  orange: '#fb8c00',
  coral: '#ff7043',
  salmon: '#ff8a65',
  peach: '#ffccbc',
  pumpkin: '#ff7518',
  rust: '#b7410e',
  copper: '#b87333',
  tangerine: '#f28500',

  // ── Purples ──────────────────────────────────────────────────
  purple: '#8e24aa',
  violet: '#7e57c2',
  lavender: '#b39ddb',
  indigo: '#3949ab',
  plum: '#8e4585',
  eggplant: '#3b001e',
  mauve: '#e0b0ff',

  // ── Pinks ────────────────────────────────────────────────────
  pink: '#ec407a',
  lightpink: '#f8bbd0',
  hotpink: '#ff69b4',
  deeppink: '#ff1493',
  fuchsia: '#ff00ff',
  magenta: '#d81b60',

  // ── Browns ───────────────────────────────────────────────────
  brown: '#6d4c41',
  chocolate: '#4e342e',
  sand: '#bcaaa4',
  terracotta: '#a0522d',
  caramel: '#af6e4d',
  cinnamon: '#d2691e',
  walnut: '#5d4e37',
  tan: '#d2b48c',
  sienna: '#a0522d',

  // ── Blacks ───────────────────────────────────────────────────
  black: '#000000',
  graphite: '#424242',
  charcoal: '#36454f',
  jet: '#343434',

  // ── Whites ───────────────────────────────────────────────────
  white: '#ffffff',
  ice: '#f5f5f5',
  snow: '#fafafa',
  offwhite: '#f8f8f2',
  pearl: '#eae0c8',

  // ── Grays ────────────────────────────────────────────────────
  gray: '#9e9e9e',
  grey: '#9e9e9e',
  lightgray: '#cfd8dc',
  lightgrey: '#cfd8dc',
  darkgray: '#616161',
  darkgrey: '#616161',
  silver: '#b0bec5',
  slate: '#708090',
  ash: '#b2beb5',

  // ── Cyan ─────────────────────────────────────────────────────
  cyan: '#00acc1',
  aqua: '#00bcd4',
  aquamarine: '#4dd0e1',

  // ── Semantic (EN) ────────────────────────────────────────────
  success: '#43a047',
  warning: '#fbc02d',
  danger: '#e53935',
  error: '#e53935',
  info: '#1e88e5',
  primary: '#1e88e5',
  secondary: '#9e9e9e',
  tertiary: '#b26500',

  // ── Extras úteis SVG/UI (EN) ─────────────────────────────────
  transparent: 'transparent',
  none: 'none',
  nocolor: 'none',
  nofill: 'none',
  invisible: 'none',

  // ── SVG / CSS keywords ───────────────────────────────────────
  // NB: tokenizer lowercases input, so `currentcolor` casa `currentColor` original CSS;
  // preservamos casing canonical no value pra round-trip fidelity.
  currentcolor: 'currentColor',
  inherit: 'inherit',
});
