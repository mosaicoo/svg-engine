import type { NodeId } from '../types/node-id';
import type { AnimationDoc, AnimationTrack } from './animation-doc';
import { evalEasing } from './easing';
import { interpolateValue } from './interpolate';

/**
 * **D-082 (Animation Timeline) — F0/F1.** Sample an {@link AnimationDoc} at a
 * given time, producing the set of property overrides to apply.
 *
 * The result is `nodeId → (property → value)`. `applyAnimationToTree(baseTree,
 * sample)` (F1) feeds this into the tree to derive the displayed tree
 * non-destructively — the base document is never mutated.
 *
 * Pure, headless. Values are `number` (numeric props / transform components)
 * or `string` (colors); interpolation per kind is handled by
 * {@link interpolateValue}.
 */
export type AnimationValue = number | string;
export type AnimationSample = ReadonlyMap<NodeId, ReadonlyMap<string, AnimationValue>>;

/**
 * Interpolate a single track at `timeMs`:
 * - empty track → `null` (no override);
 * - before the first keyframe / after the last → that keyframe's value (hold);
 * - between two keyframes → `interpolateValue` blended by the easing of the
 *   segment's STARTING keyframe.
 */
export function sampleTrack(track: AnimationTrack, timeMs: number): AnimationValue | null {
  const ks = track.keyframes;
  if (ks.length === 0) return null;
  const first = ks[0]!;
  const last = ks[ks.length - 1]!;
  if (timeMs <= first.time) return first.value;
  if (timeMs >= last.time) return last.value;
  for (let i = 1; i < ks.length; i++) {
    const b = ks[i]!;
    if (timeMs <= b.time) {
      const a = ks[i - 1]!;
      const span = b.time - a.time;
      const local = span <= 0 ? 0 : (timeMs - a.time) / span;
      const eased = evalEasing(a.easing, local);
      return interpolateValue(a.value, b.value, eased);
    }
  }
  return last.value; // unreachable (guarded above)
}

/**
 * Sample every track of `doc` at `timeMs`, grouped by node. Tracks with no
 * keyframes are skipped, so a node only appears when it has at least one
 * overridden property.
 */
export function sampleAnimation(doc: AnimationDoc, timeMs: number): AnimationSample {
  const out = new Map<NodeId, Map<string, AnimationValue>>();
  for (const track of doc.tracks) {
    const value = sampleTrack(track, timeMs);
    if (value === null) continue;
    let byProp = out.get(track.nodeId);
    if (byProp === undefined) {
      byProp = new Map<string, AnimationValue>();
      out.set(track.nodeId, byProp);
    }
    byProp.set(track.property, value);
  }
  return out;
}
