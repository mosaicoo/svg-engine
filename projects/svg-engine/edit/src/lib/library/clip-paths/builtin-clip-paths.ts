import type { ClipPathLibraryItem } from './clip-path-library.service';

/**
 * 5 built-in `<clipPath>` shapes (D-049 Item 4). Each clip-path is
 * defined in document coordinates with `clipPathUnits="userSpaceOnUse"`
 * so the user can pre-position it anywhere on the canvas via the
 * picker, and it clips whatever node it's applied to in that absolute
 * region. (Future iterations can add an in-canvas editor that
 * relocates / resizes the clip-path geometry interactively.)
 *
 * **Naming convention**: `svge.builtin.clip-path.{shape}`.
 *
 * **Default size**: each builtin is sized for a 400×300 viewBox
 * region. Users with a different document size will see the clip
 * applied in absolute coords — they can move/resize the underlying
 * clip-path shape via the (future) clip-path editor tool.
 */

/** @internal Big circle in the upper-left quadrant — generic "round it off". */
export const circleClipPath: ClipPathLibraryItem = {
  id: 'svge.builtin.clip-path.circle-200',
  name: 'Circle (200px)',
  category: 'shapes',
  buildMarkup(): string {
    return `<clipPath id="${this.id}" clipPathUnits="userSpaceOnUse">
      <circle cx="200" cy="150" r="100" />
    </clipPath>`;
  },
};

/** @internal Big ellipse — wider than tall, "letterbox" effect when applied to a square. */
export const ellipseClipPath: ClipPathLibraryItem = {
  id: 'svge.builtin.clip-path.ellipse-wide',
  name: 'Ellipse (wide)',
  category: 'shapes',
  buildMarkup(): string {
    return `<clipPath id="${this.id}" clipPathUnits="userSpaceOnUse">
      <ellipse cx="200" cy="150" rx="180" ry="100" />
    </clipPath>`;
  },
};

/** @internal Rounded rectangle — softens a sharp-cornered photo into a card shape. */
export const roundedRectClipPath: ClipPathLibraryItem = {
  id: 'svge.builtin.clip-path.rounded-rect',
  name: 'Rounded rectangle',
  category: 'shapes',
  buildMarkup(): string {
    return `<clipPath id="${this.id}" clipPathUnits="userSpaceOnUse">
      <rect x="20" y="20" width="360" height="260" rx="24" ry="24" />
    </clipPath>`;
  },
};

/** @internal Five-pointed star — playful crop, useful for badges / stickers. */
export const starClipPath: ClipPathLibraryItem = {
  id: 'svge.builtin.clip-path.star',
  name: 'Star',
  category: 'shapes',
  buildMarkup(): string {
    return `<clipPath id="${this.id}" clipPathUnits="userSpaceOnUse">
      <polygon points="200,30 240,120 340,130 265,200 285,295 200,250 115,295 135,200 60,130 160,120" />
    </clipPath>`;
  },
};

/** @internal Heart shape — single bezier path. Useful for emotive design. */
export const heartClipPath: ClipPathLibraryItem = {
  id: 'svge.builtin.clip-path.heart',
  name: 'Heart',
  category: 'shapes',
  buildMarkup(): string {
    return `<clipPath id="${this.id}" clipPathUnits="userSpaceOnUse">
      <path d="M200,250 C90,180 90,80 160,80 C185,80 200,100 200,120 C200,100 215,80 240,80 C310,80 310,180 200,250 Z" />
    </clipPath>`;
  },
};

/** Ordered list — feeds the picker UI in registration order. */
export const BUILTIN_CLIP_PATHS: readonly ClipPathLibraryItem[] = [
  circleClipPath,
  ellipseClipPath,
  roundedRectClipPath,
  starClipPath,
  heartClipPath,
];
