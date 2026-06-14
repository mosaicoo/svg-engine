export {
  collectNodeAncestorIds,
  findOwningNodeId,
  organizationalContainerPredicate,
  resolveNodeIdFromEvent,
  resolveSelectableNodeId,
  resolveSelectableNodeIdFromElement,
  type SelectableResolveOptions,
  type SelectionResolutionMode,
} from './hit-testing';
// D-091 — geometric hit-test fallback (hit slop / area selection).
export { DEFAULT_HIT_TOLERANCE_PX, geometricHitTestElement } from './geometric-hit-test';
