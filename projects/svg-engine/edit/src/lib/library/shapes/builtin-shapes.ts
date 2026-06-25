import { createPath, type PathNode } from '@mosaicoo/svg-engine/core';
import type { ShapeLibraryItem } from './shape-library.service';

/**
 * 24 built-in shapes for the Shape Library (D-048). Each is a
 * `createPath` factory that returns a fresh `PathNode` with a
 * neutral default style (gray fill, no stroke) — consumers customize
 * after insertion via the Inspector / Color Picker.
 *
 * **Geometry conventions**:
 * - All shapes fit within a 100×100 bounding box centered at (50, 50).
 * - Coordinates are absolute (no `M` then `m`) for predictable
 *   serialization and pathfinder compatibility.
 * - Closed shapes end with `Z` so fill renders correctly.
 *
 * **Style default** (`#90caf9` light blue / no stroke): matches the
 * playground's default rect/ellipse seed colors so a freshly inserted
 * shape looks "at home" before the user picks a real color.
 *
 * **Future**: parameter dialogs (star points slider, arrow head size,
 * etc.) would let a single registry entry generate variants — out of
 * scope for D-048 v1 which prioritizes breadth of catalog.
 */

const DEFAULT_STYLE = { fill: '#90caf9', stroke: '#1565c0', strokeWidth: 1 } as const;

/** @internal 5-pointed star centered at (50,50), outer radius 48. */
export const starShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.star',
  name: 'Star',
  category: 'symbols',
  build(): PathNode {
    // Pre-computed 5-point star (outer r=48, inner r=20)
    return createPath('M50 2 L60 38 L98 38 L67 60 L78 96 L50 74 L22 96 L33 60 L2 38 L40 38 Z', {
      style: { ...DEFAULT_STYLE },
    });
  },
};

/** @internal Right-pointing arrow with rectangular shaft + triangular head. */
export const arrowShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.arrow',
  name: 'Arrow',
  category: 'arrows',
  build(): PathNode {
    return createPath('M10 35 L60 35 L60 15 L95 50 L60 85 L60 65 L10 65 Z', {
      style: { ...DEFAULT_STYLE },
    });
  },
};

/** @internal Symmetric heart. Two arcs on top, V-shaped point at bottom. */
export const heartShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.heart',
  name: 'Heart',
  category: 'symbols',
  build(): PathNode {
    return createPath(
      'M50 88 C20 70 8 50 8 32 C8 18 18 8 30 8 C40 8 47 14 50 22 C53 14 60 8 70 8 C82 8 92 18 92 32 C92 50 80 70 50 88 Z',
      { style: { ...DEFAULT_STYLE } },
    );
  },
};

/** @internal Speech balloon — rounded rectangle with tail at bottom-left. */
export const balloonShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.balloon',
  name: 'Speech balloon',
  category: 'callouts',
  build(): PathNode {
    return createPath(
      'M15 8 L85 8 C90 8 92 10 92 15 L92 60 C92 65 90 67 85 67 L40 67 L25 92 L28 67 L15 67 C10 67 8 65 8 60 L8 15 C8 10 10 8 15 8 Z',
      { style: { ...DEFAULT_STYLE } },
    );
  },
};

/** @internal Lightning bolt. Stylized zigzag. */
export const lightningShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.lightning',
  name: 'Lightning',
  category: 'symbols',
  build(): PathNode {
    return createPath('M55 2 L20 52 L42 52 L30 98 L78 40 L52 40 L70 2 Z', {
      style: { ...DEFAULT_STYLE },
    });
  },
};

/** @internal Cloud — three round bumps on top, flat bottom. */
export const cloudShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.cloud',
  name: 'Cloud',
  category: 'symbols',
  build(): PathNode {
    return createPath(
      'M22 70 C8 70 2 62 2 52 C2 42 10 35 22 35 C22 22 32 12 46 12 C58 12 68 20 70 32 C82 32 92 42 92 54 C92 66 80 70 70 70 Z',
      { style: { ...DEFAULT_STYLE } },
    );
  },
};

/**
 * @internal
 * Gear / cog with 8 teeth. v1: no central hole (would need
 * `fill-rule: evenodd` which isn't on `SvgStyle` yet — adding that
 * to core is deferred since the gear is still recognizable without
 * the hole).
 */
