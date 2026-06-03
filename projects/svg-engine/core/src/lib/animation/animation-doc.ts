import type { SvgNode } from '../model/svg-node';
import type { NodeId } from '../types/node-id';
import { DEFAULT_EASING, type EasingSpec } from './easing';

/**
 * **D-082 (Animation Timeline) — F0.** Pure, immutable model for a page's
 * animation, plus its storage convention. Zero Angular; the source of truth
 * is the document tree (non-destructive "layer above" — see D-082).
 *
 * **Where it lives**: an {@link AnimationDoc} is stored on a *container*
 * node's `metadata.customData[ANIMATION_KEY]` (the active page, or the
 * document root when there are no pages). It NEVER touches the animated
 * shapes' own fields — the playhead derives the displayed values at runtime.
 *
 * **Time unit**: milliseconds (a neutral absolute unit — converts cleanly to
 * SMIL seconds / CSS percentages / Lottie frames in the future export phase).
 */

/** Key under `metadata.customData` where the page's AnimationDoc is stored. */
export const ANIMATION_KEY = 'svgeAnimation';

/**
 * A single keyframe: a property reaches `value` at `time` (ms). `easing`
 * shapes the interpolation of the segment **starting** at this keyframe
 * (toward the next one); it's ignored on the last keyframe of a track.
 *
 * **Value kinds** (F1): `number` for numeric properties (geometry, opacity,
 * transform components) and `string` for colors (`fill`/`stroke`). The
 * interpolator picks the right blend per kind; incompatible pairs hold
 * discretely (see `interpolateValue`).
 */
export interface Keyframe {
  /** Time in milliseconds from the timeline start. */
  readonly time: number;
  /** Value at `time` — number (numeric props) or string (colors). */
  readonly value: number | string;
  /** Easing of the segment starting here (toward the next keyframe). */
  readonly easing: EasingSpec;
}

/**
 * All keyframes for one `(nodeId, property)` pair. `property` is the real
 * SVG attribute / Inspector field name (`'x'`, `'opacity'`, `'cx'`,
 * `'rotation'`, …) — aligning the model with export targets so a serializer
 * needs no translation table.
 */
export interface AnimationTrack {
  readonly nodeId: NodeId;
  readonly property: string;
  /** Keyframes sorted ascending by `time`. */
  readonly keyframes: readonly Keyframe[];
}

/** A page's animation: the total duration plus the per-property tracks. */
export interface AnimationDoc {
  readonly durationMs: number;
  readonly tracks: readonly AnimationTrack[];
}

/** An empty animation with the given duration (default 1000 ms). */
export function emptyAnimationDoc(durationMs = 1000): AnimationDoc {
  return { durationMs, tracks: [] };
}

/** Read the AnimationDoc stored on a node, or `null` when none. */
export function readAnimationDoc(node: SvgNode | null): AnimationDoc | null {
  const raw = node?.metadata.customData?.[ANIMATION_KEY];
  return isAnimationDoc(raw) ? raw : null;
}

/** Structural guard for an {@link AnimationDoc} (defensive read of metadata). */
export function isAnimationDoc(value: unknown): value is AnimationDoc {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AnimationDoc).durationMs === 'number' &&
    Array.isArray((value as AnimationDoc).tracks)
  );
}

/** Find the track for `(nodeId, property)`, or `null`. */
export function findTrack(
  doc: AnimationDoc,
  nodeId: NodeId,
  property: string,
): AnimationTrack | null {
  return doc.tracks.find((t) => t.nodeId === nodeId && t.property === property) ?? null;
}

const TIME_EPS = 1e-6;

/**
 * Insert or replace a keyframe on `(nodeId, property)`, returning a NEW doc
 * (immutable). A keyframe at the same `time` (within epsilon) is replaced;
 * otherwise it's inserted keeping the track sorted by time. Creates the track
 * when absent. Missing `easing` defaults to {@link DEFAULT_EASING}.
 */
