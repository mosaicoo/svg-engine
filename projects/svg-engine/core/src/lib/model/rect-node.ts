import type { SvgNodeBase } from './svg-node-base';

/** Axis-aligned rectangle. Maps to SVG `<rect>`. */
export interface RectNode extends SvgNodeBase {
  readonly type: 'rect';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Optional corner radius on the X axis. */
  readonly rx?: number;
  /** Optional corner radius on the Y axis. */
  readonly ry?: number;
}
