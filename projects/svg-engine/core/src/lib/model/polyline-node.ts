import type { Point } from '../types/point';
import type { SvgNodeBase } from './svg-node-base';

/** Open polyline defined by an ordered list of vertices. Maps to SVG `<polyline>`. */
export interface PolylineNode extends SvgNodeBase {
  readonly type: 'polyline';
  readonly points: readonly Point[];
}
