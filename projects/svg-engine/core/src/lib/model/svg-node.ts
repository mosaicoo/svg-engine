import type { EllipseNode } from './ellipse-node';
import type { GroupNode } from './group-node';
import type { ImageNode } from './image-node';
import type { LineNode } from './line-node';
import type { PathNode } from './path-node';
import type { PolygonNode } from './polygon-node';
import type { PolylineNode } from './polyline-node';
import type { RectNode } from './rect-node';
import type { TextNode } from './text-node';

/**
 * Discriminated union of every supported SVG node type. The `type` field
 * narrows to the concrete interface.
 *
 * Adding a new node type requires:
 *   1. A new `<X>Node` interface extending {@link SvgNodeBase} with a unique
 *      `type` literal.
 *   2. A new arm in this union.
 *   3. A factory in `node-factory.ts`.
 *   4. Render coverage in `svg-engine/render` and serialization coverage
 *      in `svg-engine/io`.
 */
export type SvgNode =
  | RectNode
  | EllipseNode
  | LineNode
  | PolygonNode
  | PolylineNode
  | PathNode
  | TextNode
  | ImageNode
  | GroupNode;

/** All concrete node `type` discriminators as a tuple. */
export const SVG_NODE_TYPES = [
  'rect',
  'ellipse',
  'line',
  'polygon',
  'polyline',
  'path',
  'text',
  'image',
  'group',
] as const;

/** Literal union of every node `type` value. */
export type SvgNodeType = (typeof SVG_NODE_TYPES)[number];

/** Whether the given node is a {@link GroupNode}. */
export function isGroupNode(node: SvgNode): node is GroupNode {
  return node.type === 'group';
}
