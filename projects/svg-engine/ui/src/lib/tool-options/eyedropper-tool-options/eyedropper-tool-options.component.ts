import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { EyedropperToolService } from '@mosaicoo/svg-engine/edit';
import { TOOL_OPT_SHARED_STYLES } from '../shared-styles';

/**
 * **TOOL-OPT-C** — Options bar for the Eyedropper tool. Exposes the
 * `sampleTarget` (Fill / Stroke / Both) preference and the `autoApply`
 * toggle from {@link EyedropperToolService}. The Alt modifier at click
 * time still flips fill↔stroke as a per-click override.
 */
@Component({
  selector: 'svge-eyedropper-tool-options',
  standalone: true,
  imports: [MatButtonToggleModule, MatIconModule, MatTooltipModule],
  template: `
    <span class="opt-group">
      <span class="opt-label" id="eyedropper-target-label">Target</span>
      <mat-button-toggle-group
        [value]="eye.sampleTarget()"
        (change)="eye.setSampleTarget($event.value)"
        hideSingleSelectionIndicator
        aria-labelledby="eyedropper-target-label"
      >
        <mat-button-toggle value="fill" matTooltip="Sample fill only">Fill</mat-button-toggle>
        <mat-button-toggle value="stroke" matTooltip="Sample stroke only">Stroke</mat-button-toggle>
        <mat-button-toggle value="both" matTooltip="Sample fill + stroke (match style)">
          Both
        </mat-button-toggle>
      </mat-button-toggle-group>
    </span>
    <span class="opt-divider" aria-hidden="true">│</span>
    <span class="opt-group">
      <button
        type="button"
        class="opt-toggle"
        [class.opt-toggle--active]="eye.autoApply()"
        (click)="eye.setAutoApply(!eye.autoApply())"
        matTooltip="Auto-apply to current selection (off = sample only, log to console)"
        aria-label="Toggle auto apply"
      >
        <mat-icon>auto_fix_normal</mat-icon>
      </button>
    </span>
    <span class="opt-spacer"></span>
    <button
      type="button"
      class="opt-action"
      (click)="reset()"
      matTooltip="Reset to defaults"
      aria-label="Reset eyedropper options"
    >
      <mat-icon>refresh</mat-icon>
    </button>
  `,
  styles: TOOL_OPT_SHARED_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeEyedropperToolOptions {
  protected readonly eye = inject(EyedropperToolService);

  protected reset(): void {
    this.eye.setSampleTarget('fill');
    this.eye.setAutoApply(true);
  }
}
