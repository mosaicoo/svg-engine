import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { SvgeDialogShell } from '../dialog-shell';

/** Which transform operation the dialog collects parameters for. */
export type TransformDialogMode = 'rotate' | 'scale' | 'skew';

/**
 * Data injected via `MAT_DIALOG_DATA`. The caller (menu handler) already
 * resolved the selection + computed the shared pivot; the dialog only
 * collects the numeric parameters, keeping it decoupled from the document.
 */
export interface TransformDialogData {
  readonly mode: TransformDialogMode;
}

/**
 * Result returned on Apply — a discriminated union keyed by `mode`.
 * `null` from `afterClosed()` means the user cancelled (or entered a
 * degenerate value like scale 0), and the caller must not apply anything.
 *
 * - **rotate** → `angleDeg` (degrees, may be negative).
 * - **scale**  → `sx` / `sy` factors (1 = 100%). Uniform mode sets both
 *   from the horizontal field.
 * - **skew**   → `skewXDeg` / `skewYDeg` (degrees, may be negative).
 */
export type TransformDialogResult =
  | { readonly mode: 'rotate'; readonly angleDeg: number }
  | { readonly mode: 'scale'; readonly sx: number; readonly sy: number }
  | { readonly mode: 'skew'; readonly skewXDeg: number; readonly skewYDeg: number };

interface ModeChrome {
  readonly icon: string;
  readonly title: string;
  readonly subtitle: string;
}

const CHROME: Record<TransformDialogMode, ModeChrome> = {
  rotate: {
    icon: 'rotate_right',
    title: 'Rotate',
    subtitle: 'Rotate the selection around its centre',
  },
  scale: {
    icon: 'photo_size_select_large',
    title: 'Scale',
    subtitle: 'Scale the selection around its centre',
  },
  skew: {
    icon: 'transform',
    title: 'Skew',
    subtitle: 'Skew (shear) the selection around its centre',
  },
};

/**
 * **D-093** — Object ▸ Transform parameter dialog (Rotate / Scale / Skew).
 *
 * Illustrator-style "enter the exact amount" dialog backing the three
 * Transform submenu entries that need a value (Flip needs none; Reset is a
 * one-shot). One component, parametrized by `data.mode`, so the three
 * transforms share chrome + footer + sizing and read as a family.
 *
 * **Pure-UI** (mirrors `SvgeTraceImageDialog`): collects parameters and
 * returns them; the menu handler does the geometry (combined-bbox pivot +
 * per-node parent matrices) and dispatches the matching batch command
 * (`RotateNodesCommand` / `ResizeNodesCommand` / `SkewNodesCommand`).
 *
 * **No live preview** in v1 — same trade as the Trace Image dialog;
 * Apply + undo is the iteration loop. Lives in `svg-engine/ui` (Material,
 * D-017 boundary).
 */
