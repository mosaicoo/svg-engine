export {
  buildGradientMarkup,
  GradientLibraryService,
  ActiveGradientsService,
  type GradientGeometry,
  type GradientLibraryItem,
  type GradientStop,
  type GradientKind,
} from './gradient-library.service';
export {
  BUILTIN_GRADIENTS,
  // 6 originals
  linearBlueSkyGradient,
  linearGreyGradient,
  linearOceanGradient,
  linearSunsetGradient,
  radialNeonGradient,
  radialSpotlightGradient,
  // 5 horizontal (geometry-driven, D-058)
  linearSunriseGradient,
  linearMintGradient,
  linearGrapeGradient,
  linearEmberGradient,
  linearSteelGradient,
  // 5 vertical
  linearDuskGradient,
  linearForestGradient,
  linearSkyFadeGradient,
  linearRoseGradient,
  linearGraphiteGradient,
  // 5 diagonal
  linearAuroraGradient,
  linearPeachyGradient,
  linearDeepSeaGradient,
  linearLavaGradient,
  linearTwilightGradient,
} from './builtin-gradients';
export { builtinGradientsPlugin } from './builtin-gradients.plugin';
// D-058 — inline editor: per-editor state + mutation command + overlay.
export { GradientEditingService } from './gradient-editing.service';
export { type GradientPatch, SetGradientCommand } from './set-gradient.command';
export { GradientOverlay } from './gradient-overlay.component';
