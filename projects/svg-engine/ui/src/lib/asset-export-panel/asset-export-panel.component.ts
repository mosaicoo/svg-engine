import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import {
  AssetExportRegistry,
  AssetExportRunner,
  type ExportSlot,
  type ExportSlotResult,
} from '@mosaicoo/svg-engine/edit';
import { ExporterRegistry } from '@mosaicoo/svg-engine/io';

/**
 * **D-077 — `<svge-asset-export-panel>`** — Illustrator/Figma-style
 * Asset Export panel.
 *
 * Lets the user assemble a list of **export slots** (target + format +
 * scale + filename) and trigger them all in one click via "Export
 * All". Each slot row exposes inline editing of the filename and
 * scale; remove/per-slot-export sit in the row actions. The header
 * carries "+ Add Slot" + "Export All (N)".
 *
 * **Mental model** (cribbed from Figma's "Export" panel + Affinity's
 * "Export Persona"): the panel is a list of "recipes". Editing the
 * canvas doesn't change recipes; only running them produces files.
 * No persistence in v1 — recipes live in {@link AssetExportRegistry}
 * for the editor instance's lifetime. Persistence (round-trip via
 * localStorage or document file) is a future polish; the registry
 * API is intentionally shaped to allow it without breaking changes.
 *
 * **Per-row visual state** after `exportAll`:
 * - Green check + filename when the slot exported successfully.
 * - Red exclaim + error tooltip when the slot failed (still in the
 *   list, user can retry by clicking Export All again).
 * The badge clears the next time the user edits any slot — keeps the
 * panel from carrying stale outcomes around forever.
 *
 * **A11y**: `role="list"` on the slot container, each row is
 * `role="listitem"` with descriptive `aria-label`. Filename input
 * has a visible `<mat-label>`. The add-slot dialog uses native
 * `<select>` + `<input>` (no Material dialog overlay needed — the
 * form sits inline above the list).
 */
