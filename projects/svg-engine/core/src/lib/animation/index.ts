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
  readAnimationDoc,
  removeKeyframe,
  upsertKeyframe,
} from './animation-doc';
export { type AnimationSample, sampleAnimation, sampleTrack } from './sample-animation';
