export type { EllipseNode } from './ellipse-node';
export type { GroupNode } from './group-node';
export type { ImageNode } from './image-node';
export type { LineNode } from './line-node';
export type { PathNode } from './path-node';
export type { PolygonNode } from './polygon-node';
export type { PolylineNode } from './polyline-node';
export type { RectNode } from './rect-node';
export type { SvgNodeBase } from './svg-node-base';
export type { SymbolUseNode } from './symbol-use-node';
export type { TextNode } from './text-node';

export { isGroupNode, SVG_NODE_TYPES, type SvgNode, type SvgNodeType } from './svg-node';

// D-072 — Logical Layers (metadata-flag on GroupNode)
export { isLayer, SVGE_KIND_KEY, SVGE_KIND_LAYER, withLayerFlag, withoutLayerFlag } from './layer';

export {
  createEllipse,
  createGroup,
  createImage,
  createLine,
  createPath,
  createPolygon,
  createPolyline,
  createRect,
  createSymbolUse,
  createText,
  type NodeFactoryOptions,
} from './node-factory';
