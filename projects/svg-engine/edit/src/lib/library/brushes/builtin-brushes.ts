import { type EditorPlugin, PLUGIN_API_VERSION } from '../../plugin/plugin';
import { type BrushLibraryItem, BrushLibraryService } from './brush-library.service';

/**
 * **D-060** — 18 built-in brushes covering the most common
 * variable-width stroke shapes:
 *
 * - **Uniform** — constant width. The "default brush" equivalent;
 *   exists so users can pick "no fancy effect" without unselecting
 *   the brush entirely.
 * - **Tapered** — thin at both ends, thick in the middle (classic
 *   marker stroke).
 * - **Calligraphic** — thin at the start, thick at the end. Mimics
 *   a pressure-sensitive nib leaving a trail (chisel-tip pen).
 * - **Brush Pen** — quick swell to full, then a long taper to a fine
 *   point (lettering / signature down-stroke).
 * - **Wedge** — thick→thin linear taper (angled chisel; the inverse
 *   ramp of Calligraphic).
 * - **Spindle** — sharp triangular peak, pointed at both ends
 *   (leaf / diamond).
 * - **Ribbon** — undulating sine humps, never pinching to zero
 *   (folded ribbon / bamboo).
 * - **Comet** — blunt thick head easing to a long fine tail
 *   (teardrop).
 * - **Bulge** — fat exaggerated belly (peaks past base width) with
 *   thin non-zero ends (brush-blob accent).
 * - **Ramp** — linear thin→thick (growing mirror of Wedge).
 * - **Swell** — eased thin→thick (`t^1.7`; mirror of Comet).
 * - **Marker** — rounded trapezoid, near-uniform fat body with soft
 *   non-zero ends (felt-tip / highlighter).
 * - **Flared** — inverted waist: thick ends, pinched middle
 *   (bone / serif terminals).
 * - **Swash** — long thin lead, fat LATE belly (peak ≈0.71), drop to
 *   a point (calligraphic entry-swash / comma).
 * - **Beads** — pinching periodic bumps (5 `sin²` humps; string of
 *   pearls).
 * - **Bamboo** — full stroke with sharp narrow notches (4 joints;
 *   inverse texture of Beads).
 * - **Twin** — two symmetric humps pinched at ends + middle
 *   (dumbbell).
 * - **Rough** — deterministic hand-drawn irregularity (sum of
 *   incommensurate sines; charcoal / dry-brush).
 *
 * **Profile sampling**: more samples = smoother width transition.
 * 16 samples is enough for visually-smooth modulation across typical
 * pencil strokes (which themselves have ~50-500 points). The
 * expansion algorithm linearly interpolates between samples.
 *
 * **Why not more variants in v1**: Illustrator ships dozens of
 * brushes, but most are art/scatter brushes which require a more
 * complex data model (path-along-path, symbol scattering). Those
 * are deferred — D-060 v1 covers the calligraphic family fully,
 * which already gives users a real "Pencil + Brush" workflow.
 */

const SAMPLES = 16;

/** Generate N evenly-spaced samples of `f(t)` with t ∈ [0, 1]. */
function sample(f: (t: number) => number): readonly number[] {
  const out: number[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    out.push(f(i / (SAMPLES - 1)));
  }
  return out;
}

/** Uniform — flat 1.0 (no modulation, equivalent to a regular pen). */
export const uniformBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.uniform',
  name: 'Uniform',
  category: 'calligraphic',
  baseWidth: 6,
  widthProfile: sample(() => 1),
};

/** Tapered — 0 → 1 → 0 (sin curve). Marker-like profile. */
export const taperedBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.tapered',
  name: 'Tapered',
  category: 'calligraphic',
  baseWidth: 12,
  widthProfile: sample((t) => Math.sin(t * Math.PI)),
};

/**
 * Calligraphic — gentle ramp from 0.2 to 1.0 then ease to 0.3 at the
 * tail. Mimics a chisel-tip pen losing pressure at the stroke end.
 */
export const calligraphicBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.calligraphic',
  name: 'Calligraphic',
  category: 'calligraphic',
  baseWidth: 10,
  widthProfile: sample((t) => {
    if (t < 0.15) return 0.2 + (t / 0.15) * 0.8; // ramp up
    if (t < 0.7) return 1.0; // plateau
    return 1.0 - ((t - 0.7) / 0.3) * 0.7; // ease down
  }),
};

