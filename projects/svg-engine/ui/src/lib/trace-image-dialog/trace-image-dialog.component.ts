import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { NodeId } from '@mosaicoo/svg-engine/core';
import { SvgeDialogShell } from '../dialog-shell';

/**
 * Data injected into the dialog via `MAT_DIALOG_DATA`. The caller
 * (menu handler / shortcut handler) already resolved the
 * `SelectionService` and knows the image node id; passing it through
 * keeps the dialog uncoupled from selection state.
 */
export interface TraceImageDialogData {
  readonly imageNodeId: NodeId;
}

/**
 * Result returned by the dialog on Apply. `null` from `afterClosed()`
 * means the user cancelled — the caller should not trigger the trace.
 *
 * **Why return options instead of doing the work**: keeps the dialog
 * a pure-UI component (collects parameters, returns them). The caller
 * does the heavy lifting (instantiate the command, manage progress,
 * dispatch). Easier to test, easier to reuse the dialog from non-menu
 * contexts in the future.
 */
export interface TraceImageDialogResult {
  readonly threshold: number;
  readonly tolerance: number;
  readonly minPoints: number;
  readonly hideSource: boolean;
}

/**
 * **D-066c** — Trace Image options dialog.
 *
 * Material-dialog wrapper around `TraceImageCommand` (D-062d) that
 * lets the user tune the bitmap-tracing parameters before committing.
 * Replaces the D-065-follow-up's no-dialog menu entry that always
 * used hardcoded defaults — now the user can:
 *
 * - **Threshold** (0..255, default 128): luminance cut-off between
 *   "ink" (≤ threshold → traced) and "paper" (> threshold → skipped).
 *   Lower = less aggressive (only the darkest pixels become ink);
 *   higher = more aggressive (more pixels qualify as ink).
 * - **Tolerance** (0..10px, default 1): Douglas-Peucker simplification
 *   factor. 0 = preserve every marching-squares vertex (densest, most
 *   accurate). Higher = smoother but less detail.
 * - **Min points** (3..20, default 4): contours with fewer points after
 *   simplification get dropped as noise (single-pixel speckles).
 * - **Hide source image** (default `true`): after the trace, set the
 *   source `<image>` node's `metadata.visible = false` so the user
 *   sees only the vector result. Easy to toggle back via layer panel.
 *
 * **Live preview is NOT included** in v1 — would need to run the
 * full trace pipeline on every slider drag (expensive). The dialog
 * accepts blind tuning + Apply; iterating via undo+reopen is the
 * pragmatic loop.
 *
 * **Headless boundary**: lives in `svg-engine/ui` (Material), the
 * only home for `MatDialog`. Headless consumers construct
 * `TraceImageCommand` directly with their own UI affordance.
 */
