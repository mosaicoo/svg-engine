import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ShapeToolService } from 'svg-engine/edit';
import { TOOL_OPT_SHARED_STYLES } from '../shared-styles';

/**
 * **TOOL-OPT-B** — Options bar for the Ellipse tool. Same fill/stroke
 * controls as Rectangle (shared {@link ShapeToolService}); no
 * cornerRadius (doesn't apply to ellipses).
 */
@Component({
  selector: 'svge-ellipse-options',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  template: `
    <span class="opt-group">
      <span class="opt-label">Fill</span>
      <label class="opt-color" [style.background]="shapes.fill()" matTooltip="Fill color">
        <input
          type="color"
          [value]="shapes.fill() === 'none' ? '#000000' : shapes.fill()"
          (change)="setFill($event)"
        />
      </label>
      <button
        type="button"
        class="opt-toggle"
        [class.opt-toggle--active]="shapes.fill() === 'none'"
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
      <label class="opt-color" [style.background]="shapes.stroke()" matTooltip="Stroke color">
        <input type="color" [value]="shapes.stroke()" (change)="setStroke($event)" />
      </label>
      <input
        type="number"
        class="opt-number"
        min="0"
        max="200"
        step="1"
        [value]="shapes.strokeWidth()"
        (change)="setStrokeWidth($event)"
        matTooltip="Stroke width (px)"
        aria-label="Stroke width"
      />
    </span>
    <span class="opt-spacer"></span>
    <button
      type="button"
      class="opt-action"
      (click)="reset()"
      matTooltip="Reset to defaults"
      aria-label="Reset ellipse options"
    >
      <mat-icon>refresh</mat-icon>
    </button>
  `,
  styles: TOOL_OPT_SHARED_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeEllipseOptions {
  protected readonly shapes = inject(ShapeToolService);

  protected setFill(e: Event): void {
    this.shapes.setFill((e.target as HTMLInputElement).value);
  }
  protected setStroke(e: Event): void {
    this.shapes.setStroke((e.target as HTMLInputElement).value);
  }
  protected setStrokeWidth(e: Event): void {
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v)) this.shapes.setStrokeWidth(v);
  }
  protected toggleFillNone(): void {
    this.shapes.setFill(this.shapes.fill() === 'none' ? '#000000' : 'none');
  }
  protected reset(): void {
    this.shapes.setFill('none');
    this.shapes.setStroke('#000000');
    this.shapes.setStrokeWidth(1);
  }
}
