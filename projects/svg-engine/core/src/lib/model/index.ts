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
// PAGES-REFACTOR Fase 3 — extends with PageOptions (background /
// margins / orientation / format) persisted per page.
export {
  DEFAULT_PAGE_OPTIONS,
  detectPageFormat,
  getPageName,
  getPageOptions,
  getPageViewBox,
  isPage,
  PAGE_FORMAT_SIZES,
  type PageBackground,
  type PageFormat,
  pageFormatSize,
  type PageMargins,
  type PageOptions,
  type PageOrientation,
  pageOrientationFromSize,
  SVGE_KIND_PAGE,
  SVGE_PAGE_NAME_KEY,
  SVGE_PAGE_OPTIONS_KEY,
  SVGE_PAGE_VIEWBOX_KEY,
  withPageFlag,
  withPageName,
  withPageOptions,
  withPageViewBox,
  withoutPageFlag,
} from './page';

// Page background as artwork (solid / image) — shared by the live canvas
// paint and the export projection so both stay in parity.
export { getPageBackgroundNode, PAGE_BACKGROUND_IMAGE_PAR } from './page-background';

// D-089 — Custom `data-*` attributes (arbitrary user key/value props per node)
export {
  CUSTOM_ATTR_DATA_PREFIX,
  type CustomAttrs,
  customAttrToDataName,
  dataNameToCustomAttr,
  hasCustomAttrs,
  isValidCustomAttrName,
  readCustomAttrs,
  removeCustomAttr,
  renameCustomAttr,
  setCustomAttr,
  SVGE_CUSTOM_ATTRS_KEY,
  withCustomAttrs,
} from './custom-attrs';

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
