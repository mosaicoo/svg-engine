import { type EditorPlugin, PLUGIN_API_VERSION } from '../../plugin/plugin';
import { type BrushLibraryItem, BrushLibraryService } from './brush-library.service';

/**
 * **D-060** — 3 built-in brushes covering the most common
 * variable-width stroke shapes:
 *
 * - **Uniform** — constant width. The "default brush" equivalent;
 *   exists so users can pick "no fancy effect" without unselecting
 *   the brush entirely.
 * - **Tapered** — thin at both ends, thick in the middle (classic
 *   marker stroke).
 * - **Calligraphic** — thin at the start, thick at the end. Mimics
 *   a pressure-sensitive nib leaving a trail (chisel-tip pen).
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

export const BUILTIN_BRUSHES: readonly BrushLibraryItem[] = [
  uniformBrush,
  taperedBrush,
  calligraphicBrush,
];

/**
 * **`builtinBrushesPlugin`** — D-060. Registers the 3 builtin
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
  name: 'Built-in brushes (3 calligraphic) — D-060',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const reg = ctx.injector.get(BrushLibraryService);
    for (const item of BUILTIN_BRUSHES) {
      ctx.track(reg.register(item));
    }
  },
};
