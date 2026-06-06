import type { PatternLibraryItem } from './pattern-library.service';

/**
 * 30 built-in patterns (D-048 Item 2). All use `userSpaceOnUse` so the
 * tile repeats at a fixed SVG-unit size regardless of the target node
 * size; tile dimensions vary per motif (the original 5 use a 10×10
 * tile, the round-2 batch uses sizes that best fit each design).
 * Plugins can register further custom patterns.
 *
 * **Conventions** (so previews + exports stay consistent):
 * - `id="${this.id}"` is mandatory (referenced as `url(#id)`).
 * - Mono palette: `#212121` (dark) / `#9e9e9e` (grey) on a transparent
 *   tile — consumers recolor by editing the inserted node's fill or by
 *   registering a tinted variant.
 * - Motifs tile seamlessly (corner-to-corner diagonals, edge-aligned
 *   polygons) so there are no visible seams when repeated.
 */

const TILE = 10;

/** Polka dots — 5 evenly spaced dark dots on a transparent tile. */
export const dotsPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.dots',
  name: 'Dots',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="${TILE}" height="${TILE}">
      <circle cx="5" cy="5" r="1.5" fill="#212121" />
    </pattern>`;
  },
};

/** Horizontal lines — thin black stripes every 4 units. */
export const linesHorizontalPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.lines-horizontal',
  name: 'Lines (horizontal)',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="${TILE}" height="4">
      <line x1="0" y1="2" x2="${TILE}" y2="2" stroke="#212121" stroke-width="1" />
    </pattern>`;
  },
};

/** Diagonal hatching — 45° black lines. */
export const linesDiagonalPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.lines-diagonal',
  name: 'Lines (diagonal)',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="6" height="6"
                     patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="#212121" stroke-width="1" />
    </pattern>`;
  },
};

/** Grid — black lines forming a 10x10 square grid. */
export const gridPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.grid',
  name: 'Grid',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="${TILE}" height="${TILE}">
      <path d="M${TILE} 0 L0 0 0 ${TILE}" fill="none" stroke="#9e9e9e" stroke-width="0.5" />
    </pattern>`;
  },
};

/** Checkerboard — alternating black/white 5×5 squares. */
export const checkerboardPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.checkerboard',
  name: 'Checkerboard',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="${TILE}" height="${TILE}">
      <rect x="0" y="0" width="5" height="5" fill="#212121" />
      <rect x="5" y="5" width="5" height="5" fill="#212121" />
    </pattern>`;
  },
};

// ── 25 additional patterns (round 2) ───────────────────────────────
// Same conventions: userSpaceOnUse tiles, mono #212121/#9e9e9e on a
// transparent ground, every motif tiles seamlessly. Tile sizes vary
// per design (noted per entry).

/** Vertical lines — thin stripes every 4 units (mirror of horizontal). */
export const linesVerticalPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.lines-vertical',
  name: 'Lines (vertical)',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="4" height="${TILE}">
      <line x1="2" y1="0" x2="2" y2="${TILE}" stroke="#212121" stroke-width="1" />
    </pattern>`;
  },
};

/** Cross-hatch — both 45° diagonals (corner-to-corner so they tile). */
export const crossHatchPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.cross-hatch',
  name: 'Cross-hatch',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="8" height="8">
      <path d="M0 8 L8 0 M0 0 L8 8" fill="none" stroke="#212121" stroke-width="0.8" />
    </pattern>`;
  },
};

/** Grid (fine) — light 5×5 square grid. */
export const gridFinePattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.grid-fine',
  name: 'Grid (fine)',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="5" height="5">
      <path d="M5 0 L0 0 0 5" fill="none" stroke="#9e9e9e" stroke-width="0.4" />
    </pattern>`;
  },
};

/** Graph paper — light minor grid (every 5) + stronger major (every 25). */
export const graphPaperPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.graph-paper',
  name: 'Graph paper',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="25" height="25">
      <path d="M5 0 V25 M10 0 V25 M15 0 V25 M20 0 V25 M0 5 H25 M0 10 H25 M0 15 H25 M0 20 H25"
            fill="none" stroke="#e0e0e0" stroke-width="0.5" />
      <path d="M25 0 L0 0 0 25" fill="none" stroke="#9e9e9e" stroke-width="1" />
    </pattern>`;
  },
};

/** Dots (large) — bigger, sparser polka dots. */
export const dotsLargePattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.dots-large',
  name: 'Dots (large)',
  category: 'dots',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="16" height="16">
      <circle cx="8" cy="8" r="3" fill="#212121" />
    </pattern>`;
  },
};

