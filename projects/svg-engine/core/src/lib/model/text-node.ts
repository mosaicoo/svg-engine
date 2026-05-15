import type { SvgNodeBase } from './svg-node-base';

/**
 * Text element. Maps to SVG `<text>`. Multi-line text and `<tspan>`
 * runs are not modelled in v0; the renderer emits the text as a single
 * inline string. Multi-line support is planned for the `svg-engine/edit`
 * entry point.
 */
export interface TextNode extends SvgNodeBase {
  readonly type: 'text';
  readonly x: number;
  readonly y: number;
  readonly content: string;
  readonly fontSize?: number;
  readonly fontFamily?: string;
  readonly fontWeight?: number | 'normal' | 'bold';
  readonly textAnchor?: 'start' | 'middle' | 'end';
}
