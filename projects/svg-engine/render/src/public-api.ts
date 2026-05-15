/*
 * Public API surface of `svg-engine/render`.
 *
 * Read-only renderer: takes an `SvgNode` tree and renders it as SVG via
 * Angular standalone components. **Zero deps on `@angular/material` or
 * `@angular/cdk`** (D-017 headless boundary). Suitable as an embedded
 * viewer in third-party Angular apps.
 *
 * Plugin extensibility (D-020): unknown node types are dispatched through
 * `NodeRendererRegistry`; plugins register their renderer component there
 * and `<svge-node>` mounts it via `*ngComponentOutlet`.
 *
 * Pan / zoom: `ViewportService` exposes signal-based viewport state;
 * `<svge-renderer>` reads `viewport.viewBox()` when no explicit `viewBox`
 * input is provided.
 */

// Top-level renderer
export * from './lib/renderer';

// Per-type renderer components + dispatcher (exported for advanced reuse
// — e.g., consumers that want to embed a single shape outside of the
// dispatch flow, or mount renderers in custom layouts).
export * from './lib/renderers';

// Viewport (pan/zoom)
export * from './lib/viewport';

// Plugin extension point
export * from './lib/registry';

// Utilities (rarely needed by consumers, but exported for symmetry)
export * from './lib/util';
