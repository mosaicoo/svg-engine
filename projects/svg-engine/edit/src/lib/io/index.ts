/**
 * IO plugin barrel — backward-compatibility re-exports.
 *
 * The IO primitives (registries, importers, exporters, types) moved to
 * the dedicated `svg-engine/io` entry point. This barrel re-exports them
 * so consumers that imported from `svg-engine/edit` continue to compile.
 * The plugin wrappers (`builtinIoPlugin`, `pngExporterPlugin`) remain
 * here because they depend on the `EditorPlugin` scaffolding which is
 * still owned by `svg-engine/edit`.
 */
export {
  type Exporter,
  type Importer,
  type ImportResult,
  ExporterRegistry,
  ImporterRegistry,
  svgImporter,
  svgExporter,
  pngExporter,
  renderPng,
} from 'svg-engine/io';
export { builtinIoPlugin } from './builtin-io.plugin';
export { pngExporterPlugin } from './png-exporter.plugin';
