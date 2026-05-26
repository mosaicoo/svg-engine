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

// D-074 — Smart Objects (metadata-flag on GroupNode; same family as Layer)
export {
  isSmartObject,
  SVGE_KIND_SMART_OBJECT,
  withSmartObjectFlag,
  withoutSmartObjectFlag,
} from './smart-object';

// D-079 — Pages / Artboards (metadata-flag on GroupNode; same family
// as Layer + Smart Object). Each page carries its own viewBox.
export {
  getPageName,
  getPageViewBox,
  isPage,
  SVGE_KIND_PAGE,
  SVGE_PAGE_NAME_KEY,
  SVGE_PAGE_VIEWBOX_KEY,
  withPageFlag,
  withPageName,
  withPageViewBox,
  withoutPageFlag,
} from './page';

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
