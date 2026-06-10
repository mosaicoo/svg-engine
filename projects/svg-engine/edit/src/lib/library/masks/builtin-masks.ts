import type { MaskLibraryItem } from './mask-library.service';

/**
 * 4 built-in `<mask>` presets (D-049 Item 4). Designed to showcase
 * the kinds of compositions a mask can produce that a clipPath can't:
 * gradient fades, radial spotlights, soft circular edges.
 *
 * **Default size**: each mask is built around a 400×300 region.
 * The mask uses `maskContentUnits="userSpaceOnUse"` so the gradient
 * geometry inside the mask is in absolute document coordinates,
 * matching the typical builtin-clip-paths convention.
 *
 * **Gradient IDs**: each mask defines its own internal gradient
 * (prefixed `svge-mask-grad-`) inside the mask element so the mask
 * is self-contained and doesn't depend on the gradient registry.
 */

/** @internal Left-to-right horizontal fade: opaque on the right, transparent on the left. */
export const fadeLeftMask: MaskLibraryItem = {
  id: 'svge.builtin.mask.fade-left',
  name: 'Fade from left',
  category: 'gradient',
  buildMarkup(): string {
    return `<mask id="${this.id}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
      <linearGradient id="svge-mask-grad-fade-left" x1="0" y1="0" x2="400" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#000" />
        <stop offset="1" stop-color="#fff" />
      </linearGradient>
      <rect x="0" y="0" width="400" height="300" fill="url(#svge-mask-grad-fade-left)" />
    </mask>`;
  },
};

/** @internal Top-to-bottom fade: useful for "sinking into background" effects. */
export const fadeBottomMask: MaskLibraryItem = {
  id: 'svge.builtin.mask.fade-bottom',
  name: 'Fade to bottom',
  category: 'gradient',
  buildMarkup(): string {
    return `<mask id="${this.id}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
      <linearGradient id="svge-mask-grad-fade-bottom" x1="0" y1="0" x2="0" y2="300" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fff" />
        <stop offset="1" stop-color="#000" />
      </linearGradient>
      <rect x="0" y="0" width="400" height="300" fill="url(#svge-mask-grad-fade-bottom)" />
    </mask>`;
  },
};

/** @internal Radial spotlight: bright center, dark edges. Vignette-like. */
export const spotlightMask: MaskLibraryItem = {
  id: 'svge.builtin.mask.spotlight',
  name: 'Spotlight (vignette)',
  category: 'radial',
  buildMarkup(): string {
    return `<mask id="${this.id}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
      <radialGradient id="svge-mask-grad-spotlight" cx="200" cy="150" r="180" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fff" />
        <stop offset="0.7" stop-color="#aaa" />
        <stop offset="1" stop-color="#000" />
      </radialGradient>
      <rect x="0" y="0" width="400" height="300" fill="url(#svge-mask-grad-spotlight)" />
    </mask>`;
  },
};

/** @internal Soft circle: hard center, gentle fade to fully transparent. */
export const softCircleMask: MaskLibraryItem = {
  id: 'svge.builtin.mask.soft-circle',
  name: 'Soft circle',
  category: 'radial',
  buildMarkup(): string {
    return `<mask id="${this.id}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
      <radialGradient id="svge-mask-grad-soft-circle" cx="200" cy="150" r="120" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fff" />
        <stop offset="0.9" stop-color="#fff" />
        <stop offset="1" stop-color="#000" />
      </radialGradient>
      <rect x="0" y="0" width="400" height="300" fill="url(#svge-mask-grad-soft-circle)" />
    </mask>`;
  },
};

export const BUILTIN_MASKS: readonly MaskLibraryItem[] = [
  fadeLeftMask,
  fadeBottomMask,
  spotlightMask,
  softCircleMask,
];
