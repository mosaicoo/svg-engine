import type { NodeId } from '@mosaicoo/svg-engine/core';

/**
 * **D-077 — Asset export slot.**
 *
 * One row in the Asset Export panel: a recipe that says "when the
 * user clicks Export All, take *this* target, render it as *this*
 * format at *this* scale, and download with *this* filename".
 *
 * **Why slots and not commands**: batch export ("logo @1x.png +
 * @2x.png + .svg in one click") is the Illustrator/Figma export
 * workflow. A `Command` is one undoable mutation; export slots are
 * **non-mutating recipes** that persist across sessions and run
 * on demand. The right abstraction is a registry-backed slot list.
 *
 * **What's intentionally NOT here**:
 * - **Persistence**: the registry holds slots in memory; the host
 *   app decides whether to round-trip through localStorage or the
 *   document file format. Mirrors how `SnapshotsService` separates
 *   in-memory state from `SnapshotsPersistenceService`.
 * - **Per-asset cropping**: every asset in v1 uses the document
 *   viewBox. Future polish could add a per-node bbox crop (export
 *   just the selected logo, not the whole page).
 * - **Custom file naming patterns** beyond a literal string. Per
 *   user feedback we can grow `{name}/{scale}/{ext}` placeholders
 *   later — v1 stays literal for predictability.
 */
export interface ExportSlot {
  /** Stable id (UUID). Used to address the slot for update/remove. */
  readonly id: string;
  /**
   * What to export. `'document'` exports the whole canvas; a
   * `NodeId` (future polish) would export a subtree. v1 only
   * implements `'document'` — the field exists so consumers can
   * spot the API direction without a breaking change later.
   */
  readonly target: 'document' | { readonly nodeId: NodeId };
  /**
   * Exporter `id` from `ExporterRegistry` (e.g.,
   * `'svge.builtin.exporter.svg'`, `'svge.builtin.exporter.png'`).
   * Stored as id (not Exporter ref) so slots survive plugin
   * reloads and round-trip through serialization cleanly.
   */
  readonly exporterId: string;
  /**
   * Scale multiplier passed to raster exporters (PNG). Ignored
   * by vector exporters (SVG). Default `1`. Common retina values:
   * 1, 2, 3 — matches the @1x/@2x/@3x convention introduced in
   * D-021 PNG export presets.
   */
  readonly scale: number;
  /**
   * Filename WITHOUT the extension. The extension comes from the
   * resolved `Exporter.extension`. Empty / whitespace-only names
   * resolve to `'untitled'` at export time (defensive — keeps the
   * download dialog from showing a blank filename).
   */
  readonly filename: string;
}

/**
 * Input shape for {@link AssetExportRegistry.add}. The registry
 * synthesizes `id` if omitted — most consumers don't care about
 * the id, only the slot list as a whole.
 */
export type ExportSlotInput = Omit<ExportSlot, 'id'> & {
  readonly id?: string;
};

/**
 * Result of a single slot export. `ok: false` cases surface as
 * a console warning to the host but don't abort the batch — the
 * panel renders a per-slot success/fail badge after `exportAll`.
 */
export type ExportSlotResult =
  | { readonly ok: true; readonly slotId: string; readonly filename: string }
  | { readonly ok: false; readonly slotId: string; readonly error: string };
