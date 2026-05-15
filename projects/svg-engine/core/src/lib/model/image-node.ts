import type { SvgNodeBase } from './svg-node-base';

/**
 * Raster image embedded into the SVG. Maps to SVG `<image>`. The `href`
 * may be a data URI or an absolute/relative URL; sanitization (e.g.,
 * disallowing `javascript:` schemes) is enforced by `svg-engine/io`.
 */
export interface ImageNode extends SvgNodeBase {
  readonly type: 'image';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly href: string;
  readonly preserveAspectRatio?: string;
}