export function upsertKeyframe(
  doc: AnimationDoc,
  nodeId: NodeId,
  property: string,
  keyframe: Keyframe,
): AnimationDoc {
  const kf: Keyframe = { ...keyframe, easing: keyframe.easing ?? DEFAULT_EASING };
  const existing = findTrack(doc, nodeId, property);

  if (existing === null) {
    const track: AnimationTrack = { nodeId, property, keyframes: [kf] };
    return { ...doc, tracks: [...doc.tracks, track] };
  }

  const kept = existing.keyframes.filter((k) => Math.abs(k.time - kf.time) > TIME_EPS);
  const merged = [...kept, kf].sort((a, b) => a.time - b.time);
  const nextTracks = doc.tracks.map((t) => (t === existing ? { ...t, keyframes: merged } : t));
  return { ...doc, tracks: nextTracks };
}

/**
 * Remove the keyframe at `time` from `(nodeId, property)`, returning a NEW
 * doc. The track is dropped entirely when it becomes empty. No-op (same doc
 * by value) when nothing matches.
 */
export function removeKeyframe(
  doc: AnimationDoc,
  nodeId: NodeId,
  property: string,
  time: number,
): AnimationDoc {
  const existing = findTrack(doc, nodeId, property);
  if (existing === null) return doc;
  const remaining = existing.keyframes.filter((k) => Math.abs(k.time - time) > TIME_EPS);
  if (remaining.length === existing.keyframes.length) return doc; // nothing removed
  const nextTracks =
    remaining.length === 0
      ? doc.tracks.filter((t) => t !== existing)
      : doc.tracks.map((t) => (t === existing ? { ...t, keyframes: remaining } : t));
  return { ...doc, tracks: nextTracks };
}

/**
 * **F2.** Move the keyframe at `fromTime` on `(nodeId, property)` to `toTime`,
 * optionally replacing its value, returning a NEW doc. The easing is carried
 * over. Implemented as remove-then-upsert, so landing on a time that already
 * has a keyframe **replaces** it (upsert semantics). Returns the SAME doc
 * reference (no-op) when there is no keyframe at `fromTime`, or when the move
 * is a true identity (same time AND same value) — the latter lets the command
 * layer skip a redundant history entry.
 */
export function moveKeyframe(
  doc: AnimationDoc,
  nodeId: NodeId,
  property: string,
  fromTime: number,
  toTime: number,
  newValue?: number | string,
): AnimationDoc {
  const track = findTrack(doc, nodeId, property);
  if (track === null) return doc;
  const kf = track.keyframes.find((k) => Math.abs(k.time - fromTime) <= TIME_EPS);
  if (kf === undefined) return doc;
  // `??` (not `||`) so a numeric 0 / empty-string value is honored, not
  // treated as "keep old".
  const nextValue = newValue ?? kf.value;
  if (Math.abs(toTime - fromTime) <= TIME_EPS && nextValue === kf.value) return doc; // identity
  const without = removeKeyframe(doc, nodeId, property, fromTime);
  return upsertKeyframe(without, nodeId, property, {
    time: toTime,
    value: nextValue,
    easing: kf.easing,
  });
}

/**
 * **F2.** Replace the `easing` of the keyframe at `time` on
 * `(nodeId, property)`, returning a NEW doc. No-op (same doc) when the track
 * or keyframe is absent.
 */
export function setKeyframeEasing(
  doc: AnimationDoc,
  nodeId: NodeId,
  property: string,
  time: number,
  easing: EasingSpec,
): AnimationDoc {
  const track = findTrack(doc, nodeId, property);
  if (track === null) return doc;
  let found = false;
  const nextKeyframes = track.keyframes.map((k) => {
    if (Math.abs(k.time - time) <= TIME_EPS) {
      found = true;
      return { ...k, easing };
    }
    return k;
  });
  if (!found) return doc;
  const nextTracks = doc.tracks.map((t) => (t === track ? { ...t, keyframes: nextKeyframes } : t));
  return { ...doc, tracks: nextTracks };
}

/**
 * **F2.** Set the timeline `durationMs`, returning a NEW doc. Negative values
 * are clamped to `0`. No-op (same doc) when the duration is unchanged.
 */
export function setAnimationDuration(doc: AnimationDoc, durationMs: number): AnimationDoc {
  const clamped = durationMs < 0 ? 0 : durationMs;
  if (clamped === doc.durationMs) return doc; // no-op
  return { ...doc, durationMs: clamped };
}
