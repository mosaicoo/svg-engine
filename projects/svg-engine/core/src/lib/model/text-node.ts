import type { SvgNodeBase } from './svg-node-base';

/**
 * Text element. Maps to SVG `<text>`. The `content` field is a single
 * string — multi-line is expressed by embedding `\n` characters in
 * `content` and the renderer (see `svg-engine/render` text dispatcher)
 * splits on `\n` into a sequence of `<tspan dy>` runs. Explicit
 * `<tspan>` runs with per-run styling are still not modelled at the
 * data layer — they would require extending this interface with an
 * optional `runs` field.
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
