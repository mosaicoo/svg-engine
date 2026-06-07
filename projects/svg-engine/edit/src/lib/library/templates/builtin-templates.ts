import { bbox, createEmptyDocument } from 'svg-engine/core';
import type { TemplateLibraryItem } from './template-library.service';

/**
 * 12 built-in document templates (D-048) — the most-used formats across
 * editing apps + social networks. Each is a blank document pre-sized for
 * a common output format.
 *
 * **How they're applied**: the Libraries panel resizes the ACTIVE page to
 * the template's dimensions (non-destructive `ResizePageCommand`), keeping
 * the page origin fixed. The `build()` factory (a fresh `SvgDocument`) is
 * used only to read the target `viewBox` dimensions.
 *
 * **Units**: print formats use the point (72-DPI) convention — A4 = 595×842,
 * Letter = 612×792 — matching PDF/PostScript page sizes. Social / video
 * formats use each platform's documented pixel spec (e.g. Instagram story
 * 1080×1920, YouTube thumbnail 1280×720).
 */

/** A4 portrait — 595×842 (standard print). */
export const a4PortraitTemplate: TemplateLibraryItem = {
  id: 'svge.builtin.template.a4-portrait',
  name: 'A4 (portrait)',
  category: 'print',
  dimensions: '595×842',
  build() {
    return createEmptyDocument({
      viewBox: bbox(0, 0, 595, 842),
      width: 595,
      height: 842,
    });
  },
};

/** Instagram square — 1080×1080. */
export const instagramSquareTemplate: TemplateLibraryItem = {
  id: 'svge.builtin.template.instagram-square',
  name: 'Instagram square',
  category: 'social',
  dimensions: '1080×1080',
  build() {
    return createEmptyDocument({
      viewBox: bbox(0, 0, 1080, 1080),
      width: 1080,
      height: 1080,
    });
  },
};

/** Twitter / X card — 1200×675 (1.78:1 ratio). */
export const twitterCardTemplate: TemplateLibraryItem = {
  id: 'svge.builtin.template.twitter-card',
  name: 'Twitter / X card',
  category: 'social',
  dimensions: '1200×675',
  build() {
    return createEmptyDocument({
      viewBox: bbox(0, 0, 1200, 675),
      width: 1200,
      height: 675,
    });
  },
};

/** Business card — 350×200 (US standard 3.5"×2" at 100 DPI). */
export const businessCardTemplate: TemplateLibraryItem = {
  id: 'svge.builtin.template.business-card',
  name: 'Business card',
  category: 'print',
  dimensions: '350×200',
  build() {
    return createEmptyDocument({
      viewBox: bbox(0, 0, 350, 200),
      width: 350,
      height: 200,
    });
  },
};

// ── 8 additional templates (round 2) ───────────────────────────────
// Most-used formats across editing apps + social networks. Print sizes
// keep the same point (72-DPI) convention as A4 portrait above; social
// /video sizes use each platform's documented pixel spec.

/** A4 landscape — 842×595 (rotated A4; the landscape companion). */
export const a4LandscapeTemplate: TemplateLibraryItem = {
  id: 'svge.builtin.template.a4-landscape',
  name: 'A4 (landscape)',
  category: 'print',
  dimensions: '842×595',
  build() {
    return createEmptyDocument({ viewBox: bbox(0, 0, 842, 595), width: 842, height: 595 });
  },
};

/** US Letter portrait — 612×792 (8.5×11" in points, matches A4 convention). */
export const letterPortraitTemplate: TemplateLibraryItem = {
  id: 'svge.builtin.template.letter-portrait',
  name: 'Letter (portrait)',
  category: 'print',
  dimensions: '612×792',
  build() {
    return createEmptyDocument({ viewBox: bbox(0, 0, 612, 792), width: 612, height: 792 });
  },
};

/** Instagram story / Reel — 1080×1920 (9:16; also TikTok / YT Shorts). */
export const instagramStoryTemplate: TemplateLibraryItem = {
  id: 'svge.builtin.template.instagram-story',
  name: 'Instagram story',
  category: 'social',
  dimensions: '1080×1920',
  build() {
    return createEmptyDocument({ viewBox: bbox(0, 0, 1080, 1920), width: 1080, height: 1920 });
  },
};

/** Instagram portrait post — 1080×1350 (4:5, the tallest allowed feed post). */
export const instagramPortraitTemplate: TemplateLibraryItem = {
  id: 'svge.builtin.template.instagram-portrait',
  name: 'Instagram portrait',
  category: 'social',
  dimensions: '1080×1350',
  build() {
    return createEmptyDocument({ viewBox: bbox(0, 0, 1080, 1350), width: 1080, height: 1350 });
  },
};

/** YouTube thumbnail — 1280×720 (16:9). */
export const youtubeThumbnailTemplate: TemplateLibraryItem = {
  id: 'svge.builtin.template.youtube-thumbnail',
  name: 'YouTube thumbnail',
  category: 'video',
  dimensions: '1280×720',
  build() {
    return createEmptyDocument({ viewBox: bbox(0, 0, 1280, 720), width: 1280, height: 720 });
  },
};

/** Presentation 16:9 — 1920×1080 (Full HD slide / desktop wallpaper). */
export const presentation169Template: TemplateLibraryItem = {
  id: 'svge.builtin.template.presentation-16-9',
  name: 'Presentation 16:9',
  category: 'presentation',
  dimensions: '1920×1080',
  build() {
    return createEmptyDocument({ viewBox: bbox(0, 0, 1920, 1080), width: 1920, height: 1080 });
  },
};

/** Pinterest pin — 1000×1500 (2:3, the recommended pin ratio). */
export const pinterestPinTemplate: TemplateLibraryItem = {
  id: 'svge.builtin.template.pinterest-pin',
  name: 'Pinterest pin',
  category: 'social',
  dimensions: '1000×1500',
  build() {
    return createEmptyDocument({ viewBox: bbox(0, 0, 1000, 1500), width: 1000, height: 1500 });
  },
};

/** Facebook cover — 820×312 (page cover photo). */
export const facebookCoverTemplate: TemplateLibraryItem = {
  id: 'svge.builtin.template.facebook-cover',
  name: 'Facebook cover',
  category: 'social',
  dimensions: '820×312',
  build() {
    return createEmptyDocument({ viewBox: bbox(0, 0, 820, 312), width: 820, height: 312 });
  },
};

/** Ordered list of all 12 builtins. */
export const BUILTIN_TEMPLATES: readonly TemplateLibraryItem[] = [
  // print
  a4PortraitTemplate,
  a4LandscapeTemplate,
  letterPortraitTemplate,
  businessCardTemplate,
  // social
  instagramSquareTemplate,
  instagramPortraitTemplate,
  instagramStoryTemplate,
  pinterestPinTemplate,
  facebookCoverTemplate,
  twitterCardTemplate,
  // video / presentation
  youtubeThumbnailTemplate,
  presentation169Template,
];
