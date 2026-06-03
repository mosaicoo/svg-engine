// **D-082 (Animation Timeline) — F0.** Pure, headless animation model:
// types + immutable helpers + easing + sampling. No Angular, no services,
// no UI — the contract that preview (F6) and export (F9+) both build on.
export { DEFAULT_EASING, easingControlPoints, evalEasing, type EasingSpec } from './easing';
export {
  ANIMATION_KEY,
  type AnimationDoc,
  type AnimationTrack,
  emptyAnimationDoc,
  findTrack,
  isAnimationDoc,
  type Keyframe,
  moveKeyframe,
  readAnimationDoc,
  removeKeyframe,
  setAnimationDuration,
  setKeyframeEasing,
  upsertKeyframe,
} from './animation-doc';
export {
  type AnimationSample,
  type AnimationValue,
  sampleAnimation,
  sampleTrack,
} from './sample-animation';
// F1 — value interpolation (number + color) and the non-destructive overlay.
export { interpolateValue, mixColor, parseColor } from './interpolate';
export { applyAnimationToTree } from './apply-animation';
// F3 — catalog of animatable properties per node type (timeline rows source).
export {
  type AnimatablePropertyDef,
  type AnimatablePropertyGroup,
  type AnimatablePropertyKind,
  animatablePropertiesForNode,
  findAnimatableProperty,
  readAnimatableValue,
  STYLE_PROPERTY_NAMES,
  TRANSFORM_PROPERTY_NAMES,
} from './animatable-properties';
