/**
 * **NLU-specific shape vocabulary** — separado do `ShapeKind` em
 * `svg-engine/edit/lib/tool` (que tem `'rect' | 'ellipse' | 'polygon'`
 * pras shape tools de drawing). O NLU precisa de uma lista maior
 * (inclui `circle`, `line`, `path`, `text`, `image`, `polyline`,
 * `group`, `svg`) porque mapeia vocabulário falado/escrito, não
 * capability de tool.
 */
export type NluShapeKind =
  | 'rect'
  | 'ellipse'
  | 'circle'
  | 'line'
  | 'path'
  | 'polygon'
  | 'polyline'
  | 'text'
  | 'image'
  | 'group'
  | 'svg';
