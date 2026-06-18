export {
  type BackgroundConfig,
  type GridConfig,
  type Guide,
  type InteractionConfig,
  pageBoundsIn,
  type PageConfig,
  type RulersConfig,
  WHEEL_ZOOM_SPEED_MAX,
  WHEEL_ZOOM_SPEED_MIN,
  // wheelZoomSensitivityFromSpeed: mapeamento interno (só SvgeCanvasGestures,
  // import relativo). pageBoundsIn permanece — consumido pela app via barrel.
  WorkspaceService,
} from './workspace.service';
export { WorkspaceBackground } from './workspace-background.component';
export { GridOverlay } from './grid-overlay.component';
export { GuidesOverlay } from './guides-overlay.component';
export { PageOverlay } from './page-overlay.component';
export { OutlineFilter } from './outline-filter.directive';
export { PixelPreviewFilter } from './pixel-preview-filter.directive';
export { SvgePixelPreviewRaster } from './pixel-preview-raster.component';