// ── 6 additional brushes ───────────────────────────────────────────
// Each is a distinct width-along-the-stroke profile (every value ≥ 0;
// values may exceed 1 for exaggerated bulge). Same `sample()` machinery
// as the originals — the Pencil expansion linearly interpolates between
// samples, so smooth functions read as smooth strokes.

/**
 * Brush Pen — a quick swell to full width then a long, smooth taper to a
 * fine point. The lettering/signature staple (thick down-stroke that
 * trails off).
 */
export const brushPenBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.brush-pen',
  name: 'Brush Pen',
  category: 'calligraphic',
  baseWidth: 10,
  widthProfile: sample((t) =>
    t < 0.18 ? 0.25 + (t / 0.18) * 0.75 : Math.max(0, 1 - (t - 0.18) / 0.82),
  ),
};

/**
 * Wedge — thick at the start, linear taper to a thin (not zero) end.
 * A flat/angled chisel stroke; opposite ramp direction to Calligraphic.
 */
export const wedgeBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.wedge',
  name: 'Wedge',
  category: 'calligraphic',
  baseWidth: 12,
  widthProfile: sample((t) => 1 - t * 0.85),
};

/**
 * Spindle — sharp triangular peak: pinched to a point at BOTH ends, max
 * in the middle. Sharper than Tapered's sine (more "leaf"/diamond-like).
 */
export const spindleBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.spindle',
  name: 'Spindle',
  category: 'calligraphic',
  baseWidth: 12,
  widthProfile: sample((t) => 1 - Math.abs(2 * t - 1)),
};

/**
 * Ribbon — undulating width (a few sine humps along the stroke), never
 * pinching to zero. Reads like a folded ribbon / bamboo segments.
 */
export const ribbonBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.ribbon',
  name: 'Ribbon',
  category: 'calligraphic',
  baseWidth: 10,
  widthProfile: sample((t) => 0.55 + 0.45 * Math.sin(t * Math.PI * 6)),
};

/**
 * Comet — blunt, thick head easing to a long fine tail (teardrop). The
 * eased power curve lingers thick before thinning fast.
 */
export const cometBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.comet',
  name: 'Comet',
  category: 'calligraphic',
  baseWidth: 14,
  widthProfile: sample((t) => Math.pow(1 - t, 1.7)),
};

/**
 * Bulge — fat, rounded belly with thin (non-zero) ends, exaggerated past
 * the base width in the middle (profile peaks at 1.25). A dramatic
 * brush-blob accent.
 */
export const bulgeBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.bulge',
  name: 'Bulge',
  category: 'calligraphic',
  baseWidth: 9,
  widthProfile: sample((t) => 0.25 + Math.sin(t * Math.PI)),
};

// ── 9 more brushes (round 2) ───────────────────────────────────────
// Fills profile categories the first batch didn't cover: monotonic
// GROWTH (Wedge/Comet only shrank), inverted waist, late-weighted
// asymmetry, pinching/notched periodics (vs Ribbon's smooth wave),
// twin-hump, and deterministic hand-drawn roughness. Same sample()
// machinery; every value ≥ 0 (Rough is clamped + may overshoot 1 like
// Bulge, which is intentional for exaggerated effects).

/** Ramp — linear thin→thick (0.15 → 1.0). The growing mirror of Wedge. */
export const rampBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.ramp',
  name: 'Ramp',
  category: 'calligraphic',
  baseWidth: 13,
  widthProfile: sample((t) => 0.15 + t * 0.85),
};

/**
 * Swell — eased thin→thick (accelerating growth, `t^1.7`). The mirror of
 * Comet: lingers thin then swells fast into a blunt end.
 */
export const swellBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.swell',
  name: 'Swell',
  category: 'calligraphic',
  baseWidth: 14,
  widthProfile: sample((t) => Math.pow(t, 1.7)),
};

/**
 * Marker — rounded trapezoid: a fat, near-uniform body with softly
 * tapered (non-zero, floor 0.55) ends. A felt-tip / highlighter feel,
 * less dramatic than Calligraphic's asymmetric ramp.
 */
export const markerBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.marker',
  name: 'Marker',
  category: 'calligraphic',
  baseWidth: 11,
  widthProfile: sample((t) => {
    const edge = 0.12;
    if (t < edge) return 0.55 + (t / edge) * 0.45; // round up
    if (t > 1 - edge) return 0.55 + ((1 - t) / edge) * 0.45; // round down
    return 1.0; // flat body
  }),
};

