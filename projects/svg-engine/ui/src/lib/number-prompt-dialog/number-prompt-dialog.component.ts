import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SvgeDialogShell } from '../dialog-shell';

/**
 * Configuration for a one-field numeric prompt. The caller supplies all
 * chrome + bounds so the same component serves any "enter a single number"
 * action (Offset distance, Simplify tolerance, …).
 */
export interface NumberPromptDialogData {
  readonly icon: string;
  readonly title: string;
  readonly subtitle?: string;
  /** Field label (e.g. "Distance"). */
  readonly label: string;
  /** Unit shown after the input (e.g. "px"). Optional. */
  readonly unit?: string;
  /** Initial value. */
  readonly value: number;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  /** Helper text under the field. Optional. */
  readonly hint?: string;
}

/**
 * **D-093** — generic single-number prompt dialog.
 *
 * Backs menu actions whose command takes one numeric parameter but were
 * previously wired with a hardcoded default (no dialog): Path ▸ Offset
 * Path (distance) and Path ▸ Simplify (tolerance). Pure-UI (collects the
 * value, returns it; the caller dispatches the command) and reusable for
 * any future single-number action. `afterClosed()` yields the entered
 * `number`, or `null` when cancelled.
 *
 * Lives in `svg-engine/ui` (Material, D-017 boundary).
 */
@Component({
  selector: 'svge-number-prompt-dialog',
  standalone: true,
  imports: [SvgeDialogShell, MatButton],
  template: `
    <svge-dialog-shell [icon]="data.icon" [title]="data.title" [subtitle]="data.subtitle ?? ''">
      <div class="form" role="group" [attr.aria-label]="data.title + ' options'">
        <label class="row">
          <span class="label">{{ data.label }}</span>
          <input
            class="num"
            type="number"
            [attr.min]="data.min ?? null"
            [attr.max]="data.max ?? null"
            [attr.step]="data.step ?? 1"
            [value]="value()"
            (input)="onNum($event)"
            (keydown.enter)="apply()"
            [attr.aria-label]="data.label"
          />
          @if (data.unit) {
            <span class="unit">{{ data.unit }}</span>
          }
        </label>
        @if (data.hint) {
          <p class="hint">{{ data.hint }}</p>
        }
      </div>

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
      gap: 4px;
      padding: 4px 0;
    }
    .row {
      display: grid;
      grid-template-columns: 110px 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 6px 0;
    }
    .label {
      font-size: 13px;
      font-weight: 500;
      color: var(--mat-sys-on-surface, inherit);
    }
    .num {
      width: 100%;
      box-sizing: border-box;
      padding: 6px 8px;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.2));
      border-radius: 6px;
      background: var(--mat-sys-surface, #fff);
      color: var(--mat-sys-on-surface, inherit);
    }
    .num:focus {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: -1px;
    }
    .unit {
      font-size: 13px;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.65));
      min-width: 14px;
    }
    .hint {
      margin: 4px 0 0 0;
      font-size: 11px;
      line-height: 1.4;
      color: var(--mat-sys-on-surface-variant, rgba(0, 0, 0, 0.55));
    }
    [svgeDialogFooterActions] {
      display: inline-flex;
      gap: 4px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeNumberPromptDialog {
  private readonly ref = inject<MatDialogRef<SvgeNumberPromptDialog, number | null>>(MatDialogRef);
  protected readonly data = inject<NumberPromptDialogData>(MAT_DIALOG_DATA);

  protected readonly value = signal<number>(this.data.value);

  protected onNum(ev: Event): void {
    const v = Number((ev.target as HTMLInputElement).value);
    if (Number.isFinite(v)) this.value.set(v);
  }

  protected apply(): void {
    this.ref.close(this.value());
  }

  protected cancel(): void {
    this.ref.close(null);
  }
}
