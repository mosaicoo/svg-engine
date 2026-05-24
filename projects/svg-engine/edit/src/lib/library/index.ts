/**
 * Library System — D-048 (2026-05-23).
 *
 * 8 library types backed by a generic `LibraryItem<T>` /
 * `LibraryRegistry<T>` foundation. Each library is independently
 * provisioned via a plugin (opt-in, zero cost when not installed).
 *
 * Mapping of gap-list items → entry points:
 *
 * | Gap item             | Service / plugin                            | Status |
 * | -------------------- | ------------------------------------------- | ------ |
 * | Shape Library        | `ShapeLibraryService` + `builtinShapesPlugin` | ✅ 12 builtins |
 * | Template Library     | `TemplateLibraryService` + `builtinTemplatesPlugin` | ✅ 4 builtins |
 * | Asset Manager        | `AssetManagerService` (file picker → data URI) | ✅ |
 * | Symbol Library       | `SymbolLibraryService` + `builtinSymbolsPlugin` | ✅ 4 builtins (D-059 — master/instance via SymbolUseNode) |
 * | Brush Library        | `BrushLibraryService` + `builtinBrushesPlugin` | ✅ 3 builtins (D-060 — Pencil expansion via widthProfile) |
 * | Pattern Library      | `PatternLibraryService` + `builtinPatternsPlugin` | ✅ 5 builtins |
 * | Style Library        | `GraphicStyleLibraryService` + `builtinGraphicStylesPlugin` | ✅ 6 builtins |
 * | Palette Library      | existing `PaletteRegistry` + `extraPalettesPlugin` | ✅ 4 extras |
 * | Gradient (Item 3)    | `GradientLibraryService` + `builtinGradientsPlugin` | ✅ 6 builtins |
 */

export type { LibraryItem } from './library-item';
export { LibraryRegistry } from './library-registry';

export * from './shapes';
export * from './palettes';
export * from './graphic-styles';
export * from './gradients';
export * from './patterns';
export * from './templates';
export * from './symbols';
export * from './brushes';
export * from './assets';
// D-049 (Item 4 — Composição / Recorte): clipPath + mask libraries
// with the same Catalog + Active split pattern as gradients/patterns.
export * from './clip-paths';
export * from './masks';
// D-058 export fix — central defs composer used by shells + exporter.
export { ActiveDefsService } from './active-defs.service';
