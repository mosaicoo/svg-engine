/**
 * Dicionário de formas (PT + EN) → canonical shape kind.
 *
 * O kind canonical mapeia para os factories existentes em
 * `svg-engine/core` (`createRect`, `createEllipse`, `createPath`,
 * `createGroup`). Plugins built-in usam esse mapeamento pra resolver
 * o slot `shape` (e.g., "criar retângulo" → `rect` → `createRect`).
 *
 * **Chaves**: lowercase, sem acento (tokenizer deacenta primeiro).
 *
 * **PT/EN coexistem** apontando para o mesmo kind canonical —
 * mantém a UI determinística independente do idioma do input.
 */
/**
 * **NLU-specific shape vocabulary** — separado do `ShapeKind` em
 * `svg-engine/edit/lib/tool` (que tem `'rect' | 'ellipse' | 'polygon'`
 * pras shape tools de drawing). O NLU precisa de uma lista maior
 * (inclui `circle`, `line`, `path`, `group`) porque mapeia
 * vocabulário falado/escrito, não capability de tool.
 */
export type NluShapeKind = 'rect' | 'ellipse' | 'circle' | 'line' | 'path' | 'group';

export const SHAPE_DICTIONARY: Readonly<Record<string, NluShapeKind>> = Object.freeze({
  // ── PT ──────────────────────────────────────────────────────
  retangulo: 'rect',
  quadrado: 'rect',
  caixa: 'rect',
  elipse: 'ellipse',
  oval: 'ellipse',
  circulo: 'circle',
  linha: 'line',
  caminho: 'path',
  trajeto: 'path',
  grupo: 'group',

  // ── EN ──────────────────────────────────────────────────────
  rectangle: 'rect',
  rect: 'rect',
  square: 'rect',
  box: 'rect',
  ellipse: 'ellipse',
  circle: 'circle',
  line: 'line',
  path: 'path',
  group: 'group',
});

/** Keys disponíveis pro fuzzy matcher. */
export const SHAPE_KEYS: readonly string[] = Object.freeze(Object.keys(SHAPE_DICTIONARY));

/**
 * Resolve um nome de forma (lowercased + deacentuado) para kind.
 * Retorna `null` quando não é uma forma conhecida.
 */
export function resolveShapeKind(name: string): NluShapeKind | null {
  return SHAPE_DICTIONARY[name] ?? null;
}