export const gearShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.gear',
  name: 'Gear',
  category: 'symbols',
  build(): PathNode {
    // 8 teeth (every 45°) — outer r=48, base r=38.
    return createPath(
      'M45 2 L55 2 L57 14 L70 18 L80 10 L86 20 L78 30 L82 42 L94 45 L94 55 L82 58 L78 70 L86 80 L80 86 L70 78 L57 82 L55 94 L45 94 L43 82 L30 78 L20 86 L14 80 L22 70 L18 58 L6 55 L6 45 L18 42 L22 30 L14 20 L20 10 L30 18 L43 14 Z',
      { style: { ...DEFAULT_STYLE } },
    );
  },
};

/** @internal Diamond — 90° rotated square. */
export const diamondShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.diamond',
  name: 'Diamond',
  category: 'geometric',
  build(): PathNode {
    return createPath('M50 5 L95 50 L50 95 L5 50 Z', { style: { ...DEFAULT_STYLE } });
  },
};

/** @internal Regular hexagon (flat-top orientation), inscribed in 100x100. */
export const hexagonShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.hexagon',
  name: 'Hexagon',
  category: 'geometric',
  build(): PathNode {
    return createPath('M25 8 L75 8 L97 50 L75 92 L25 92 L3 50 Z', { style: { ...DEFAULT_STYLE } });
  },
};

/** @internal Plus / cross (Greek cross — equal arms). */
export const crossShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.cross',
  name: 'Plus',
  category: 'geometric',
  build(): PathNode {
    return createPath(
      'M35 5 L65 5 L65 35 L95 35 L95 65 L65 65 L65 95 L35 95 L35 65 L5 65 L5 35 L35 35 Z',
      { style: { ...DEFAULT_STYLE } },
    );
  },
};

/** @internal Checkmark — confirmation glyph. */
export const checkmarkShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.checkmark',
  name: 'Checkmark',
  category: 'symbols',
  build(): PathNode {
    return createPath('M10 50 L20 40 L40 60 L80 20 L90 30 L40 80 Z', {
      style: { ...DEFAULT_STYLE, fill: '#4caf50', stroke: '#2e7d32' },
    });
  },
};

/** @internal Right triangle (filled), useful for play buttons / pointers. */
export const triangleShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.triangle',
  name: 'Triangle',
  category: 'geometric',
  build(): PathNode {
    return createPath('M50 5 L95 90 L5 90 Z', { style: { ...DEFAULT_STYLE } });
  },
};

// ── 12 additional shapes (round 2) ─────────────────────────────────
// Same conventions: 100×100 box, absolute coords, closed with `Z`,
// neutral DEFAULT_STYLE. Broadens each existing category (more
// regular polygons, directional arrows, symbol glyphs).

/** @internal Regular pentagon, point-up. Inscribed radius ≈46 around (50,50). */
export const pentagonShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.pentagon',
  name: 'Pentagon',
  category: 'geometric',
  build(): PathNode {
    return createPath('M50 4 L94 36 L77 87 L23 87 L6 36 Z', { style: { ...DEFAULT_STYLE } });
  },
};

/** @internal Regular octagon (flat-top), corners cut at 30% of the box. */
export const octagonShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.octagon',
  name: 'Octagon',
  category: 'geometric',
  build(): PathNode {
    return createPath('M30 4 L70 4 L96 30 L96 70 L70 96 L30 96 L4 70 L4 30 Z', {
      style: { ...DEFAULT_STYLE },
    });
  },
};

/** @internal Parallelogram — top edge shifted right, equal slanted sides. */
export const parallelogramShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.parallelogram',
  name: 'Parallelogram',
  category: 'geometric',
  build(): PathNode {
    return createPath('M25 20 L95 20 L75 80 L5 80 Z', { style: { ...DEFAULT_STYLE } });
  },
};

/** @internal Isosceles trapezoid — narrow top, wide base. */
export const trapezoidShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.trapezoid',
  name: 'Trapezoid',
  category: 'geometric',
  build(): PathNode {
    return createPath('M25 20 L75 20 L95 80 L5 80 Z', { style: { ...DEFAULT_STYLE } });
  },
};

