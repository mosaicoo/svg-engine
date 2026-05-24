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
export { type FlatRing, flattenPathD, ringsToPathD } from './path-flatten';
// D-055 — Live corners: derive a rounded `d` from an authored one.
export { roundPathCorners } from './round-corners';
