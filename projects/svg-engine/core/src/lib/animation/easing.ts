/**
 * **D-082 (Animation Timeline) — F0.** Easing (timing functions) for the
 * animation model.
 *
 * **Export-aware by design**: every easing resolves to a **cubic Bézier**
 * (the named presets map to the standard CSS control points). This keeps the
 * model representable by every realistic export target — CSS
 * `cubic-bezier(...)`, SMIL `keySplines`, Lottie bezier handles — so the
 * future export phases (D-082 F9+) are a serializer, not a redesign.
 *
 * Pure, headless, zero Angular. Values are in normalized `[0, 1]` progress.
 */

/**
 * An easing specification. Named presets are shorthand for well-known cubic
 * Bézier curves; `cubicBezier` is the escape hatch for custom curves (the UI
 * bezier editor in a later phase emits this).
 */
export type EasingSpec =
  | { readonly kind: 'linear' }
  | { readonly kind: 'easeIn' }
  | { readonly kind: 'easeOut' }
  | { readonly kind: 'easeInOut' }
  | {
      readonly kind: 'cubicBezier';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    };

/** Default easing for a new keyframe segment. */
export const DEFAULT_EASING: EasingSpec = { kind: 'linear' };

/**
 * Control points for the named presets (CSS-standard values). `linear` is
 * handled as the identity and isn't in this map.
 */
const PRESET_POINTS: Record<
  'easeIn' | 'easeOut' | 'easeInOut',
  readonly [number, number, number, number]
> = {
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
};

/**
 * Resolve an {@link EasingSpec} to its cubic-Bézier control points, or `null`
 * for `linear` (the identity — no curve needed). Exposed so exporters can
 * emit `keySplines` / `cubic-bezier()` directly from the model.
 */
export function easingControlPoints(
  spec: EasingSpec,
): readonly [number, number, number, number] | null {
  switch (spec.kind) {
    case 'linear':
      return null;
    case 'cubicBezier':
      return [spec.x1, spec.y1, spec.x2, spec.y2];
    default:
      return PRESET_POINTS[spec.kind];
  }
}

// ── Cubic Bézier easing evaluation (WebKit UnitBezier algorithm) ──────────

function sampleCurve(a: number, b: number, c: number, t: number): number {
  // ((a·t + b)·t + c)·t — Horner form of the 1D cubic with P0=0, P3=1.
  return ((a * t + b) * t + c) * t;
}

function sampleDerivative(a: number, b: number, c: number, t: number): number {
  return (3 * a * t + 2 * b) * t + c;
}

/**
 * Solve for the Bézier parameter `u` such that the curve's x-coordinate
 * equals `x` (the time progress), using Newton-Raphson with a bisection
 * fallback. Mirrors browsers' timing-function evaluation.
 */
function solveForU(x: number, ax: number, bx: number, cx: number): number {
  let u = x;
  // Newton-Raphson — fast when the derivative is well-behaved.
  for (let i = 0; i < 8; i++) {
    const xAtU = sampleCurve(ax, bx, cx, u) - x;
    if (Math.abs(xAtU) < 1e-6) return u;
    const d = sampleDerivative(ax, bx, cx, u);
    if (Math.abs(d) < 1e-6) break;
    u -= xAtU / d;
  }
  // Bisection fallback — guaranteed to converge within the bracket.
  let lo = 0;
  let hi = 1;
  u = x;
  while (lo < hi) {
    const xAtU = sampleCurve(ax, bx, cx, u);
    if (Math.abs(xAtU - x) < 1e-6) return u;
    if (x > xAtU) lo = u;
    else hi = u;
    u = (hi - lo) * 0.5 + lo;
  }
  return u;
}

/**
 * Evaluate the eased progress for a normalized time `t ∈ [0, 1]`. Returns the
 * normalized output progress (also typically in `[0, 1]`, though some curves
 * overshoot). `t` outside `[0, 1]` is clamped.
 *
 * Used by `sampleAnimation` to shape the interpolation between two keyframes.
 */
export function evalEasing(spec: EasingSpec, t: number): number {
  const tt = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const pts = easingControlPoints(spec);
  if (pts === null) return tt; // linear / identity
  const [x1, y1, x2, y2] = pts;
  // Precompute polynomial coefficients for x(u) and y(u).
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const u = solveForU(tt, ax, bx, cx);
  return sampleCurve(ay, by, cy, u);
}
