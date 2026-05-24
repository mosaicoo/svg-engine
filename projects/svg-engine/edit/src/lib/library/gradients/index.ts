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
  linearBlueSkyGradient,
  linearGreyGradient,
  linearOceanGradient,
  linearSunsetGradient,
  radialNeonGradient,
  radialSpotlightGradient,
} from './builtin-gradients';
export { builtinGradientsPlugin } from './builtin-gradients.plugin';
// D-058 — inline editor: per-editor state + mutation command + overlay.
export { GradientEditingService } from './gradient-editing.service';
export { type GradientPatch, SetGradientCommand } from './set-gradient.command';
export { GradientOverlay } from './gradient-overlay.component';
