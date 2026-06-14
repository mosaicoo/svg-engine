import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { EditorStateService } from 'svg-engine/core';
import { ExporterRegistry, renderPng } from 'svg-engine/io';
import { ActiveDefsService } from '../library/active-defs.service';
import { ActivePageService } from '../pages/active-page.service';
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
 *
 * @internal **Cross-entry-point**: exportado para a `<svge-asset-export-panel>`
 * de `svg-engine/ui` consumir do pacote buildado. Fora do contrato público
 * estável — pode mudar sem major bump; consumidores externos não devem
 * depender diretamente.
 */
@Injectable({ providedIn: 'root' })
export class AssetExportRunner {
  private readonly state = inject(EditorStateService);
  private readonly exporters = inject(ExporterRegistry);
  private readonly registry = inject(AssetExportRegistry);
  private readonly document = inject(DOCUMENT);
  /**
   * **PAGES-REFACTOR Fase 6 follow-up** — when an active D-079 page
   * is present, the batch exporter projects the document down to that
   * SINGLE page's content (page.children become the export root, the
   * page's viewBox becomes the SVG viewBox). Without this, "Export
   * All" emits the FULL document with every page's shapes overlapping
   * inside one file — the bug the user reported.
   */
  private readonly activePage = inject(ActivePageService);
  /**
   * **Export-fidelity fix** — runtime-derived defs (gradients, patterns,
   * effects, chains, clipPaths, masks, symbols) live only in the editor's
   * registries, not in `document.defs`. The File→Export path merges them
   * via {@link ActiveDefsService.buildExportDefs} before serializing;
   * this batch runner previously did NOT, so every slot (SVG **and** PNG)
   * dropped them — shapes with `fill="url(#id)"` came out transparent /
   * unfiltered. Merge here too so both export paths stay faithful.
   */
  private readonly activeDefs = inject(ActiveDefsService);

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
    // PAGES-REFACTOR Fase 6 follow-up — same active-page projection
    // as the File→Export SVG/PNG path (builtin-menu-contributions
    // plugin). Mirrors that helper's call to `effectiveExportDoc` so
    // both export paths render the same single-page output. Falls back
    // to the raw doc in legacy single-root docs (no active page).
    //
    // Export-fidelity fix — merge runtime defs BEFORE the page
    // projection (effectiveExportDoc spreads `...doc`, preserving the
    // merged `defs`), identical to `exportAndDownload`. Without this the
    // batch path dropped gradients/filters/effects/patterns/clip/mask/
    // symbols and shapes referencing them exported blank.
    const raw = this.state.document();
    const withDefs = { ...raw, defs: this.activeDefs.buildExportDefs(raw.defs) };
    const doc = this.activePage.effectiveExportDoc(withDefs);
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
