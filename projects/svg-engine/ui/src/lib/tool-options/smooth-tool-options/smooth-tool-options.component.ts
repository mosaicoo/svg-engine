import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SmoothToolService } from 'svg-engine/edit';
import { TOOL_OPT_SHARED_STYLES } from '../shared-styles';

/**
 * **TOOL-OPT-D** — Options bar for the Smooth tool. Exposes the RDP
 * tolerance from {@link SmoothToolService}. Higher = more aggressive
 * simplification, fewer anchors retained.
 */
@Component({
  selector: 'svge-smooth-tool-options',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatSliderModule, MatTooltipModule],
  template: `
    <span class="opt-group">
      <span class="opt-label">Tolerance</span>
      <input
        type="number"
        class="opt-number"
        min="0.1"
        max="20"
        step="0.1"
        [value]="smooth.tolerance()"
        (change)="setTolerance($event)"
        matTooltip="RDP epsilon (doc units) — higher = more simplification"
        aria-label="Smoothing tolerance"
      />
      <mat-slider min="0.1" max="10" step="0.1" discrete class="opt-slider">
        <input
          matSliderThumb
          [value]="smooth.tolerance()"
          (valueChange)="smooth.setTolerance($event)"
          aria-label="Tolerance slider"
        />
      </mat-slider>
    </span>
    <span class="opt-spacer"></span>
    <button
      type="button"
      class="opt-action"
      (click)="reset()"
      matTooltip="Reset to defaults"
      aria-label="Reset smooth options"
    >
      <mat-icon>refresh</mat-icon>
    </button>
  `,
  styles: TOOL_OPT_SHARED_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeSmoothToolOptions {
  protected readonly smooth = inject(SmoothToolService);

  protected setTolerance(e: Event): void {
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v)) this.smooth.setTolerance(v);
  }
  protected reset(): void {
    this.smooth.setTolerance(1.5);
  }
}
