/*
 * Public API surface of `svg-engine/io`.
 *
 * Headless SVG parse/sanitize/serialize entry point — the third of
 * the three explicit use cases (D-016): consumers that need to read
 * or write SVG files **without** instantiating any editor UI can
 * import directly from here.
 *
 * Zero deps on `@angular/material` or `@angular/cdk` (D-017).
 *
 * **What's here**:
 * - `Importer` / `Exporter` / `ImportResult` types (the contract)
 * - `ImporterRegistry` / `ExporterRegistry` services
 * - `svgImporter` (built-in SVG parser, sanitized)
 * - `svgExporter` (built-in deterministic SVG serializer)
 * - `pngExporter` + `renderPng()` (canvas-based PNG export)
 *
 * **What's NOT here** (lives in `svg-engine/edit`):
 * - `builtinIoPlugin`, `pngExporterPlugin` — these are the
 *   `EditorPlugin` wrappers that auto-register the importers/exporters
 *   at boot. They depend on the plugin scaffolding which lives in
 *   /edit. Use them if your consumer already pulls in /edit; use the
 *   bare exports here if you're building a headless tool.
 */

export { type Exporter, type Importer, type ImportResult } from './lib/io-types';
export { ExporterRegistry, ImporterRegistry } from './lib/io-registries.service';
export { svgImporter } from './lib/svg-importer';
export { svgExporter } from './lib/svg-exporter';
export { pngExporter, renderPng } from './lib/png-exporter';
