import type { SvgNodeBase } from './svg-node-base';

/** Ellipse defined by center and two radii. Maps to SVG `<ellipse>`. */
export interface EllipseNode extends SvgNodeBase {
  readonly type: 'ellipse';
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}
