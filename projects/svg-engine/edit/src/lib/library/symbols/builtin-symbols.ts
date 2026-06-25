import { createGroup, createPath, type SvgNode } from '@mosaicoo/svg-engine/core';

import { type EditorPlugin, PLUGIN_API_VERSION } from '../../plugin/plugin';
import {
  buildSymbolMarkup,
  type SymbolLibraryItem,
  SymbolLibraryService,
} from './symbol-library.service';

/**
 * **D-059** — 4 built-in symbols showcasing the master/instance
 * propagation. Each builtin has:
 *
 * - A `master` tree (the actual SVG shapes that `<symbol>` will contain)
 * - An explicit `viewBox` matching the master's natural footprint
 * - The standard `buildMarkup()` delegation to `buildSymbolMarkup`
 *
 * **Default insertion size**: when an instance is created without
 * explicit `width`/`height`, the browser renders the symbol at the
 * `viewBox` size in document units. The 64×64 viewBox here gives a
 * good "medium icon" default that's visible at typical zooms.
 *
 * **Why these specific symbols**: chose simple, semantically clear
 * shapes (star, arrow, heart, gear) that demonstrate the editing
 * propagation visibly — change the star's fill in the catalog and
 * every instance updates at once.
 *
 * **Visual hint**: every builtin uses `fill="currentColor"` so the
 * instance's `style.fill` (or the parent group's CSS color) drives
 * the appearance. Users can recolor per-instance without editing the
 * master — matches Figma's "color override on component instance".
 */

const VIEWBOX = { x: 0, y: 0, width: 64, height: 64 };

/** Star: 5-pointed, 32 center, outer radius 28, inner 12. */
const starMaster: SvgNode = createPath(buildStarD(32, 32, 28, 12, 5), {
  style: { fill: 'currentColor' },
});

/** Arrow: rightward chevron. Tip at (60, 32), spans 56×32. */
const arrowMaster: SvgNode = createPath('M4 24 L40 24 L40 12 L60 32 L40 52 L40 40 L4 40 Z', {
  style: { fill: 'currentColor' },
});

/** Heart: classic two-lobe shape. */
const heartMaster: SvgNode = createPath(
  'M32 56 C12 40 4 28 4 20 C4 12 10 8 16 8 C22 8 28 12 32 18 C36 12 42 8 48 8 C54 8 60 12 60 20 C60 28 52 40 32 56 Z',
  { style: { fill: 'currentColor' } },
);

/** Gear: 8 outer teeth + center hole. Constructed as a single path. */
const gearMaster: SvgNode = createGroup(
  [
    createPath(buildGearD(32, 32, 24, 18, 8, 4), { style: { fill: 'currentColor' } }),
    createPath('M32 22 A10 10 0 1 0 32 42 A10 10 0 1 0 32 22 Z', {
      style: { fill: '#ffffff' },
    }),
  ],
  { style: { fill: 'currentColor' } },
);

export const starSymbol: SymbolLibraryItem = {
  id: 'svge.builtin.symbol.star',
  name: 'Star',
  category: 'basic',
  master: starMaster,
  viewBox: VIEWBOX,
  buildMarkup() {
    return buildSymbolMarkup(this);
  },
};

export const arrowSymbol: SymbolLibraryItem = {
  id: 'svge.builtin.symbol.arrow',
  name: 'Arrow',
  category: 'basic',
  master: arrowMaster,
  viewBox: VIEWBOX,
  buildMarkup() {
    return buildSymbolMarkup(this);
  },
};

export const heartSymbol: SymbolLibraryItem = {
  id: 'svge.builtin.symbol.heart',
  name: 'Heart',
  category: 'basic',
  master: heartMaster,
  viewBox: VIEWBOX,
  buildMarkup() {
    return buildSymbolMarkup(this);
  },
};

export const gearSymbol: SymbolLibraryItem = {
  id: 'svge.builtin.symbol.gear',
  name: 'Gear',
  category: 'basic',
  master: gearMaster,
  viewBox: VIEWBOX,
  buildMarkup() {
    return buildSymbolMarkup(this);
  },
};

export const BUILTIN_SYMBOLS: readonly SymbolLibraryItem[] = [
  starSymbol,
  arrowSymbol,
  heartSymbol,
  gearSymbol,
];

/**
 * **`builtinSymbolsPlugin`** — D-059. Registers the 4 builtin
 * symbols so consumers see them in `<svge-libraries-panel>` (Symbols
 * section) and can drop instances on the canvas via click.
 *
 * **Opt-in** like all D-048 library plugins. Apps that ship their
 * own symbol library can omit this without losing functionality.
 */
export const builtinSymbolsPlugin: EditorPlugin = {
  id: 'svge.builtin.symbols',
  name: 'Built-in symbols (4 items) — D-059',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,

  install(ctx) {
    const reg = ctx.injector.get(SymbolLibraryService);
    for (const item of BUILTIN_SYMBOLS) {
      ctx.track(reg.register(item));
    }
  },
};

// ── Path builders ────────────────────────────────────────────────────

function buildStarD(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points: number,
): string {
  const startAngle = -Math.PI / 2;
  const parts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = startAngle + (i * Math.PI) / points;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/**
 * 8-tooth gear. `outerR` = tooth tip radius, `bodyR` = body radius,
 * `teeth` = count, `toothWidth` = half-angle of each tooth.
 */
function buildGearD(
  cx: number,
  cy: number,
  outerR: number,
  bodyR: number,
  teeth: number,
  toothWidth: number,
): string {
  const parts: string[] = [];
  const step = (2 * Math.PI) / teeth;
  const halfStep = step / 2;
  const angleStep = (toothWidth / 360) * Math.PI;
  for (let i = 0; i < teeth; i++) {
    const center = i * step - Math.PI / 2;
    const aBodyStart = center - halfStep;
    const aBodyEnd = center + halfStep - angleStep;
    const aTipStart = center - angleStep / 2;
    const aTipEnd = center + angleStep / 2;
    const aBodyNext = center + halfStep;
    if (i === 0) {
      const x = cx + bodyR * Math.cos(aBodyStart);
      const y = cy + bodyR * Math.sin(aBodyStart);
      parts.push(`M${x.toFixed(2)} ${y.toFixed(2)}`);
    }
    const xBodyEnd = cx + bodyR * Math.cos(aBodyEnd);
    const yBodyEnd = cy + bodyR * Math.sin(aBodyEnd);
    parts.push(`A${bodyR} ${bodyR} 0 0 1 ${xBodyEnd.toFixed(2)} ${yBodyEnd.toFixed(2)}`);
    const xTipStart = cx + outerR * Math.cos(aTipStart);
    const yTipStart = cy + outerR * Math.sin(aTipStart);
    parts.push(`L${xTipStart.toFixed(2)} ${yTipStart.toFixed(2)}`);
    const xTipEnd = cx + outerR * Math.cos(aTipEnd);
    const yTipEnd = cy + outerR * Math.sin(aTipEnd);
    parts.push(`A${outerR} ${outerR} 0 0 1 ${xTipEnd.toFixed(2)} ${yTipEnd.toFixed(2)}`);
    const xBodyNext = cx + bodyR * Math.cos(aBodyNext);
    const yBodyNext = cy + bodyR * Math.sin(aBodyNext);
    parts.push(`L${xBodyNext.toFixed(2)} ${yBodyNext.toFixed(2)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}
