import type { SvgNodeBase } from './svg-node-base';

/**
 * Free-form path described by an SVG path data string (the `d` attribute).
 * Maps to SVG `<path>`. Path command parsing/validation is handled by the
 * `svg-engine/io` entry point — `core` treats `d` as opaque text.
 */
export interface PathNode extends SvgNodeBase {
  readonly type: 'path';
  readonly d: string;
}
