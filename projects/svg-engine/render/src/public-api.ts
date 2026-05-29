/*
 * Public API surface of `svg-engine/render`.
 *
 * Read-only renderer: takes an `SvgNode` tree and renders it as SVG via
 * Angular standalone components. **Zero deps on `@angular/material` or
 * `@angular/cdk`** (D-017 headless boundary). Suitable as an embedded
 * viewer in third-party Angular apps.
 *
 * Plugin extensibility (D-020): unknown node types are dispatched through
 * `NodeRendererRegistry`; plugins register their renderer there and the
 * dispatcher mounts it via `*ngComponentOutlet`.
 *
 * Architecture note: per-type renderers are **directives** applied to the
 * native SVG element (e.g. `[svgeRect]` on `<svg:rect>`), not components
 * with custom-element selectors. Custom HTML elements inside an SVG break
 * the SVG render tree (the painter does not traverse non-SVG elements),
 * so directives are the only safe way to keep the entire DOM in the SVG
 * namespace.
 *
 * Pan / zoom: `ViewportService` exposes signal-based viewport state;
 * `<svge-renderer>` reads `viewport.viewBox()` when no explicit `viewBox`
 * input is provided.
 */

// Top-level renderer
export * from './lib/renderer';

// Dispatcher component + 9 per-type directives (Rect/Ellipse/Line/Polygon/
// Polyline/Path/Text/Image/SymbolUse — last one added in D-059). Exported
// for advanced reuse — e.g., consumers that want to apply a single directive
// on their own `<svg:rect>` outside the dispatch flow, or mount renderers
// in custom layouts.
export * from './lib/renderers';

// Viewport (pan/zoom)
export * from './lib/viewport';

// Plugin extension point
export * from './lib/registry';

// Utilities (rarely needed by consumers, but exported for symmetry)
export * from './lib/util';
