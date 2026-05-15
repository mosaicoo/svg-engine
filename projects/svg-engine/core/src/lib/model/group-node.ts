import type { SvgNode } from './svg-node';
import type { SvgNodeBase } from './svg-node-base';

/**
 * Container that groups child nodes. Maps to SVG `<g>`. The {@link children}
 * array is treated as immutable; mutations create new groups via the
 * tree-ops helpers.
 */
export interface GroupNode extends SvgNodeBase {
  readonly type: 'group';
  readonly children: readonly SvgNode[];
}
