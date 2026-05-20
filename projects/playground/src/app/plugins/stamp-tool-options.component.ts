import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { StampToolService } from './stamp-tool.service';

/**
 * Options bar for the **Stamp Tool** (D-038 Phase 3 showcase).
 *
 * Two button-toggle groups bound to {@link StampToolService} signals:
 * radius (5 / 10 / 20 / 50 doc units) and color (red / blue / green).
 *
 * **Wired into `<svge-tool-options>`** via `Tool.optionsComponent` —
 * the bar re-mounts this component whenever the Stamp Tool activates.
 * Standalone Angular component, no special lifecycle required.
 */
@Component({
  selector: 'app-stamp-tool-options',
  standalone: true,
  imports: [FormsModule, MatButtonToggle, MatButtonToggleGroup],
  template: `
    <span class="group">
      <span class="lbl">Radius</span>
      <mat-button-toggle-group
        name="radius"
        [(ngModel)]="radius"
        (ngModelChange)="state.setRadius($event)"
        aria-label="Stamp radius"
        hideSingleSelectionIndicator
      >
        <mat-button-toggle [value]="5">5</mat-button-toggle>
        <mat-button-toggle [value]="10">10</mat-button-toggle>
        <mat-button-toggle [value]="20">20</mat-button-toggle>
        <mat-button-toggle [value]="50">50</mat-button-toggle>
      </mat-button-toggle-group>
    </span>
    <span class="group">
      <span class="lbl">Color</span>
      <mat-button-toggle-group
        name="color"
        [(ngModel)]="color"
        (ngModelChange)="state.setColor($event)"
        aria-label="Stamp fill color"
        hideSingleSelectionIndicator
      >
        <mat-button-toggle value="red">
          <span class="swatch" style="background: #e53935"></span>
        </mat-button-toggle>
        <mat-button-toggle value="blue">
          <span class="swatch" style="background: #1e88e5"></span>
        </mat-button-toggle>
        <mat-button-toggle value="green">
          <span class="swatch" style="background: #43a047"></span>
        </mat-button-toggle>
      </mat-button-toggle-group>
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 1rem;
    }
    .group {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
    .lbl {
      font-size: 11px;
      opacity: 0.7;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .swatch {
      display: inline-block;
      width: 14px;
      height: 14px;
      border-radius: 2px;
      border: 1px solid rgba(0, 0, 0, 0.18);
    }
    /* Compact the Material button-toggle for tool-options bar. */
    mat-button-toggle-group {
      height: 26px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StampToolOptionsComponent {
  protected readonly state = inject(StampToolService);
  protected radius = this.state.radius();
  protected color = this.state.color();
}
