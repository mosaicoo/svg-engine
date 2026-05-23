import { bbox, createEmptyDocument } from 'svg-engine/core';
import type { TemplateLibraryItem } from './template-library.service';

/**
 * 4 built-in document templates (D-048). Each is a blank document
 * pre-sized for a common output format. Apply via
 * `EditorStateService.resetDocument(template.build())`.
 *
 * Sizes are in SVG units (1 unit = ~1 CSS pixel). The corresponding
 * print/export dimensions match standard formats: A4 portrait at
 * 96 DPI = 794×1123, etc. Tuned to a single round-friendly viewBox
 * for clean editing without imperial-vs-metric rounding errors.
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

/** Ordered list of all 4 builtins. */
export const BUILTIN_TEMPLATES: readonly TemplateLibraryItem[] = [
  a4PortraitTemplate,
  instagramSquareTemplate,
  twitterCardTemplate,
  businessCardTemplate,
];
