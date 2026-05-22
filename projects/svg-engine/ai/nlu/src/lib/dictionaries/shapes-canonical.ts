/**
 * **NLU-specific shape vocabulary** — separado do `ShapeKind` em
 * `svg-engine/edit/lib/tool` (que tem `'rect' | 'ellipse' | 'polygon'`
 * pras shape tools de drawing). O NLU precisa de uma lista maior
 * porque mapeia vocabulário falado/escrito, não capability de tool.
 *
 * **Polígonos específicos** (D-046 review-5): triangle/pentagon/
 * hexagon/octagon/rhombus/star são kinds próprios para que o handler
 * `create-shape` saiba **quantos lados** gerar sem precisar inferir
 * do input. Antes, "triangulo" e "hexagono" caíam em `'polygon'`
 * genérico e o handler não tinha info pra desenhar — virava no-op.
 */
export type NluShapeKind =
  | 'rect'
  | 'ellipse'
  | 'circle'
  | 'line'
  | 'path'
  // Polígonos: o número da vértices é IMPLÍCITO no kind.
  | 'triangle'
  | 'rhombus'
  | 'pentagon'
  | 'hexagon'
  | 'octagon'
  | 'star'
  | 'polygon' // genérico (default 6 lados)
  | 'polyline'
  | 'text'
  | 'image'
  | 'group'
  | 'svg';

/**
 * **Mapa de polígonos regulares pro número de lados** — usado pelo
 * handler `create-shape` em `professional-intents.ts` / `builtin-nlu.plugin.ts`
 * pra gerar geometria correta sem heurísticas frágeis.
 *
 * `'star'` é um caso especial (vértices alternados inner/outer); o
 * handler trata via `regularStarPoints()`.
 */
export const POLYGON_SIDES: Readonly<Record<string, number>> = Object.freeze({
  triangle: 3,
  rhombus: 4,
  pentagon: 5,
  hexagon: 6,
  octagon: 8,
  polygon: 6, // default genérico
});

/**
 * Helper: gera pontos de um polígono regular inscrito num círculo.
 * Primeiro vértice no topo (12 o'clock) por convenção.
 *
 * @param cx centro x
 * @param cy centro y
 * @param radius raio do círculo inscrito (= width/2 ou min(w,h)/2)
 * @param sides número de vértices (≥ 3)
 */
export function regularPolygonPoints(
  cx: number,
  cy: number,
  radius: number,
  sides: number,
): readonly { x: number; y: number }[] {
  const n = Math.max(3, Math.floor(sides));
  const pts: { x: number; y: number }[] = [];
  // Início em -90° (topo) — convenção visual padrão.
  const startAngle = -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const angle = startAngle + (2 * Math.PI * i) / n;
    pts.push({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
  }
  return pts;
}

/**
 * Helper: gera pontos de uma estrela regular (alternating inner/outer
 * radii). Default 5 pontas (estrela clássica).
 *
 * @param cx centro x
 * @param cy centro y
 * @param outerRadius raio externo (pontas)
 * @param innerRadius raio interno (vales); default = outerRadius * 0.4
 * @param points número de pontas; default 5
 */
export function regularStarPoints(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius = outerRadius * 0.4,
  points = 5,
): readonly { x: number; y: number }[] {
  const n = Math.max(3, Math.floor(points));
  const pts: { x: number; y: number }[] = [];
  const startAngle = -Math.PI / 2;
  // 2N vértices alternados: outer/inner/outer/inner/...
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = startAngle + (Math.PI * i) / n;
    pts.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }
  return pts;
}