/** Dots (dense) — small, tightly packed dots. */
export const dotsDensePattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.dots-dense',
  name: 'Dots (dense)',
  category: 'dots',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="6" height="6">
      <circle cx="3" cy="3" r="1" fill="#212121" />
    </pattern>`;
  },
};

/** Dots (offset) — half-drop polka (two diagonal dots per tile). */
export const dotsOffsetPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.dots-offset',
  name: 'Dots (offset)',
  category: 'dots',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="20" height="20">
      <circle cx="5" cy="5" r="2" fill="#212121" />
      <circle cx="15" cy="15" r="2" fill="#212121" />
    </pattern>`;
  },
};

/** Circles — ring (outline) grid. */
export const circlesPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.circles',
  name: 'Circles',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="16" height="16">
      <circle cx="8" cy="8" r="6" fill="none" stroke="#212121" stroke-width="1" />
    </pattern>`;
  },
};

/** Zigzag — thin zigzag rows. */
export const zigzagPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.zigzag',
  name: 'Zigzag',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="16" height="8">
      <path d="M0 8 L4 0 L8 8 L12 0 L16 8" fill="none" stroke="#212121" stroke-width="1" />
    </pattern>`;
  },
};

/** Chevron — thick chevron rows. */
export const chevronPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.chevron',
  name: 'Chevron',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="20" height="10">
      <path d="M0 8 L10 0 L20 8" fill="none" stroke="#212121" stroke-width="3" />
    </pattern>`;
  },
};

/** Waves — sinusoidal horizontal wave rows. */
export const wavesPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.waves',
  name: 'Waves',
  category: 'organic',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="20" height="10">
      <path d="M0 5 C5 0 5 0 10 5 C15 10 15 10 20 5" fill="none" stroke="#212121" stroke-width="1" />
    </pattern>`;
  },
};

/** Fish scales — overlapping scalloped arcs in offset rows. */
export const scalesPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.scales',
  name: 'Fish scales',
  category: 'organic',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="20" height="20">
      <path d="M0 0 A10 10 0 0 0 20 0" fill="none" stroke="#212121" stroke-width="1" />
      <path d="M-10 10 A10 10 0 0 0 10 10" fill="none" stroke="#212121" stroke-width="1" />
      <path d="M10 10 A10 10 0 0 0 30 10" fill="none" stroke="#212121" stroke-width="1" />
    </pattern>`;
  },
};

/** Bricks — running-bond brick wall (offset rows). */
export const bricksPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.bricks',
  name: 'Bricks',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="20" height="16">
      <path d="M0 0 H20 M0 8 H20 M0 16 H20" fill="none" stroke="#9e9e9e" stroke-width="1" />
      <path d="M0 0 V8 M10 8 V16" fill="none" stroke="#9e9e9e" stroke-width="1" />
    </pattern>`;
  },
};

/** Triangles — up-pointing filled triangle tessellation. */
export const trianglesPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.triangles',
  name: 'Triangles',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="20" height="20">
      <path d="M0 20 L10 0 L20 20 Z" fill="#212121" />
    </pattern>`;
  },
};

/** Diamonds — diamond-grid (rotated-square) outline. */
export const diamondsPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.diamonds',
  name: 'Diamonds',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="20" height="20">
      <path d="M10 0 L20 10 L10 20 L0 10 Z" fill="none" stroke="#212121" stroke-width="1" />
    </pattern>`;
  },
};

/** Octagons — octagon-and-square semiregular tiling (outline). */
export const octagonsPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.octagons',
  name: 'Octagons',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="20" height="20">
      <polygon points="6,0 14,0 20,6 20,14 14,20 6,20 0,14 0,6"
               fill="none" stroke="#212121" stroke-width="1" />
    </pattern>`;
  },
};

/** Crosses — small plus signs. */
export const crossesPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.crosses',
  name: 'Crosses',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="12" height="12">
      <path d="M5 2 H7 V5 H10 V7 H7 V10 H5 V7 H2 V5 H5 Z" fill="#212121" />
    </pattern>`;
  },
};

/** Stars — small 5-pointed stars. */
export const starsPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.stars',
  name: 'Stars',
  category: 'decorative',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="20" height="20">
      <path d="M10 2 L11.9 7.4 L17.6 7.5 L13 11 L14.7 16.5 L10 13.2 L5.3 16.5 L7 11 L2.4 7.5 L8.1 7.4 Z"
            fill="#212121" />
    </pattern>`;
  },
};

/** Hearts — small hearts. */
export const heartsPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.hearts',
  name: 'Hearts',
  category: 'decorative',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="20" height="20">
      <path d="M10 17 C4 12 1 9 1 6 C1 3 3 1 5.5 1 C7.5 1 9 2.5 10 4.5 C11 2.5 12.5 1 14.5 1 C17 1 19 3 19 6 C19 9 16 12 10 17 Z"
            fill="#212121" />
    </pattern>`;
  },
};

