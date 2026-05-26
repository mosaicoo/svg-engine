export { SvgeToolOptions } from './tool-options.component';
// TOOL-OPT-A1 — registry pattern for built-in tool options (avoids
// D-017 violation by letting `svg-engine/ui` ship Material components
// for tools whose definitions live in `svg-engine/edit`).
export { ToolOptionsRegistry } from './tool-options-registry.service';
// TOOL-OPT-A4 — environment providers for all 15 built-in tool option
// components. Consumers add `provideSvgeBuiltinToolOptions()` to their
// `app.config.ts` to populate the registry.
export { provideSvgeBuiltinToolOptions } from './builtin-tool-options.providers';
// TOOL-OPT-A — built-in tool option components (exported for direct
// reference if a consumer wants to override one specific tool).
export { SvgeSymbolSprayerOptions } from './symbol-sprayer-options/symbol-sprayer-options.component';
export { SvgeWidthToolOptions } from './width-tool-options/width-tool-options.component';
// TOOL-OPT-B — shape + draw tool option components.
export { SvgeRectangleOptions } from './shape-tool-options/rectangle-options.component';
export { SvgeEllipseOptions } from './shape-tool-options/ellipse-options.component';
export { SvgePolygonOptions } from './shape-tool-options/polygon-options.component';
export { SvgePencilToolOptions } from './pencil-tool-options/pencil-tool-options.component';
export { SvgePenToolOptions } from './pen-tool-options/pen-tool-options.component';
// TOOL-OPT-C — text + gradient + eyedropper.
export { SvgeTextToolOptions } from './text-tool-options/text-tool-options.component';
export { SvgeGradientToolOptions } from './gradient-tool-options/gradient-tool-options.component';
export { SvgeEyedropperToolOptions } from './eyedropper-tool-options/eyedropper-tool-options.component';
// Shared CSS string for option components (consumers can build their
// own option components with the same visual language).
export { TOOL_OPT_SHARED_STYLES } from './shared-styles';