@Component({
  selector: 'svge-transform-dialog',
  standalone: true,
  imports: [SvgeDialogShell, MatButton],
  template: `
    <svge-dialog-shell
      [icon]="chrome().icon"
      [title]="chrome().title"
      [subtitle]="chrome().subtitle"
    >
      <div class="form" role="group" [attr.aria-label]="chrome().title + ' options'">
        @if (data.mode === 'rotate') {
          <label class="row">
            <span class="label">Angle</span>
            <input
              class="num"
              type="number"
              step="1"
              [value]="angle()"
              (input)="onNum($event, angle)"
              aria-label="Rotation angle in degrees"
            />
            <span class="unit">°</span>
          </label>
          <p class="hint">Positive angles rotate clockwise. Negative rotate counter-clockwise.</p>
        }

        @if (data.mode === 'scale') {
          <label class="row checkbox">
            <input type="checkbox" [checked]="uniform()" (change)="onUniform($event)" />
            <span class="label">Uniform (keep proportions)</span>
          </label>
          <label class="row">
            <span class="label">{{ uniform() ? 'Scale' : 'Horizontal' }}</span>
            <input
              class="num"
              type="number"
              step="1"
              [value]="scaleX()"
              (input)="onScaleX($event)"
              aria-label="Horizontal scale percentage"
            />
            <span class="unit">%</span>
          </label>
          <label class="row" [class.disabled]="uniform()">
            <span class="label">Vertical</span>
            <input
              class="num"
              type="number"
              step="1"
              [disabled]="uniform()"
              [value]="uniform() ? scaleX() : scaleY()"
              (input)="onNum($event, scaleY)"
              aria-label="Vertical scale percentage"
            />
            <span class="unit">%</span>
          </label>
          <p class="hint">
            100% keeps the current size. Values below 100% shrink; above 100% grow.
          </p>
        }

        @if (data.mode === 'skew') {
          <label class="row">
            <span class="label">Horizontal</span>
            <input
              class="num"
              type="number"
              step="1"
              [value]="skewXDeg()"
              (input)="onNum($event, skewXDeg)"
              aria-label="Horizontal skew angle in degrees"
            />
            <span class="unit">°</span>
          </label>
          <label class="row">
            <span class="label">Vertical</span>
            <input
              class="num"
              type="number"
              step="1"
              [value]="skewYDeg()"
              (input)="onNum($event, skewYDeg)"
              aria-label="Vertical skew angle in degrees"
            />
            <span class="unit">°</span>
          </label>
          <p class="hint">
            Shears the selection. Angles approaching ±90° are clamped to avoid collapse.
          </p>
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
    .row.checkbox {
      grid-template-columns: auto 1fr;
      gap: 8px;
    }
    .row.disabled .label {
      opacity: 0.55;
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
export class SvgeTransformDialog {
  private readonly ref =
    inject<MatDialogRef<SvgeTransformDialog, TransformDialogResult | null>>(MatDialogRef);
  protected readonly data = inject<TransformDialogData>(MAT_DIALOG_DATA);

  protected readonly chrome = computed<ModeChrome>(() => CHROME[this.data.mode]);

  // Rotate
  protected readonly angle = signal<number>(0);
  // Scale (percentages; 100 = unchanged)
  protected readonly uniform = signal<boolean>(true);
  protected readonly scaleX = signal<number>(100);
  protected readonly scaleY = signal<number>(100);
  // Skew (degrees)
  protected readonly skewXDeg = signal<number>(0);
  protected readonly skewYDeg = signal<number>(0);

  /** Parse a number input, ignoring invalid intermediate states (keeps last valid). */
  protected onNum(ev: Event, target: { set(v: number): void }): void {
    const v = Number((ev.target as HTMLInputElement).value);
    if (Number.isFinite(v)) target.set(v);
  }

  protected onScaleX(ev: Event): void {
    const v = Number((ev.target as HTMLInputElement).value);
    if (!Number.isFinite(v)) return;
    this.scaleX.set(v);
    if (this.uniform()) this.scaleY.set(v);
  }

  protected onUniform(ev: Event): void {
    const on = (ev.target as HTMLInputElement).checked;
    this.uniform.set(on);
    if (on) this.scaleY.set(this.scaleX()); // re-link
  }

  protected apply(): void {
    switch (this.data.mode) {
      case 'rotate':
        this.ref.close({ mode: 'rotate', angleDeg: this.angle() });
        return;
      case 'scale': {
        const sx = this.scaleX() / 100;
        const sy = (this.uniform() ? this.scaleX() : this.scaleY()) / 100;
        // Refuse a collapse-to-zero scale (would make the shape vanish).
        if (sx === 0 || sy === 0) {
          this.ref.close(null);
          return;
        }
        this.ref.close({ mode: 'scale', sx, sy });
        return;
      }
      case 'skew':
        this.ref.close({ mode: 'skew', skewXDeg: this.skewXDeg(), skewYDeg: this.skewYDeg() });
        return;
    }
  }

  protected cancel(): void {
    this.ref.close(null);
  }
}