/** @internal Right triangle with the right-angle at the bottom-left corner. */
export const rightTriangleShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.right-triangle',
  name: 'Right triangle',
  category: 'geometric',
  build(): PathNode {
    return createPath('M10 10 L10 90 L90 90 Z', { style: { ...DEFAULT_STYLE } });
  },
};

/** @internal Rounded rectangle (corner radius ≈12) built from quadratic corners. */
export const roundedRectShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.rounded-rect',
  name: 'Rounded rectangle',
  category: 'geometric',
  build(): PathNode {
    return createPath(
      'M22 20 L78 20 Q90 20 90 32 L90 68 Q90 80 78 80 L22 80 Q10 80 10 68 L10 32 Q10 20 22 20 Z',
      { style: { ...DEFAULT_STYLE } },
    );
  },
};

/** @internal Double-headed (bidirectional) horizontal arrow. */
export const doubleArrowShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.double-arrow',
  name: 'Double arrow',
  category: 'arrows',
  build(): PathNode {
    return createPath('M5 50 L25 30 L25 42 L75 42 L75 30 L95 50 L75 70 L75 58 L25 58 L25 70 Z', {
      style: { ...DEFAULT_STYLE },
    });
  },
};

/** @internal Up-pointing arrow (rectangular shaft + triangular head). */
export const upArrowShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.up-arrow',
  name: 'Up arrow',
  category: 'arrows',
  build(): PathNode {
    return createPath('M50 5 L85 40 L65 40 L65 95 L35 95 L35 40 L15 40 Z', {
      style: { ...DEFAULT_STYLE },
    });
  },
};

/** @internal Chevron — thick right-pointing "›" with a notched back. */
export const chevronShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.chevron',
  name: 'Chevron',
  category: 'arrows',
  build(): PathNode {
    return createPath('M20 15 L50 15 L80 50 L50 85 L20 85 L50 50 Z', {
      style: { ...DEFAULT_STYLE },
    });
  },
};

/**
 * @internal
 * Crescent moon — canonical two-arc construction (outer r=45, inner
 * rx=35/ry=45 carving the right side). Opens to the right.
 */
export const crescentMoonShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.crescent-moon',
  name: 'Crescent moon',
  category: 'symbols',
  build(): PathNode {
    return createPath('M50 5 A45 45 0 1 0 50 95 A35 45 0 1 1 50 5 Z', {
      style: { ...DEFAULT_STYLE },
    });
  },
};

/** @internal Sparkle — slim 4-pointed star (top/right/bottom/left). */
export const sparkleShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.sparkle',
  name: 'Sparkle',
  category: 'symbols',
  build(): PathNode {
    return createPath('M50 5 L58 42 L95 50 L58 58 L50 95 L42 58 L5 50 L42 42 Z', {
      style: { ...DEFAULT_STYLE },
    });
  },
};

/** @internal Hexagram — 6-pointed star (outer r=46, inner r=23). */
export const hexagramShape: ShapeLibraryItem = {
  id: 'svge.builtin.shape.hexagram',
  name: 'Hexagram',
  category: 'symbols',
  build(): PathNode {
    return createPath(
      'M50 4 L62 30 L90 27 L73 50 L90 73 L62 70 L50 96 L38 70 L10 73 L27 50 L10 27 L38 30 Z',
      { style: { ...DEFAULT_STYLE } },
    );
  },
};

/** Ordered list of all 24 builtins, in the order they appear in pickers. */
export const BUILTIN_SHAPES: readonly ShapeLibraryItem[] = [
  // geometric primitives
  triangleShape,
  diamondShape,
  hexagonShape,
  crossShape,
  pentagonShape,
  octagonShape,
  parallelogramShape,
  trapezoidShape,
  rightTriangleShape,
  roundedRectShape,
  // arrows
  arrowShape,
  doubleArrowShape,
  upArrowShape,
  chevronShape,
  // callouts
  balloonShape,
  // symbols
  starShape,
  heartShape,
  lightningShape,
  cloudShape,
  gearShape,
  checkmarkShape,
  crescentMoonShape,
  sparkleShape,
  hexagramShape,
];