/** Stripes (vertical) — thick alternating vertical bands. */
export const stripesVerticalPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.stripes-vertical',
  name: 'Stripes (vertical)',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="20" height="10">
      <rect x="0" y="0" width="10" height="10" fill="#212121" />
    </pattern>`;
  },
};

/** Stripes (diagonal) — thick 45° bands. */
export const stripesDiagonalPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.stripes-diagonal',
  name: 'Stripes (diagonal)',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="14" height="14"
                     patternTransform="rotate(45)">
      <rect x="0" y="0" width="7" height="14" fill="#212121" />
    </pattern>`;
  },
};

/** Checkerboard (small) — finer 3×3 checker. */
export const checkerboardSmallPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.checkerboard-small',
  name: 'Checkerboard (small)',
  category: 'geometric',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="6" height="6">
      <rect x="0" y="0" width="3" height="3" fill="#212121" />
      <rect x="3" y="3" width="3" height="3" fill="#212121" />
    </pattern>`;
  },
};

/** Confetti — scattered, rotated little dashes (two greys). */
export const confettiPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.confetti',
  name: 'Confetti',
  category: 'decorative',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="30" height="30">
      <rect x="4" y="6" width="5" height="2" rx="1" fill="#212121" transform="rotate(30 6.5 7)" />
      <rect x="20" y="4" width="5" height="2" rx="1" fill="#9e9e9e" transform="rotate(-20 22.5 5)" />
      <rect x="10" y="18" width="5" height="2" rx="1" fill="#212121" transform="rotate(60 12.5 19)" />
      <rect x="22" y="22" width="5" height="2" rx="1" fill="#9e9e9e" transform="rotate(-45 24.5 23)" />
      <rect x="2" y="24" width="5" height="2" rx="1" fill="#212121" transform="rotate(10 4.5 25)" />
    </pattern>`;
  },
};

/** Basket weave — interlocking horizontal/vertical bundles. */
export const basketweavePattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.basketweave',
  name: 'Basket weave',
  category: 'decorative',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="16" height="16">
      <g fill="#212121">
        <rect x="0" y="1" width="7" height="1.5" /><rect x="0" y="4" width="7" height="1.5" /><rect x="0" y="6.5" width="7" height="1.5" />
        <rect x="9" y="9" width="7" height="1.5" /><rect x="9" y="12" width="7" height="1.5" /><rect x="9" y="14.5" width="7" height="1.5" />
        <rect x="9" y="1" width="1.5" height="7" /><rect x="12" y="1" width="1.5" height="7" /><rect x="14.5" y="1" width="1.5" height="7" />
        <rect x="1" y="9" width="1.5" height="7" /><rect x="4" y="9" width="1.5" height="7" /><rect x="6.5" y="9" width="1.5" height="7" />
      </g>
    </pattern>`;
  },
};

/** Plaid — overlapping translucent bands (tartan look). */
export const plaidPattern: PatternLibraryItem = {
  id: 'svge.builtin.pattern.plaid',
  name: 'Plaid',
  category: 'decorative',
  buildMarkup() {
    return `<pattern id="${this.id}" patternUnits="userSpaceOnUse" width="20" height="20">
      <rect x="0" y="0" width="20" height="6" fill="#212121" opacity="0.25" />
      <rect x="0" y="0" width="6" height="20" fill="#212121" opacity="0.25" />
      <rect x="12" y="0" width="2" height="20" fill="#212121" opacity="0.4" />
      <rect x="0" y="12" width="20" height="2" fill="#212121" opacity="0.4" />
    </pattern>`;
  },
};

/** Ordered list of all 30 builtins. */
export const BUILTIN_PATTERNS: readonly PatternLibraryItem[] = [
  dotsPattern,
  linesHorizontalPattern,
  linesDiagonalPattern,
  gridPattern,
  checkerboardPattern,
  // round 2
  linesVerticalPattern,
  crossHatchPattern,
  gridFinePattern,
  graphPaperPattern,
  dotsLargePattern,
  dotsDensePattern,
  dotsOffsetPattern,
  circlesPattern,
  zigzagPattern,
  chevronPattern,
  wavesPattern,
  scalesPattern,
  bricksPattern,
  trianglesPattern,
  diamondsPattern,
  octagonsPattern,
  crossesPattern,
  starsPattern,
  heartsPattern,
  stripesVerticalPattern,
  stripesDiagonalPattern,
  checkerboardSmallPattern,
  confettiPattern,
  basketweavePattern,
  plaidPattern,
];
