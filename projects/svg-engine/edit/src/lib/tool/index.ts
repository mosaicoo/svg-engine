export { type Tool, type ToolContext, type ToolPointerEvent } from './tool';
export { ToolRegistry } from './tool-registry.service';
export { ToolHostService } from './tool-host.service';
export {
  DIRECT_SELECT_TOOL_ID,
  PENCIL_TOOL_ID,
  pencilToolPlugin,
  pointsToPathD,
  SELECT_TOOL_ID,
  selectToolPlugin,
} from './builtin-tools';
export { PEN_TOOL_ID, penToolPlugin } from './pen-tool.plugin';
export { PenToolService } from './pen-tool.service';
export { PenOverlay } from './pen-overlay.component';
export { PencilToolService } from './pencil-tool.service';
export { PencilOverlay } from './pencil-overlay.component';
export {
  ELLIPSE_TOOL_ID,
  POLYGON_TOOL_ID,
  RECTANGLE_TOOL_ID,
  shapeToolsPlugin,
} from './shape-tools.plugin';
export {
  boundsOfDraft,
  DEFAULT_POLYGON_SIDES,
  regularPolygonPoints,
  type ShapeDraft,
  type ShapeKind,
  ShapeToolService,
} from './shape-tool.service';
export { ShapeOverlay } from './shape-overlay.component';
export { PLACEHOLDER_TEXT, TEXT_TOOL_ID, textToolPlugin } from './text-tool.plugin';
export { InlineTextEditorService } from './text-tool.service';
export { InlineTextEditor } from './inline-text-editor.component';
export { SvgeShellInteractions } from './shell-interactions.directive';
// D-050 (Item 5 — Tools faltantes): Eyedropper / Knife / Smooth /
// Gradient + D-062 real implementations for Width / Symbol Sprayer.
//
// MESH_TOOL_ID stays exported as a no-op constant for back-compat
// (see D-062c removal note in extra-tools.ts).
export {
  EYEDROPPER_TOOL_ID,
  KNIFE_TOOL_ID,
  SMOOTH_TOOL_ID,
  GRADIENT_TOOL_ID,
  WIDTH_TOOL_ID,
  MESH_TOOL_ID,
  SYMBOL_SPRAYER_TOOL_ID,
  GradientToolService,
  // D-062b
  WidthToolService,
  type WidthProfilePreset,
  // D-062a
  SymbolSprayerService,
  // TOOL-OPT-C — eyedropper prefs (sampleTarget + autoApply)
  EyedropperToolService,
  // TOOL-OPT-D — knife/smooth prefs
  KnifeToolService,
  SmoothToolService,
  extraToolsPlugin,
  simplifySubpath,
} from './extra-tools';
