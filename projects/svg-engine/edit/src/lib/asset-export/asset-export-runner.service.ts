import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { EditorStateService } from 'svg-engine/core';
import { ExporterRegistry, renderPng } from 'svg-engine/io';
import { AssetExportRegistry } from './asset-export-registry.service';
import type { ExportSlot, ExportSlotResult } from './asset-export.types';

/**
 * **D-077 — Asset Export runner.**
 *
 * Executes the slots registered in {@link AssetExportRegistry} —
 * serializes the active document via each slot's exporter (resolved
 * by id in {@link ExporterRegistry}), wires up unique filenames via
 * the registry's `resolveUniqueName`, then triggers a browser
 * download per slot. Returns a per-slot result array so the UI can
 * mark which downloads succeeded and which failed.
 *
 * **Why separate from the registry**: the runner depends on browser
 * APIs (`URL.createObjectURL`, `<a download>`) and on
 * `EditorStateService` (the document); the registry is a pure store
 * of recipes. Keeping them apart means the registry can be unit-tested
 * without a DOM, and consumers writing custom batch flows
 * (e.g., write to a server instead of download) can implement their
 * own runner against the same registry.
 *
 * **Scope**: per-editor — same rationale as the registry (each editor
 * exports its own document). Listed in `provideSvgEngineEditorScope`.
 *
 * **PNG scale handling**: SVG exporter ignores the `scale` field; PNG
 * exporter has a hard-coded 2× in its `export()` method, so for
 * non-default scales we bypass the `Exporter.export()` call and use
 * `renderPng(doc, scale)` directly — matches D-021's playground
 * "Export PNG with presets" behaviour.
 */
@Injectable({ providedIn: 'root' })
export class AssetExportRunner {
  private readonly state = inject(EditorStateService);
  private readonly exporters = inject(ExporterRegistry);
  private readonly registry = inject(AssetExportRegistry);
  private readonly document = inject(DOCUMENT);

  /**
   * Execute one slot. Returns either `{ ok: true, filename }` (after
   * the browser download was triggered) or `{ ok: false, error }`.
   * Exposed publicly for "Export this row only" buttons in the UI.
   *
   * `usedNames` is mutated in place when the export succeeds so
   * subsequent calls within the same batch see the resolved name and
   * disambiguate collisions correctly.
   */
  async exportSlot(slot: ExportSlot, usedNames: Set<string>): Promise<ExportSlotResult> {
    const exporter = this.exporters.get(slot.exporterId);
    if (exporter === null) {
      return { ok: false, slotId: slot.id, error: `Exporter "${slot.exporterId}" not registered` };
    }
    const doc = this.state.document();
    const filename = this.registry.resolveUniqueName(slot.filename, exporter.extension, usedNames);
    let payload: string | Blob;
    try {
      // PNG with custom scale takes the direct renderPng path so the
      // user-chosen scale isn't ignored by pngExporter's hard-coded 2×.
      if (exporter.extension === 'png' && slot.scale !== 2) {
        payload = await renderPng(doc, slot.scale);
      } else {
        const out = exporter.export(doc);
        payload = await Promise.resolve(out);
      }
    } catch (e) {
      return { ok: false, slotId: slot.id, error: stringifyError(e) };
    }
    try {
      this.download(payload, filename, exporter.mediaType);
    } catch (e) {
      return { ok: false, slotId: slot.id, error: stringifyError(e) };
    }
    usedNames.add(filename);
    return { ok: true, slotId: slot.id, filename };
  }

  /**
   * Run every registered slot. Resolves to the per-slot result array
   * in slot order. Failures don't abort the batch — the UI shows
   * which rows succeeded and lets the user retry the failures.
   */
  async exportAll(): Promise<readonly ExportSlotResult[]> {
    const slots = this.registry.slots();
    const usedNames = new Set<string>();
    const results: ExportSlotResult[] = [];
    for (const slot of slots) {
      results.push(await this.exportSlot(slot, usedNames));
    }
    return results;
  }

  // ── Internals ─────────────────────────────────────────────────

  /**
   * Wrap the exporter output in a Blob (if needed) and trigger a
   * browser download via the canonical anchor.click pattern. Mirrors
   * what the menu plugin's `exportAndDownload` does — kept private
   * here because the broader plugin signature differs.
   */
  private download(payload: string | Blob, filename: string, mediaType: string): void {
    if (typeof URL === 'undefined' || typeof this.document === 'undefined') return;
    const blob = payload instanceof Blob ? payload : new Blob([payload], { type: mediaType });
    const url = URL.createObjectURL(blob);
    const anchor = this.document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    this.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Defer revoke so the browser starts the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function stringifyError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
