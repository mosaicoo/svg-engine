import { type EditorPlugin, PLUGIN_API_VERSION } from '../../plugin/plugin';
import { type BrushLibraryItem, BrushLibraryService } from './brush-library.service';

/**
 * **D-060** — 9 built-in brushes covering the most common
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
];

/**
 * **`builtinBrushesPlugin`** — D-060. Registers the 9 builtin
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
  name: 'Built-in brushes (9 calligraphic) — D-060',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const reg = ctx.injector.get(BrushLibraryService);
    for (const item of BUILTIN_BRUSHES) {
      ctx.track(reg.register(item));
    }
  },
};
