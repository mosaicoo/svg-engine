import {
  createEllipse,
  createGroup,
  createPath,
  createRect,
  type SvgDocument,
  type SvgNode,
} from 'svg-engine/core';

/**
 * Synthetic document generator used by the `/benchmark` page (ex `/perf`,
 * renamed in D-041 — Fase 6a).
 *
 * **Determinism**: a Mulberry32 PRNG seeded by `seed` (default 42) means
 * the SAME (count, seed) ALWAYS produces the SAME tree — so before/after
 * measurements compare like-for-like without random noise. Change the seed
 * to get a different shape distribution.
 *
 * **Composition**: nodes are placed as a flat list under root (no nested
 * groups). Mix is roughly:
 * - 50% rect
 * - 30% ellipse
 * - 20% path (small triangle)
 *
 * **Size**: 1200 × 800 viewBox; nodes 12-90px on each axis. Numbers were
 * picked to give a visually-dense canvas at 1k+ nodes without massive
 * overlap (so renderer hit-testing has meaningful work to do).
 *
 * **What this is NOT**:
 * - Not a benchmark of import (which has its own SVG-parsing cost).
 *   For that, serialize this doc via `svgExporter` and re-import.
 * - Not a representative "real world" document — real docs have nested
 *   groups, gradients, clipPaths. This is intentionally simple to
 *   isolate render/transform cost from defs-resolution cost.
 */
export interface SyntheticDocOptions {
  readonly count: number;
  readonly seed?: number;
  readonly viewBoxWidth?: number;
  readonly viewBoxHeight?: number;
}

const PALETTE = [
  '#ef9a9a',
  '#90caf9',
  '#a5d6a7',
  '#fff59d',
  '#ce93d8',
  '#ffab91',
  '#80cbc4',
  '#bcaaa4',
] as const;

export function createSyntheticDoc(options: SyntheticDocOptions): SvgDocument {
  const count = Math.max(0, Math.floor(options.count));
  const vbWidth = options.viewBoxWidth ?? 1200;
  const vbHeight = options.viewBoxHeight ?? 800;
  const rng = mulberry32(options.seed ?? 42);

  const children: SvgNode[] = [];
  for (let i = 0; i < count; i++) {
    const kindRoll = rng();
    const x = Math.floor(rng() * (vbWidth - 90));
    const y = Math.floor(rng() * (vbHeight - 90));
    const w = 12 + Math.floor(rng() * 78);
    const h = 12 + Math.floor(rng() * 78);
    const fill = PALETTE[Math.floor(rng() * PALETTE.length)]!;
    const style = { fill, stroke: '#333', strokeWidth: 1 } as const;

    if (kindRoll < 0.5) {
      children.push(createRect({ x, y, width: w, height: h }, { style }));
    } else if (kindRoll < 0.8) {
      children.push(
        createEllipse({ cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 }, { style }),
      );
    } else {
      children.push(createPath(`M${x} ${y} L${x + w} ${y} L${x + w / 2} ${y + h} Z`, { style }));
    }
  }

  return {
    id: 'perf-doc' as never,
    viewBox: { x: 0, y: 0, width: vbWidth, height: vbHeight },
    root: createGroup(children, { id: 'perf-doc-root' as never }),
  };
}

/**
 * Mulberry32 — small, fast, good-enough-quality 32-bit PRNG. We need
 * reproducibility (same seed → same sequence) more than crypto strength.
 *
 * Source: public-domain implementation by Tommy Ettinger; standard
 * choice for game-dev / synthetic-data scenarios.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