@Component({
  selector: 'svge-trace-image-dialog',
  standalone: true,
  imports: [SvgeDialogShell, MatButton],
  template: `
    <svge-dialog-shell
      icon="auto_fix_normal"
      title="Trace Image"
      subtitle="Convert the selected bitmap to vector paths"
    >
      <!-- Body (default slot) -->
      <div class="form" role="group" aria-label="Trace options">
        <label class="row">
          <span class="label">Threshold</span>
          <input
            class="slider"
            type="range"
            min="0"
            max="255"
            step="1"
            [value]="threshold()"
            (input)="onThreshold($event)"
            aria-label="Luminance threshold (0 to 255)"
          />
          <span class="value" aria-live="polite">{{ threshold() }}</span>
        </label>
        <p class="hint">
          Pixels with luminance ≤ threshold become "ink" (traced). Lower = only the darkest pixels;
          higher = more pixels qualify.
        </p>

        <label class="row">
          <span class="label">Tolerance</span>
          <input
            class="slider"
            type="range"
            min="0"
            max="10"
            step="0.1"
            [value]="tolerance()"
            (input)="onTolerance($event)"
            aria-label="Douglas-Peucker simplification tolerance (0 to 10 pixels)"
          />
          <span class="value" aria-live="polite">{{ tolerance().toFixed(1) }} px</span>
        </label>
        <p class="hint">
          Path simplification. 0 keeps every vertex (densest, most accurate); higher = smoother
          contour with fewer anchors.
        </p>

        <label class="row">
          <span class="label">Min points</span>
          <input
            class="slider"
            type="range"
            min="3"
            max="20"
            step="1"
            [value]="minPoints()"
            (input)="onMinPoints($event)"
            aria-label="Minimum points per contour (3 to 20)"
          />
          <span class="value" aria-live="polite">{{ minPoints() }}</span>
        </label>
        <p class="hint">
          Contours with fewer points get dropped as noise. Useful to filter speckles from JPEG
          artifacts.
        </p>

        <label class="row checkbox">
          <input type="checkbox" [checked]="hideSource()" (change)="onHideSource($event)" />
          <span class="label">Hide source image after trace</span>
        </label>
        <p class="hint">
          Sets the source image's visibility off so the canvas shows only the new vector group.
          Re-enable via the Layers panel.
        </p>
      </div>

      <!-- Footer actions -->
      <span svgeDialogFooterActions>
        <button mat-button type="button" (click)="cancel()">Cancel</button>
        <button mat-button type="button" color="primary" (click)="apply()">Apply</button>
      </span>
    </svge-dialog-shell>
  `,
  styles: `
    .form {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 4px 0;
    }
    .row {
      display: grid;
      grid-template-columns: 110px 1fr 70px;
      align-items: center;
      gap: 12px;
      padding: 6px 0;
    }
    .row.checkbox {
      grid-template-columns: auto 1fr;
      gap: 8px;
    }
    .label {
      font-size: 13px;
      font-weight: 500;
      color: var(--mat-sys-on-surface, inherit);
    }
    .slider {
      width: 100%;
      accent-color: var(--mat-sys-primary, #1976d2);
    }
    .value {
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.65));
      text-align: right;
    }
    .hint {
      margin: 0 0 8px 0;
      padding-left: 122px;
      font-size: 11px;
      line-height: 1.4;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.55));
    }
    .row.checkbox + .hint {
      padding-left: 24px;
    }
    [svgeDialogFooterActions] {
      display: inline-flex;
      gap: 4px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeTraceImageDialog {
  private readonly ref =
    inject<MatDialogRef<SvgeTraceImageDialog, TraceImageDialogResult | null>>(MatDialogRef);
  // MAT_DIALOG_DATA is injected here so consumers can extend the
  // dialog later (e.g., load + render an image preview thumbnail by
  // reading data.imageNodeId from EditorStateService); for v1 we
  // don't display the image but keep the reference for symmetry with
  // every other dialog in the codebase.
  protected readonly data = inject<TraceImageDialogData>(MAT_DIALOG_DATA);

  protected readonly threshold = signal<number>(128);
  protected readonly tolerance = signal<number>(1);
  protected readonly minPoints = signal<number>(4);
  protected readonly hideSource = signal<boolean>(true);

  protected onThreshold(ev: Event): void {
    this.threshold.set(Number((ev.target as HTMLInputElement).value));
  }
  protected onTolerance(ev: Event): void {
    this.tolerance.set(Number((ev.target as HTMLInputElement).value));
  }
  protected onMinPoints(ev: Event): void {
    this.minPoints.set(Number((ev.target as HTMLInputElement).value));
  }
  protected onHideSource(ev: Event): void {
    this.hideSource.set((ev.target as HTMLInputElement).checked);
  }

  protected apply(): void {
    this.ref.close({
      threshold: this.threshold(),
      tolerance: this.tolerance(),
      minPoints: this.minPoints(),
      hideSource: this.hideSource(),
    });
  }

  protected cancel(): void {
    this.ref.close(null);
  }
}
