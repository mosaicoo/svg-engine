/**
 * Dicionário de formas — **PT + EN merged** → canonical shape kind.
 *
 * O kind canonical mapeia para os factories existentes em
 * `svg-engine/core` (`createRect`, `createEllipse`, `createPath`,
 * `createLine`, `createPolygon`, `createPolyline`, `createText`,
 * `createImage`, `createGroup`). Plugins built-in usam esse mapeamento
 * pra resolver o slot `shape` (e.g., "criar retângulo" → `rect` →
 * `createRect`).
 *
 * **Convenções de chaves**:
 * - **lowercase + SEM acento** (tokenizer faz `deaccent()` antes).
 * - PT/EN vivem em arquivos separados (`shapes-pt.ts`, `shapes-en.ts`).
 * - Quando uma palavra é idêntica nos dois idiomas, fica APENAS em EN.
 * - **Semantic aliases** ("nó" → circle, "conector" → line, "balão"
 *   → group) mapeiam vocabulário UX para shapes existentes.
 *
 * **Limitação Fase 1**: ícones nomeados ("estrela" / "coração" /
 * "engrenagem") mapeiam pra `'polygon'` ou `'path'` mas o handler
 * built-in não renderiza geometria específica deles — isso fica para
 * a fase que integrar uma icon library (Fase 1.x). Por ora caem em
 * stub honesto no `builtinNluPlugin`.
 */
import type { NluShapeKind } from './shapes-canonical';
import { SHAPE_DICTIONARY_EN } from './shapes-en';
import { SHAPE_DICTIONARY_PT } from './shapes-pt';

export type { NluShapeKind } from './shapes-canonical';
export { POLYGON_SIDES, regularPolygonPoints, regularStarPoints } from './shapes-canonical';
export { SHAPE_DICTIONARY_EN } from './shapes-en';
export { SHAPE_DICTIONARY_PT } from './shapes-pt';

export const SHAPE_DICTIONARY: Readonly<Record<string, NluShapeKind>> = Object.freeze({
  ...SHAPE_DICTIONARY_PT,
  ...SHAPE_DICTIONARY_EN,
});

/** Keys disponíveis pro fuzzy matcher. */
export const SHAPE_KEYS: readonly string[] = Object.freeze(Object.keys(SHAPE_DICTIONARY));

/**
 * Resolve um nome de forma (lowercased + deacentuado) para kind.
 * Retorna `null` quando não é uma forma conhecida.
 *
 * **Multi-idioma**: consulta o merged dict (PT + EN).
 */
export function resolveShapeKind(name: string): NluShapeKind | null {
  return SHAPE_DICTIONARY[name] ?? null;
}
