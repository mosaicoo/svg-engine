import type { PatternLibraryItem } from './pattern-library.service';

/**
 * 5 built-in patterns (D-048 Item 2). All use a 10×10 tile in
 * `userSpaceOnUse` — meaning the pattern repeats every 10 SVG units
 * regardless of the target node size. Plugins can register custom
 * patterns with different tile sizes or relative units.
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

/** Ordered list of all 5 builtins. */
export const BUILTIN_PATTERNS: readonly PatternLibraryItem[] = [
  dotsPattern,
  linesHorizontalPattern,
  linesDiagonalPattern,
  gridPattern,
  checkerboardPattern,
];