/**
 * Flared — INVERTED waist: thick at both ends, pinched thin (0.25) in the
 * middle. The opposite of Tapered — reads like a bone / dog-bone or
 * serif terminals on a thin stem.
 */
export const flaredBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.flared',
  name: 'Flared',
  category: 'calligraphic',
  baseWidth: 12,
  widthProfile: sample((t) => 1 - 0.75 * Math.sin(t * Math.PI)),
};

/**
 * Swash — a long, thin lead-in that swells to a fat belly LATE (peak at
 * t≈0.71 via `sin(t²·π)`) then drops fast to a point. The calligraphic
 * entry-swash / comma stroke.
 */
export const swashBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.swash',
  name: 'Swash',
  category: 'calligraphic',
  baseWidth: 13,
  widthProfile: sample((t) => Math.sin(t * t * Math.PI)),
};

/**
 * Beads — pinching periodic bumps (`sin²`, 5 humps, floor 0.2). A string
 * of pearls / bamboo-of-beads. Distinct from Ribbon, which is a smooth
 * wave that never pinches.
 */
export const beadsBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.beads',
  name: 'Beads',
  category: 'calligraphic',
  baseWidth: 11,
  widthProfile: sample((t) => 0.2 + 0.8 * Math.sin(t * Math.PI * 5) ** 2),
};

/**
 * Bamboo — a mostly-full stroke interrupted by sharp, narrow notches
 * (`|sin|^6`, 4 joints, dips to 0.3). The inverse texture of Beads:
 * thick segments separated by thin nodes.
 */
export const bambooBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.bamboo',
  name: 'Bamboo',
  category: 'calligraphic',
  baseWidth: 11,
  widthProfile: sample((t) => 1 - 0.7 * Math.abs(Math.sin(t * Math.PI * 4)) ** 6),
};

/**
 * Twin — two symmetric humps (`sin²`, peaks at t=0.25 & 0.75) pinched at
 * both ends and the middle (floor 0.25). A double-bulge / dumbbell.
 */
export const twinBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.twin',
  name: 'Twin',
  category: 'calligraphic',
  baseWidth: 12,
  widthProfile: sample((t) => 0.25 + 0.75 * Math.sin(t * Math.PI * 2) ** 2),
};

/**
 * Rough — deterministic hand-drawn irregularity: a sum of incommensurate
 * sines (freqs 7/17/29) around 0.62, clamped to a 0.12 floor and allowed
 * to overshoot 1 slightly. A charcoal / dry-brush texture. Deterministic
 * (no `Math.random`) so the profile is stable across reloads.
 */
export const roughBrush: BrushLibraryItem = {
  id: 'svge.builtin.brush.rough',
  name: 'Rough',
  category: 'calligraphic',
  baseWidth: 12,
  widthProfile: sample((t) =>
    Math.max(
      0.12,
      0.62 +
        0.22 * Math.sin(t * Math.PI * 7) +
        0.13 * Math.sin(t * Math.PI * 17 + 1) +
        0.08 * Math.sin(t * Math.PI * 29 + 2),
    ),
  ),
};

export const BUILTIN_BRUSHES: readonly BrushLibraryItem[] = [
  uniformBrush,
  taperedBrush,
  calligraphicBrush,
  brushPenBrush,
  wedgeBrush,
  spindleBrush,
  ribbonBrush,
  cometBrush,
  bulgeBrush,
  rampBrush,
  swellBrush,
  markerBrush,
  flaredBrush,
  swashBrush,
  beadsBrush,
  bambooBrush,
  twinBrush,
  roughBrush,
];

/**
 * **`builtinBrushesPlugin`** — D-060. Registers the 18 builtin
 * brushes. When installed, the libraries panel shows a "Brushes"
 * section; clicking a brush selects it via `BrushSelectionService`;
 * subsequent Pencil strokes get expanded through the brush's
 * `widthProfile`.
 *
 * **Opt-in** like all D-048-family library plugins. Apps that don't
 * install this plugin see the Pencil behavior unchanged
 * (`BrushSelectionService.selectedBrushId() === null` →
 * `pencilToolPlugin` keeps its centerline-stroke output).
 */
export const builtinBrushesPlugin: EditorPlugin = {
  id: 'svge.builtin.brushes',
  name: 'Built-in brushes (18 calligraphic) — D-060',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const reg = ctx.injector.get(BrushLibraryService);
    for (const item of BUILTIN_BRUSHES) {
      ctx.track(reg.register(item));
    }
  },
};
