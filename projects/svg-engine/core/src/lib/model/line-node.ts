import type { SvgNodeBase } from './svg-node-base';

/** Line segment between two endpoints. Maps to SVG `<line>`. */
export interface LineNode extends SvgNodeBase {
  readonly type: 'line';
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}
