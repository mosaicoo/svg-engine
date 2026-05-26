import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ShapeToolService } from 'svg-engine/edit';
import { TOOL_OPT_SHARED_STYLES } from '../shared-styles';

/**
 * **TOOL-OPT-B** — Options bar for the Polygon tool. Adds Sides +
 * Star mode (with inner radius slider) on top of the shared
 * fill/stroke controls from {@link ShapeToolService}. When star mode
 * is on, `regularStarPoints` (private to the plugin) generates a
 * pointed star instead of a regular polygon.
 */
@Component({
  selector: 'svge-polygon-options',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatSliderModule, MatTooltipModule],
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
    <span class="opt-divider" aria-hidden="true">│</span>
    <span class="opt-group">
      <span class="opt-label">Sides</span>
      <input
        type="number"
        class="opt-number"
        min="3"
        max="32"
        step="1"
        [value]="shapes.polygonSides()"
        (change)="setSides($event)"
        matTooltip="Polygon sides (3-32)"
        aria-label="Polygon sides"
      />
    </span>
    <span class="opt-divider" aria-hidden="true">│</span>
    <span class="opt-group">
      <button
        type="button"
        class="opt-toggle"
        [class.opt-toggle--active]="shapes.starMode()"
        (click)="shapes.setStarMode(!shapes.starMode())"
        matTooltip="Star mode (alternating outer/inner radius)"
        aria-label="Toggle star mode"
      >
        <mat-icon>star_outline</mat-icon>
      </button>
      @if (shapes.starMode()) {
        <mat-slider min="0.1" max="0.95" step="0.05" discrete class="opt-slider">
          <input
            matSliderThumb
            [value]="shapes.starInnerRadius()"
            (valueChange)="shapes.setStarInnerRadius($event)"
            aria-label="Star inner radius fraction"
          />
        </mat-slider>
      }
    </span>
    <span class="opt-spacer"></span>
    <button
      type="button"
      class="opt-action"
      (click)="reset()"
      matTooltip="Reset to defaults"
      aria-label="Reset polygon options"
    >
      <mat-icon>refresh</mat-icon>
    </button>
  `,
  styles: TOOL_OPT_SHARED_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgePolygonOptions {
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
  protected setSides(e: Event): void {
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v)) this.shapes.setPolygonSides(v);
  }
  protected toggleFillNone(): void {
    this.shapes.setFill(this.shapes.fill() === 'none' ? '#000000' : 'none');
  }
  protected reset(): void {
    this.shapes.setFill('none');
    this.shapes.setStroke('#000000');
    this.shapes.setStrokeWidth(1);
    this.shapes.setPolygonSides(6);
    this.shapes.setStarMode(false);
    this.shapes.setStarInnerRadius(0.5);
  }
}
