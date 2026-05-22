/**
 * Dicionário de cores nomeadas — PT + EN → hex / CSS color.
 *
 * Cobre o subset mais comum em editor de SVG (cores primárias /
 * secundárias / neutros). Para customizar cores além desta lista,
 * plugins podem registrar intents com slot `kind: 'color'` que
 * aceita hex `#rrggbb` direto no input do usuário.
 *
 * **Chaves**: todas em lowercase, **sem acento** (o tokenizer
 * deacenta antes de buscar). PT e EN coexistem — a coluna value
 * resolve pra mesma cor canonical.
 *
 * **Resolução de hex direto**: feita no slot-extractor (regex
 * `/^#[0-9a-f]{3,8}$/i`). Cores nomeadas funcionam só via lookup
 * aqui — adicionar novas é trivial (sem download, sem ML).
 */
export const COLOR_DICTIONARY: Readonly<Record<string, string>> = Object.freeze({
  // ── Primárias / básicas (PT) ─────────────────────────────────
  vermelho: '#e53935',
  azul: '#1e88e5',
  verde: '#43a047',
  amarelo: '#fdd835',
  laranja: '#fb8c00',
  roxo: '#8e24aa',
  rosa: '#ec407a',
  marrom: '#6d4c41',
  preto: '#000000',
  branco: '#ffffff',
  cinza: '#9e9e9e',
  ciano: '#00acc1',
  magenta: '#d81b60',

  // ── Primárias / básicas (EN) ─────────────────────────────────
  red: '#e53935',
  blue: '#1e88e5',
  green: '#43a047',
  yellow: '#fdd835',
  orange: '#fb8c00',
  purple: '#8e24aa',
  pink: '#ec407a',
  brown: '#6d4c41',
  black: '#000000',
  white: '#ffffff',
  gray: '#9e9e9e',
  grey: '#9e9e9e',
  cyan: '#00acc1',

  // ── Tons + alternativas ──────────────────────────────────────
  transparente: 'transparent',
  transparent: 'transparent',
  none: 'none',
  nenhum: 'none',
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
