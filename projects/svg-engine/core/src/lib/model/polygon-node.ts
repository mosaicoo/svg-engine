import type { Point } from '../types/point';
import type { SvgNodeBase } from './svg-node-base';

/** Closed polygon defined by an ordered list of vertices. Maps to SVG `<polygon>`. */
export interface PolygonNode extends SvgNodeBase {
  readonly type: 'polygon';
  readonly points: readonly Point[];
}
