import type { SvgDocument } from 'svg-engine/core';

/**
 * Outcome of an import operation. Either a parsed document with
 * (optional) non-fatal warnings, OR a hard failure with reason.
 *
 * Soft failures (e.g., "skipped a `<script>` for safety") go in
 * `warnings`; they don't abort the import. Hard failures (malformed
 * XML, unsupported root element) produce `{ ok: false, error }`.
 */
export type ImportResult =
  | { readonly ok: true; readonly document: SvgDocument; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly error: string };

/**
 * Plugin contribution to the import pipeline (categoria 4 do D-023).
 *
 * **Fields**:
 * - `id`: unique within {@link ImporterRegistry}. Reverse-DNS suggested.
 * - `name`: human-readable label for UIs that surface importer choice.
 * - `mediaTypes`: list of MIME types the importer accepts (used by UI
 *   to filter `<input type="file" accept="...">` and auto-pick).
 * - `extensions`: file extensions WITHOUT the dot (`'svg'`, not `'.svg'`).
 *   Same usage as `mediaTypes` for file-based UIs.
 * - `import(text)`: parse `text` and return either a document or an
 *   error. MUST be pure (no DOM/state mutation) for testability.
 */
export interface Importer {
  readonly id: string;
  readonly name: string;
  readonly mediaTypes: readonly string[];
  readonly extensions: readonly string[];
  import(text: string): ImportResult;
}

/**
 * Plugin contribution to the export pipeline (categoria 5 do D-023).
 *
 * Mirrors {@link Importer} on the way out.
 *
 * **Fields**:
 * - `id`/`name`: identifier + label
 * - `mediaType`: emitted MIME type (e.g., `'image/svg+xml'`)
 * - `extension`: suggested file extension WITHOUT the dot
 * - `export(doc)`: serialize the document. Returns `string` for text-
 *   formats. Binary formats (PNG via canvas) can return Promise<Blob>
 *   via the {@link AsyncExporter} variant — left for future plugins.
 */
export interface Exporter {
  readonly id: string;
  readonly name: string;
  readonly mediaType: string;
  readonly extension: string;
  export(document: SvgDocument): string;
}
