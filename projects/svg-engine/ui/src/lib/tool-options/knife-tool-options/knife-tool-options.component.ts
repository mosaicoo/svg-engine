import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { KnifeToolService } from 'svg-engine/edit';
import { TOOL_OPT_SHARED_STYLES } from '../shared-styles';

/**
 * **TOOL-OPT-D** — Options bar for the Knife tool. Surfaces the two
 * snap controls from {@link KnifeToolService}: a toggle for
 * snap-to-nodes + a numeric input for the tolerance (px).
 */
@Component({
  selector: 'svge-knife-tool-options',
  standalone: true,
  imports: [FormsModule, MatIconModule, MatTooltipModule],
  template: `
    <span class="opt-group">
      <button
        type="button"
        class="opt-toggle"
        [class.opt-toggle--active]="knife.snapToNodes()"
        (click)="knife.setSnapToNodes(!knife.snapToNodes())"
        matTooltip="Snap to existing anchors"
        aria-label="Toggle snap to nodes"
      >
        <mat-icon>shape_line</mat-icon>
      </button>
      <span class="opt-label">Snap to nodes</span>
    </span>
    <span class="opt-divider" aria-hidden="true">│</span>
    <span class="opt-group">
      <span class="opt-label">Tolerance</span>
      <input
        type="number"
        class="opt-number"
        min="2"
        max="100"
        step="1"
        [value]="knife.snapTolerance()"
        (change)="setTolerance($event)"
        matTooltip="Snap distance in pixels"
        aria-label="Snap tolerance"
      />
    </span>
    <span class="opt-spacer"></span>
    <button
      type="button"
      class="opt-action"
      (click)="reset()"
      matTooltip="Reset to defaults"
      aria-label="Reset knife options"
    >
      <mat-icon>refresh</mat-icon>
    </button>
  `,
  styles: TOOL_OPT_SHARED_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeKnifeToolOptions {
  protected readonly knife = inject(KnifeToolService);

  protected setTolerance(e: Event): void {
    const v = Number((e.target as HTMLInputElement).value);
    if (Number.isFinite(v)) this.knife.setSnapTolerance(v);
  }
  protected reset(): void {
    this.knife.setSnapToNodes(true);
    this.knife.setSnapTolerance(12);
  }
}
