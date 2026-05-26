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
