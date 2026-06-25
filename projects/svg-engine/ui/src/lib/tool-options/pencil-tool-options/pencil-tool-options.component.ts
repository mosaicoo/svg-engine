import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PencilToolService } from '@mosaicoo/svg-engine/edit';
import { TOOL_OPT_SHARED_STYLES } from '../shared-styles';

/**
 * **TOOL-OPT-B** — Options bar for the Pencil tool. Fill/stroke/
 * strokeWidth + closePath toggle from {@link PencilToolService}.
 * Defaults match the prior hardcoded look (no fill, black 2px
 * stroke, open path).
 */
@Component({
  selector: 'svge-pencil-tool-options',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  template: `
    <span class="opt-group">
      <span class="opt-label">Fill</span>
      <label class="opt-color" [style.background]="pencil.fill()" matTooltip="Fill color">
        <input
          type="color"
          [value]="pencil.fill() === 'none' ? '#000000' : pencil.fill()"
          (change)="setFill($event)"
        />
      </label>
      <button
        type="button"
        class="opt-toggle"
        [class.opt-toggle--active]="pencil.fill() === 'none'"
        (click)="toggleFillNone()"
        matTooltip="No fill"
        aria-label="Toggle no-fill"
      >
        <mat-icon>block</mat-icon>
      </button>
    </span>
    <span class="opt-divider" aria-hidden="true">│</span>
    <span class="opt-group">
      <span class="opt-label">Stroke</span>
      <label class="opt-color" [style.background]="pencil.stroke()" matTooltip="Stroke color">
        <input type="color" [value]="pencil.stroke()" (change)="setStroke($event)" />
      </label>
      <input
        type="number"
        class="opt-number"
        min="0.5"
        max="100"
        step="0.5"
        [value]="pencil.strokeWidth()"
        (change)="setStrokeWidth($event)"
        matTooltip="Stroke width (px)"
        aria-label="Stroke width"
      />
    </span>
    <span class="opt-divider" aria-hidden="true">│</span>
    <span class="opt-group">
      <button
        type="button"
        class="opt-toggle"
        [class.opt-toggle--active]="pencil.closePath()"
        (click)="pencil.setClosePath(!pencil.closePath())"
        matTooltip="Close the stroke into a loop (adds Z to the path)"
        aria-label="Toggle close path"
      >
        <mat-icon>radio_button_unchecked</mat-icon>
      </button>
    </span>
    <span class="opt-spacer"></span>
    <button
      type="button"
      class="opt-action"
      (click)="reset()"
      matTooltip="Reset to defaults"
      aria-label="Reset pencil options"
    >
      <mat-icon>refresh</mat-icon>
    </button>
  `,
  styles: TOOL_OPT_SHARED_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgePencilToolOptions {
  protected readonly pencil = inject(PencilToolService);

  protected setFill(e: Event): void {
    this.pencil.setFill((e.target as HTMLInputElement).value);
  }
  protected setStroke(e: Event): void {
    this.pencil.setStroke((e.target as HTMLInputElement).value);
  }
  protected setStrokeWidth(e: Event): void {
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v)) this.pencil.setStrokeWidth(v);
  }
  protected toggleFillNone(): void {
    this.pencil.setFill(this.pencil.fill() === 'none' ? '#000000' : 'none');
  }
  protected reset(): void {
    this.pencil.setFill('none');
    this.pencil.setStroke('#000000');
    this.pencil.setStrokeWidth(2);
    this.pencil.setClosePath(false);
  }
}
