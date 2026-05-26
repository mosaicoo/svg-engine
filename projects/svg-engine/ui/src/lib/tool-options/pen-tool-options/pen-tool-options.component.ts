import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PenToolService } from 'svg-engine/edit';
import { TOOL_OPT_SHARED_STYLES } from '../shared-styles';

/**
 * **TOOL-OPT-B** — Options bar for the Pen tool. Fill/stroke/
 * strokeWidth + rubberBand preview toggle from {@link PenToolService}.
 */
@Component({
  selector: 'svge-pen-tool-options',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  template: `
    <span class="opt-group">
      <span class="opt-label">Fill</span>
      <label class="opt-color" [style.background]="pen.fill()" matTooltip="Fill color">
        <input
          type="color"
          [value]="pen.fill() === 'none' ? '#000000' : pen.fill()"
          (change)="setFill($event)"
        />
      </label>
      <button
        type="button"
        class="opt-toggle"
        [class.opt-toggle--active]="pen.fill() === 'none'"
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
      <label class="opt-color" [style.background]="pen.stroke()" matTooltip="Stroke color">
        <input type="color" [value]="pen.stroke()" (change)="setStroke($event)" />
      </label>
      <input
        type="number"
        class="opt-number"
        min="0.5"
        max="100"
        step="0.5"
        [value]="pen.strokeWidth()"
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
        [class.opt-toggle--active]="pen.rubberBand()"
        (click)="pen.setRubberBand(!pen.rubberBand())"
        matTooltip="Rubber-band preview while drawing"
        aria-label="Toggle rubber band"
      >
        <mat-icon>timeline</mat-icon>
      </button>
    </span>
    <span class="opt-spacer"></span>
    <button
      type="button"
      class="opt-action"
      (click)="reset()"
      matTooltip="Reset to defaults"
      aria-label="Reset pen options"
    >
      <mat-icon>refresh</mat-icon>
    </button>
  `,
  styles: TOOL_OPT_SHARED_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgePenToolOptions {
  protected readonly pen = inject(PenToolService);

  protected setFill(e: Event): void {
    this.pen.setFill((e.target as HTMLInputElement).value);
  }
  protected setStroke(e: Event): void {
    this.pen.setStroke((e.target as HTMLInputElement).value);
  }
  protected setStrokeWidth(e: Event): void {
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v)) this.pen.setStrokeWidth(v);
  }
  protected toggleFillNone(): void {
    this.pen.setFill(this.pen.fill() === 'none' ? '#000000' : 'none');
  }
  protected reset(): void {
    this.pen.setFill('none');
    this.pen.setStroke('#000000');
    this.pen.setStrokeWidth(1);
    this.pen.setRubberBand(true);
  }
}