@Component({
  selector: 'svge-asset-export-panel',
  standalone: true,
  imports: [
    FormsModule,
    MatButton,
    MatIconButton,
    MatIcon,
    MatFormField,
    MatLabel,
    MatInput,
    MatSelect,
    MatOption,
  ],
  host: {
    role: 'region',
    'aria-label': 'Asset export panel',
  },
  template: `
    <header class="actions-bar" role="toolbar" aria-label="Asset export actions">
      <button
        mat-icon-button
        type="button"
        class="add-slot-btn"
        title="Add export slot"
        aria-label="Add export slot"
        (click)="toggleAddForm()"
      >
        <mat-icon>add</mat-icon>
      </button>
      <span class="count">{{ count() }} slot{{ count() === 1 ? '' : 's' }}</span>
      <span class="spacer"></span>
      <button
        mat-flat-button
        type="button"
        color="primary"
        class="export-all-btn"
        [disabled]="count() === 0 || isExporting()"
        (click)="exportAll()"
        [attr.aria-label]="'Export all ' + count() + ' slots'"
        title="Export every slot (downloads start immediately)"
      >
        <mat-icon>download</mat-icon>
        {{ isExporting() ? 'Exporting…' : 'Export All' }}
      </button>
    </header>

    @if (showAddForm()) {
      <section class="add-form" aria-label="Add export slot">
        <mat-form-field appearance="outline" class="ff">
          <mat-label>Filename</mat-label>
          <input
            matInput
            type="text"
            [(ngModel)]="newFilename"
            (keydown.enter)="commitAdd()"
            placeholder="logo"
          />
        </mat-form-field>
        <mat-form-field appearance="outline" class="ff small">
          <mat-label>Format</mat-label>
          <mat-select [(ngModel)]="newExporterId">
            @for (exp of availableExporters(); track exp.id) {
              <mat-option [value]="exp.id">{{ exp.extension.toUpperCase() }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="ff scale">
          <mat-label>Scale</mat-label>
          <mat-select [(ngModel)]="newScale">
            <mat-option [value]="1">1×</mat-option>
            <mat-option [value]="2">2×</mat-option>
            <mat-option [value]="3">3×</mat-option>
            <mat-option [value]="4">4×</mat-option>
          </mat-select>
        </mat-form-field>
        <div class="add-actions">
          <button mat-button type="button" (click)="cancelAdd()">Cancel</button>
          <button
            mat-flat-button
            color="primary"
            type="button"
            [disabled]="!canCommit()"
            (click)="commitAdd()"
          >
            Add
          </button>
        </div>
      </section>
    }

    @if (count() === 0 && !showAddForm()) {
      <p class="empty">No export slots — click + to add one.</p>
    } @else {
      <ul class="slots" role="list" aria-label="Export slots">
        @for (slot of slots(); track slot.id) {
          <li class="slot" role="listitem" [attr.aria-label]="ariaLabelFor(slot)">
            <div class="slot-row">
              <input
                type="text"
                class="filename-input"
                [value]="slot.filename"
                (change)="updateFilename(slot.id, $any($event.target).value)"
                [attr.aria-label]="'Filename for slot ' + slot.id"
              />
              <span class="ext-tag">{{ extensionFor(slot) }}</span>
              <span class="scale-tag" [class.dim]="!supportsScale(slot)"> @{{ slot.scale }}× </span>
            </div>
            <div class="slot-actions">
              @if (resultFor(slot.id); as result) {
                @if (result.ok) {
                  <mat-icon class="badge ok" [title]="'Exported as ' + result.filename"
                    >check_circle</mat-icon
                  >
                } @else {
                  <mat-icon class="badge fail" [title]="result.error">error</mat-icon>
                }
              }
              <button
                mat-icon-button
                type="button"
                class="row-btn"
                title="Export only this slot"
                aria-label="Export this slot"
                [disabled]="isExporting()"
                (click)="exportOne(slot)"
              >
                <mat-icon>download</mat-icon>
              </button>
              <button
                mat-icon-button
                type="button"
                class="row-btn"
                title="Remove slot"
                aria-label="Remove slot"
                (click)="removeSlot(slot.id)"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-size: 13px;
      background: var(--mat-sys-surface-container, #fafafa);
    }
    .actions-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      flex: 0 0 auto;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      background: var(--mat-sys-surface-container-low, transparent);
    }
    .add-slot-btn {
      width: 28px;
      height: 28px;
      padding: 0;
      --mdc-icon-button-state-layer-size: 28px;
      --mat-icon-button-touch-target-display: none;
    }
    .add-slot-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .count {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #777);
      font-variant-numeric: tabular-nums;
    }
    .spacer {
      flex: 1 1 auto;
    }
    .export-all-btn {
      font-size: 12px;
      line-height: 1.2;
      padding: 4px 10px;
    }
    .export-all-btn .mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 4px;
    }
    .add-form {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 8px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.04));
    }
    .ff {
      flex: 1 1 auto;
    }
    .ff.small {
      flex: 0 0 80px;
    }
    .ff.scale {
      flex: 0 0 76px;
    }
    .add-actions {
      display: flex;
      gap: 4px;
      width: 100%;
      justify-content: flex-end;
    }
    .empty {
      padding: 14px;
      color: var(--mat-sys-on-surface-variant, #777);
      text-align: center;
      font-style: italic;
    }
    .slots {
      list-style: none;
      margin: 0;
      padding: 4px 0;
      overflow-y: auto;
      flex: 1 1 auto;
      min-height: 0;
    }
    .slot {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #eee);
    }
    .slot:hover {
      background: var(--mat-sys-surface-container-high, #eee);
    }
    .slot-row {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }
    .filename-input {
      flex: 1 1 auto;
      min-width: 0;
      padding: 2px 4px;
      font: inherit;
      color: inherit;
      background: transparent;
      border: 1px solid transparent;
      border-radius: 3px;
    }
    .filename-input:hover,
    .filename-input:focus {
      background: var(--mat-sys-surface, #fff);
      border-color: var(--mat-sys-outline-variant, #ccc);
      outline: none;
    }
    .filename-input:focus {
      border-color: var(--mat-sys-primary, #1976d2);
    }
    .ext-tag {
      flex: 0 0 auto;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 3px;
      background: var(--mat-sys-secondary-container, #e8eaed);
      color: var(--mat-sys-on-secondary-container, #444);
      text-transform: uppercase;
      letter-spacing: 0.4px;
      font-variant-numeric: tabular-nums;
    }
    .scale-tag {
      flex: 0 0 auto;
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant, #777);
      font-variant-numeric: tabular-nums;
      min-width: 28px;
      text-align: right;
    }
    .scale-tag.dim {
      /* Scale is ignored by vector exporters (SVG). Visually de-emphasized
         so users learn the field only matters for raster formats. */
      opacity: 0.4;
    }
    .slot-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      flex: 0 0 auto;
    }
    .row-btn {
      width: 24px;
      height: 24px;
      padding: 0;
      --mdc-icon-button-state-layer-size: 24px;
      --mat-icon-button-touch-target-display: none;
    }
    .row-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .badge {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    .badge.ok {
      color: var(--mat-sys-tertiary, #2e7d32);
    }
    .badge.fail {
      color: var(--mat-sys-error, #b3261e);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeAssetExportPanel {
  private readonly registry = inject(AssetExportRegistry);
  private readonly runner = inject(AssetExportRunner);
  private readonly exporterRegistry = inject(ExporterRegistry);

  protected readonly slots = this.registry.slots;
  protected readonly count = this.registry.count;

  protected readonly showAddForm = signal(false);
  protected readonly isExporting = signal(false);
  /**
   * Per-slot export result map keyed by slot id. Reset whenever the
   * user edits a slot (filename / scale change) so stale outcomes
   * don't linger. Wrapped in a signal so the row's badge re-renders
   * reactively without re-running the batch.
   */
  protected readonly results = signal<ReadonlyMap<string, ExportSlotResult>>(new Map());

  // ── Add-slot form state ─────────────────────────────────────────

  protected newFilename = '';
  protected newExporterId = '';
  protected newScale = 1;

  /**
   * Available exporters from the global `ExporterRegistry`. Filters
   * to text/raster formats appropriate for asset export — same set
   * the menu's `Export SVG` / `Export PNG` items consume.
   */
  protected readonly availableExporters = computed(() =>
    this.exporterRegistry.exporters().map((e) => ({ id: e.id, extension: e.extension })),
  );

  protected canCommit(): boolean {
    return this.newExporterId.length > 0;
  }

  protected toggleAddForm(): void {
    const next = !this.showAddForm();
    this.showAddForm.set(next);
    if (next && this.newExporterId === '') {
      // Seed with the first available exporter so the user only has
      // to fill the name when adding the very first slot.
      const first = this.availableExporters()[0];
      if (first !== undefined) this.newExporterId = first.id;
    }
  }

  protected cancelAdd(): void {
    this.showAddForm.set(false);
    this.newFilename = '';
    this.newScale = 1;
    // Keep newExporterId so the next reopen pre-fills it.
  }

  protected commitAdd(): void {
    if (!this.canCommit()) return;
    this.registry.add({
      target: 'document',
      exporterId: this.newExporterId,
      scale: this.newScale,
      filename: this.newFilename,
    });
    // Clear results — adding a slot invalidates per-row badges.
    this.results.set(new Map());
    this.newFilename = '';
    this.newScale = 1;
    this.showAddForm.set(false);
  }

  // ── Per-row helpers ─────────────────────────────────────────────

  protected updateFilename(id: string, value: string): void {
    this.registry.update(id, { filename: value });
    this.results.set(new Map());
  }

  protected removeSlot(id: string): void {
    this.registry.remove(id);
    // Drop the cached result for this id so any future re-add doesn't
    // immediately resurface a stale badge.
    const map = new Map(this.results());
    map.delete(id);
    this.results.set(map);
  }

  protected extensionFor(slot: ExportSlot): string {
    const exporter = this.exporterRegistry.get(slot.exporterId);
    return exporter?.extension ?? '?';
  }

  /**
   * True when the exporter is raster-style and thus respects the
   * scale field (PNG / future JPG). Drives a CSS `.dim` class on the
   * scale tag so the user learns the field is inert for SVG.
   */
  protected supportsScale(slot: ExportSlot): boolean {
    const ext = this.extensionFor(slot).toLowerCase();
    return ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp';
  }

  protected resultFor(slotId: string): ExportSlotResult | null {
    return this.results().get(slotId) ?? null;
  }

  protected ariaLabelFor(slot: ExportSlot): string {
    const ext = this.extensionFor(slot);
    return `Export ${slot.filename}.${ext} at ${slot.scale}× scale`;
  }

  // ── Batch / per-row execution ───────────────────────────────────

  protected async exportAll(): Promise<void> {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    try {
      const results = await this.runner.exportAll();
      const map = new Map<string, ExportSlotResult>();
      for (const r of results) map.set(r.slotId, r);
      this.results.set(map);
    } finally {
      this.isExporting.set(false);
    }
  }

  protected async exportOne(slot: ExportSlot): Promise<void> {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    try {
      // Single-slot export reuses the same runner so collision
      // resolution is consistent (one isolated `usedNames` set).
      const usedNames = new Set<string>();
      const result = await this.runner.exportSlot(slot, usedNames);
      const map = new Map(this.results());
      map.set(slot.id, result);
      this.results.set(map);
    } finally {
      this.isExporting.set(false);
    }
  }
}
