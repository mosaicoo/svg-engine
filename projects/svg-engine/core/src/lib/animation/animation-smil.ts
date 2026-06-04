import type { NodeId } from '../types/node-id';
import { STYLE_PROPERTY_NAMES, TRANSFORM_PROPERTY_NAMES } from './animatable-properties';
import type { AnimationDoc, AnimationTrack, Keyframe } from './animation-doc';
import { type EasingSpec, easingControlPoints } from './easing';

/**
 * **D-082 (Animation Timeline) — F9a.** Pure, headless serializer from the
 * {@link AnimationDoc} model to **SMIL** animation elements (`<animate>` /
 * `<animateTransform>`) — the first export target (native SVG animation, no
 * external runtime).
 *
 * **F9a scope**: geometry + style properties → `<animate>`. Transform
 * components (translate/rotate/scale) are emitted by F9b via
 * `<animateTransform>`; this phase intentionally SKIPS them so the geometry/
 * style path can ship and be spec-locked on its own. The function is wired into
 * the SVG exporter in F9c (behind an opt-in flag — it must never leak into the
 * AutoSave round-trip).
 *
 * **Faithful to the runtime preview** (`sampleAnimation`/`applyAnimationToTree`):
 * - **Hold at the ends** — `sampleTrack` holds the first value before the first
 *   keyframe and the last value after the last. Reproduced here by padding a
 *   synthetic constant point at `t=0` and `t=durationMs` when the track doesn't
 *   already reach them, so the SMIL `keyTimes` span the full `[0, 1]`.
 * - **Per-segment easing** — each keyframe carries the easing of the segment
 *   *starting* at it; emitted as `keySplines` with `calcMode="spline"`. When
 *   every segment is linear, `keySplines`/`calcMode` are omitted (linear is the
 *   SMIL default) for cleaner output.
 * - **Loop** — `repeatCount="indefinite"`, matching the live transport's loop.
 *
 * **Pure**: no DOM, no Angular. Returns element strings WITHOUT indentation;
 * the exporter (F9c) indents and injects them as children of the animated
 * element.
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
  // Leading hold: a constant segment from 0 to the first keyframe (linear, as
  // the value doesn't change across it).
  if (pts[0]!.t > 0) {
    pts.unshift({ t: 0, value: pts[0]!.value, easing: LINEAR });
  }
  // Trailing hold: a constant segment from the last keyframe to the end.
  const last = pts[pts.length - 1]!;
  if (last.t < durationMs) {
    pts.push({ t: durationMs, value: last.value, easing: LINEAR });
  }
  return pts;
}

/**
 * Serialize a single geometry/style track to one `<animate>` element, or
 * `null` when it can't animate (no keyframes, or fewer than 2 sample points
 * after padding). `attributeName` is the resolved SVG attribute.
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
  // One spline per segment (points - 1); the last point starts no segment.
  const splines = pts.slice(0, pts.length - 1).map((p) => splineFor(p.easing));
  const allLinear = splines.every((s) => s === '0 0 1 1');

  const attrs = [
    `attributeName="${attributeName}"`,
    `dur="${fmtNum(durationMs / 1000)}s"`,
    `repeatCount="indefinite"`,
    `keyTimes="${keyTimes}"`,
    `values="${escapeAttr(values)}"`,
  ];
  if (!allLinear) {
    attrs.push(`calcMode="spline"`);
    attrs.push(`keySplines="${splines.join(';')}"`);
  }
  return `<animate ${attrs.join(' ')} />`;
}

/**
 * Serialize every track of `doc` that targets `nodeId` into SMIL animation
 * element strings.
 *
 * **F9a**: geometry + style tracks → `<animate>` (sorted by attribute name for
 * deterministic output — multiple `<animate>` on distinct attributes are
 * order-independent in effect). Transform tracks are SKIPPED here (F9b adds
 * `<animateTransform>`). Returns `[]` when the node has no animatable tracks or
 * the duration is non-positive.
 */
export function animationToSmil(doc: AnimationDoc, nodeId: NodeId): string[] {
  if (doc.durationMs <= 0) return [];
  const collected: { readonly name: string; readonly el: string }[] = [];
  for (const track of doc.tracks) {
    if (track.nodeId !== nodeId) continue;
    if (TRANSFORM_PROPERTY_NAMES.has(track.property)) continue; // F9b
    const name = attributeNameFor(track.property);
    const el = buildAnimate(name, track, doc.durationMs);
    if (el !== null) collected.push({ name, el });
  }
  return collected.sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.el);
}
