export {
  bakeEllipse,
  bakeGroup,
  bakeImage,
  bakeLine,
  bakePath,
  bakePolygon,
  bakePolyline,
  bakeRect,
  bakeScaleIntoNode,
  bakeText,
  isIdentityOrTranslate,
  scaleAxisInterval,
  scalePoint,
} from './scale-bake';
export {
  bakePathD,
  parsePathD,
  scalePathSegments,
  serializePathD,
  type PathCmd,
  type PathSegment,
} from './path-d-scaler';
export {
  composeTransform,
  decomposeTransform,
  type DecomposedTransform,
} from './transform-decompose';
export { getNodeBBox } from './node-bbox';
export {
  type AnchorKind,
  type AnchorPoint,
  type AnchorSubpath,
  anchorsToPathD,
  classifyAnchorKind,
  parsePathToAnchors,
} from './path-anchors';
