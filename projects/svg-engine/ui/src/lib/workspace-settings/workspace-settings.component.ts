import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { WorkspaceService } from 'svg-engine/edit';

/**
 * Settings dialog for the `WorkspaceService` (Item 2 — débito 4f).
 * Exposes page / grid / rulers controls in a Material `<mat-dialog>`
 * so users can adjust them without leaving the canvas.
 *
 * **Surface kept narrow on purpose**:
 * - Page: width / height / orientation
 * - Grid: enabled / spacing / majorEvery (color picker deferred —
 *   the default `--mat-sys-outline-variant` blends well in both
 *   themes; custom color is plugin territory)
 * - Rulers: enabled
 * - Guides: count (read-only) + "Clear all"
 *
 * Margins NOT exposed in v1 — workspace model supports them but no
 * editor feature consumes them yet (would be confusing to set
 * without visible feedback).
 *
 * **Usage** (typically opened from a toolbar button):
 * ```ts
 * dialog.open(SvgeWorkspaceSettings, { width: '420px' });
 * ```
 */
@Component({
  selector: 'svge-workspace-settings',
  standalone: true,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatSelectModule,
    MatCheckboxModule,
    MatIcon,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon aria-hidden="true">tune</mat-icon>
      Workspace settings
    </h2>
    <mat-dialog-content>
      <section class="group">
        <h3>Page</h3>
        <div class="row">
          <mat-form-field appearance="outline" class="small">
            <mat-label>width</mat-label>
            <input
              matInput
              type="number"
              min="1"
              [value]="pageWidth()"
              (change)="setPageWidth($any($event.target).value)"
            />
          </mat-form-field>
          <mat-form-field appearance="outline" class="small">
            <mat-label>height</mat-label>
            <input
              matInput
              type="number"
              min="1"
              [value]="pageHeight()"
              (change)="setPageHeight($any($event.target).value)"
            />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>orientation</mat-label>
            <mat-select
              [value]="pageOrientation()"
              (selectionChange)="setOrientation($any($event).value)"
            >
              <mat-option value="landscape">Landscape</mat-option>
              <mat-option value="portrait">Portrait</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </section>

      <section class="group">
        <h3>Grid</h3>
        <mat-checkbox [checked]="gridEnabled()" (change)="setGridEnabled($any($event).checked)">
          Show grid
        </mat-checkbox>
        <div class="row">
          <mat-form-field appearance="outline" class="small">
            <mat-label>spacing</mat-label>
            <input
              matInput
              type="number"
              min="1"
              step="1"
              [value]="gridSpacing()"
              (change)="setGridSpacing($any($event.target).value)"
            />
          </mat-form-field>
          <mat-form-field appearance="outline" class="small">
            <mat-label>major every</mat-label>
            <input
              matInput
              type="number"
              min="1"
              step="1"
              [value]="gridMajorEvery()"
              (change)="setGridMajorEvery($any($event.target).value)"
            />
          </mat-form-field>
        </div>
      </section>

      <section class="group">
        <h3>Rulers</h3>
        <mat-checkbox [checked]="rulersEnabled()" (change)="setRulersEnabled($any($event).checked)">
          Show rulers
        </mat-checkbox>
      </section>

      <section class="group">
        <h3>Guides</h3>
        <p class="info">{{ guideCount() }} guide{{ guideCount() === 1 ? '' : 's' }} on canvas</p>
        <button mat-button type="button" [disabled]="guideCount() === 0" (click)="clearGuides()">
          Clear all
        </button>
      </section>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="resetAll()">Reset defaults</button>
      <button mat-flat-button type="button" (click)="dialogRef.close()">Done</button>
    </mat-dialog-actions>
  `,
  styles: `
    :host {
      display: block;
      min-width: 360px;
    }
    .group {
      padding: 8px 0;
      border-top: 1px solid var(--mat-sys-outline-variant, #ddd);
    }
    .group:first-of-type {
      border-top: 0;
    }
    .group h3 {
      margin: 0 0 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--mat-sys-on-surface-variant, #777);
    }
    .row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .small {
      flex: 0 0 110px;
    }
    .info {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant, #777);
      font-size: 13px;
    }
    mat-checkbox {
      display: block;
      margin-bottom: 8px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeWorkspaceSettings {
  private readonly ws = inject(WorkspaceService);
  protected readonly dialogRef = inject(MatDialogRef<SvgeWorkspaceSettings>);

  // ── Page readers ──────────────────────────────────────────────

  protected readonly pageWidth = computed(() => this.ws.page().width);
  protected readonly pageHeight = computed(() => this.ws.page().height);
  protected readonly pageOrientation = computed(() => this.ws.page().orientation);

  // ── Grid / Rulers / Guides readers ────────────────────────────

  protected readonly gridEnabled = computed(() => this.ws.grid().enabled);
  protected readonly gridSpacing = computed(() => this.ws.grid().spacing);
  protected readonly gridMajorEvery = computed(() => this.ws.grid().majorEvery);
  protected readonly rulersEnabled = computed(() => this.ws.rulers().enabled);
  protected readonly guideCount = computed(() => this.ws.guides().length);

  // ── Mutators (delegate validation to WorkspaceService) ────────

  protected setPageWidth(raw: string): void {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n > 0) this.ws.patchPage({ width: n });
  }
  protected setPageHeight(raw: string): void {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n > 0) this.ws.patchPage({ height: n });
  }
  protected setOrientation(value: 'landscape' | 'portrait'): void {
    this.ws.patchPage({ orientation: value });
  }
  protected setGridEnabled(checked: boolean): void {
    this.ws.patchGrid({ enabled: checked });
  }
  protected setGridSpacing(raw: string): void {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n > 0) this.ws.patchGrid({ spacing: n });
  }
  protected setGridMajorEvery(raw: string): void {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) this.ws.patchGrid({ majorEvery: n });
  }
  protected setRulersEnabled(checked: boolean): void {
    this.ws.setRulersEnabled(checked);
  }
  protected clearGuides(): void {
    this.ws.clearGuides();
  }
  protected resetAll(): void {
    this.ws.resetPage();
    this.ws.resetGrid();
    this.ws.setRulersEnabled(false);
    this.ws.clearGuides();
  }
}
