import { decomposeTransform } from '../geometry';
import type { NodeId } from '../types/node-id';
import type { Transform } from '../types/transform';
import { STYLE_PROPERTY_NAMES, TRANSFORM_PROPERTY_NAMES } from './animatable-properties';
import type { AnimationDoc, AnimationTrack, Keyframe } from './animation-doc';
import { type EasingSpec, easingControlPoints } from './easing';
import { sampleTrack } from './sample-animation';

/**
 * **D-082 (Animation Timeline) — F9a/F9b.** Pure, headless serializer from the
 * {@link AnimationDoc} model to **SMIL** animation elements (`<animate>` /
 * `<animateTransform>`) — the first export target (native SVG animation, no
 * external runtime).
 *
 * - **F9a** — geometry + style properties → `<animate attributeName="…">`.
 * - **F9b** — transform components (translate/rotate/scale) →
 *   `<animateTransform>` with `additive="sum"`, emitted in the order
 *   **translate → rotate → scale** so the composed result reproduces
 *   `composeTransform` (which is `T · R · S` about the origin). The serializer
 *   bakes any **static** transform components (read from the node's base
 *   transform) as constant `<animateTransform>` so dropping the static
 *   `transform` attribute on export doesn't lose them.
 *
 * **Faithful to the runtime preview** (`sampleAnimation`/`applyAnimationToTree`):
 * - **Hold at the ends** — `sampleTrack` holds the first value before the first
 *   keyframe and the last after the last. Reproduced by padding synthetic
 *   constant points at `t=0` and `t=durationMs`, so `keyTimes` span `[0, 1]`.
 * - **Per-segment easing** — emitted as `keySplines` + `calcMode="spline"`,
 *   omitted when every segment is linear (the SMIL default).
 * - **Loop** — `repeatCount="indefinite"`, matching the transport's loop.
 *
 * **Transform fidelity note**: a single animated transform axis (e.g. only
 * `translateX`, the other axis static) keeps its exact per-segment easing via
 * `keySplines`. When BOTH axes of a translate/scale pair are independently
 * animated, the pair is sampled (eased) at the union of their keyframe times
 * with linear interpolation between samples — exact at every keyframe, a mild
 * linearization within segments only when an axis uses non-linear easing.
 *
 * **Pure**: no DOM, no Angular. Returns element strings WITHOUT indentation;
 * the exporter (F9c) indents and injects them as children of the element.
 */

/**
 * Map a model **style** property key (camelCase, as stored on `node.style`) to
 * its real SVG attribute name. Geometry keys (`x`, `cx`, `width`, …) are
 * already SVG attribute names and need no mapping.
 */
const STYLE_ATTR_NAME: Readonly<Record<string, string>> = {
  opacity: 'opacity',
  fill: 'fill',
  stroke: 'stroke',
  fillOpacity: 'fill-opacity',
  strokeOpacity: 'stroke-opacity',
  strokeWidth: 'stroke-width',
};

/** Resolve the SVG attribute name a track animates (`<animate attributeName>`). */
function attributeNameFor(property: string): string {
  if (STYLE_PROPERTY_NAMES.has(property)) return STYLE_ATTR_NAME[property] ?? property;
  return property; // geometry props are already SVG attribute names
}

/**
 * Format a number to a stable string (6-decimal round, strip trailing zeros,
 * normalize `-0`) — mirrors the SVG exporter's `fmt` so SMIL values share the
 * same deterministic, diff-friendly formatting.
 */
function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** Coerce an animation value to a number (transform components are numeric). */
function asNum(value: number | string): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Format a keyframe value: numbers via {@link fmtNum}, color strings verbatim. */
function fmtValue(value: number | string): string {
  return typeof value === 'number' ? fmtNum(value) : value;
}

/** XML-escape an attribute value (defensive — color/number values are tame). */
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** `keySplines` control-point string for a segment's STARTING easing. */
function splineFor(easing: EasingSpec): string {
  const pts = easingControlPoints(easing);
  if (pts === null) return '0 0 1 1'; // linear (identity)
  return `${fmtNum(pts[0])} ${fmtNum(pts[1])} ${fmtNum(pts[2])} ${fmtNum(pts[3])}`;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** One resolved SMIL sample point (time clamped to the timeline, plus value). */
interface SmilPoint {
  readonly t: number;
  readonly value: number | string;
  /** Easing of the segment that STARTS at this point (toward the next). */
  readonly easing: EasingSpec;
}

const LINEAR: EasingSpec = { kind: 'linear' };

/**
 * Build the ordered SMIL sample points for a track over `[0, durationMs]`,
 * reproducing `sampleTrack`'s end HOLD: prepend a constant point at `t=0`
 * (first keyframe's value) when the first keyframe is later, and append one at
 * `t=durationMs` (last value) when the last keyframe is earlier. Keyframe times
 * are clamped into `[0, durationMs]`. Guarantees the first point is at `t=0`
 * and the last at `t=durationMs`, so normalized `keyTimes` span `[0, 1]`.
 */
function buildPoints(kfs: readonly Keyframe[], durationMs: number): SmilPoint[] {
  if (kfs.length === 0) return [];
  const pts: SmilPoint[] = kfs.map((k) => ({
    t: clamp(k.time, 0, durationMs),
    value: k.value,
    easing: k.easing,
  }));
  if (pts[0]!.t > 0) {
    pts.unshift({ t: 0, value: pts[0]!.value, easing: LINEAR });
  }
  const last = pts[pts.length - 1]!;
  if (last.t < durationMs) {
    pts.push({ t: durationMs, value: last.value, easing: LINEAR });
  }
  return pts;
}

/** Assemble an `<animate>` / `<animateTransform>` element from its parts. */
function buildElement(
  tag: 'animate' | 'animateTransform',
  leadAttrs: readonly string[],
  durationMs: number,
  keyTimes: string,
  values: string,
  splines: readonly string[] | null,
): string {
  const attrs = [
    ...leadAttrs,
    `dur="${fmtNum(durationMs / 1000)}s"`,
    `repeatCount="indefinite"`,
    ...(tag === 'animateTransform' ? ['additive="sum"'] : []),
    `keyTimes="${keyTimes}"`,
    `values="${escapeAttr(values)}"`,
  ];
  if (splines !== null) {
    attrs.push(`calcMode="spline"`, `keySplines="${splines.join(';')}"`);
  }
  return `<${tag} ${attrs.join(' ')} />`;
}

/** Per-segment splines for a point list, or `null` when every segment is linear. */
function splinesFor(pts: readonly SmilPoint[]): string[] | null {
  const splines = pts.slice(0, pts.length - 1).map((p) => splineFor(p.easing));
  return splines.every((s) => s === '0 0 1 1') ? null : splines;
}

/**
 * Serialize a single geometry/style track to one `<animate>` element, or
 * `null` when it can't animate. `attributeName` is the resolved SVG attribute.
 */
function buildAnimate(
  attributeName: string,
  track: AnimationTrack,
  durationMs: number,
): string | null {
  if (track.keyframes.length === 0) return null;
  const pts = buildPoints(track.keyframes, durationMs);
  if (pts.length < 2) return null;
  const keyTimes = pts.map((p) => fmtNum(p.t / durationMs)).join(';');
  const values = pts.map((p) => fmtValue(p.value)).join(';');
  return buildElement(
    'animate',
    [`attributeName="${attributeName}"`],
    durationMs,
    keyTimes,
    values,
    splinesFor(pts),
  );
}

// ── F9b — transform components → <animateTransform> ─────────────────

/** The union of two tracks' (clamped) keyframe times, padded with 0 and end. */
function unionTimes(tracks: readonly AnimationTrack[], durationMs: number): number[] {
  const set = new Set<number>([0, durationMs]);
  for (const tr of tracks) {
    for (const k of tr.keyframes) set.add(clamp(k.time, 0, durationMs));
  }
  return [...set].sort((a, b) => a - b);
}

/** `<animateTransform type="rotate">` for the single rotation component (degrees). */
function buildRotate(
  track: AnimationTrack | null,
  staticDeg: number,
  durationMs: number,
): string | null {
  const lead = ['attributeName="transform"', 'type="rotate"'];
  if (track === null) {
    // Bake the static rotation as a constant so it survives the dropped attr.
    if (staticDeg === 0) return null;
    const v = fmtNum(staticDeg);
    return buildElement('animateTransform', lead, durationMs, '0;1', `${v};${v}`, null);
  }
  const pts = buildPoints(track.keyframes, durationMs);
  if (pts.length < 2) return null;
  const keyTimes = pts.map((p) => fmtNum(p.t / durationMs)).join(';');
  const values = pts.map((p) => fmtNum(asNum(p.value))).join(';'); // rotation in degrees
  return buildElement('animateTransform', lead, durationMs, keyTimes, values, splinesFor(pts));
}

/**
 * `<animateTransform type="translate"|"scale">` for a 2-component group.
 * `identityVal` is the no-op (0 for translate, 1 for scale): when neither axis
 * is animated and both statics equal it, the element is skipped.
 */
function buildPair(
  type: 'translate' | 'scale',
  trackA: AnimationTrack | null,
  trackB: AnimationTrack | null,
  staticA: number,
  staticB: number,
  identityVal: number,
  durationMs: number,
): string | null {
  const lead = ['attributeName="transform"', `type="${type}"`];
  // Neither axis animated → constant (preserve static under additive sum).
  if (trackA === null && trackB === null) {
    if (staticA === identityVal && staticB === identityVal) return null;
    const v = `${fmtNum(staticA)},${fmtNum(staticB)}`;
    return buildElement('animateTransform', lead, durationMs, '0;1', `${v};${v}`, null);
  }
  // Exactly one axis animated → raw values + exact per-segment keySplines.
  if (trackA === null || trackB === null) {
    const track = (trackA ?? trackB)!;
    const isA = trackA !== null;
    const pts = buildPoints(track.keyframes, durationMs);
    if (pts.length >= 2) {
      const keyTimes = pts.map((p) => fmtNum(p.t / durationMs)).join(';');
      const values = pts
        .map((p) => {
          const a = isA ? asNum(p.value) : staticA;
          const b = isA ? staticB : asNum(p.value);
          return `${fmtNum(a)},${fmtNum(b)}`;
        })
        .join(';');
      return buildElement('animateTransform', lead, durationMs, keyTimes, values, splinesFor(pts));
    }
  }
  // Both axes animated → sample (eased) at the union of keyframe times, linear
  // between samples (exact at every keyframe; intra-segment linearized).
  const times = unionTimes(
    [trackA, trackB].filter((t): t is AnimationTrack => t !== null),
    durationMs,
  );
  const keyTimes = times.map((t) => fmtNum(t / durationMs)).join(';');
  const values = times
    .map((t) => {
      const a = trackA !== null ? asNum(sampleTrack(trackA, t) ?? staticA) : staticA;
      const b = trackB !== null ? asNum(sampleTrack(trackB, t) ?? staticB) : staticB;
      return `${fmtNum(a)},${fmtNum(b)}`;
    })
    .join(';');
  return buildElement('animateTransform', lead, durationMs, keyTimes, values, null);
}

/**
 * Build the `<animateTransform>` elements for a node's transform tracks, in the
 * additive order **translate → rotate → scale** (matching `composeTransform`'s
 * `T · R · S`). `baseTransform` supplies the static value for any transform
 * component that isn't animated. Returns `[]` when no transform component is
 * animated.
 */
function buildTransformElements(
  byProp: ReadonlyMap<string, AnimationTrack>,
  durationMs: number,
  baseTransform: Transform | undefined,
): string[] {
  if (byProp.size === 0) return [];
  const d =
    baseTransform !== undefined
      ? decomposeTransform(baseTransform)
      : { tx: 0, ty: 0, rotationRad: 0, scaleX: 1, scaleY: 1 };
  const out: string[] = [];
  const translate = buildPair(
    'translate',
    byProp.get('translateX') ?? null,
    byProp.get('translateY') ?? null,
    d.tx,
    d.ty,
    0,
    durationMs,
  );
  if (translate !== null) out.push(translate);
  const rotate = buildRotate(
    byProp.get('rotation') ?? null,
    (d.rotationRad * 180) / Math.PI,
    durationMs,
  );
  if (rotate !== null) out.push(rotate);
  const scale = buildPair(
    'scale',
    byProp.get('scaleX') ?? null,
    byProp.get('scaleY') ?? null,
    d.scaleX,
    d.scaleY,
    1,
    durationMs,
  );
  if (scale !== null) out.push(scale);
  return out;
}

/**
 * Serialize every track of `doc` that targets `nodeId` into SMIL animation
 * element strings.
 *
 * - Geometry + style tracks → `<animate>` (sorted by attribute name for
 *   deterministic output — distinct-attribute `<animate>` are order-independent
 *   in effect).
 * - Transform tracks → `<animateTransform>` (translate → rotate → scale,
 *   `additive="sum"`). `baseTransform` (the node's static transform) bakes any
 *   non-animated transform component as a constant; pass it so the exporter can
 *   drop the static `transform` attribute without losing those components.
 *
 * Returns `[]` when the node has no animatable tracks or the duration is
 * non-positive.
 */
export function animationToSmil(
  doc: AnimationDoc,
  nodeId: NodeId,
  baseTransform?: Transform,
): string[] {
  if (doc.durationMs <= 0) return [];
  const dur = doc.durationMs;
  const animateEls: { readonly name: string; readonly el: string }[] = [];
  const transformTracks = new Map<string, AnimationTrack>();
  for (const track of doc.tracks) {
    if (track.nodeId !== nodeId) continue;
    if (TRANSFORM_PROPERTY_NAMES.has(track.property)) {
      transformTracks.set(track.property, track);
      continue;
    }
    const name = attributeNameFor(track.property);
    const el = buildAnimate(name, track, dur);
    if (el !== null) animateEls.push({ name, el });
  }
  const sorted = animateEls.sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.el);
  return [...sorted, ...buildTransformElements(transformTracks, dur, baseTransform)];
}
