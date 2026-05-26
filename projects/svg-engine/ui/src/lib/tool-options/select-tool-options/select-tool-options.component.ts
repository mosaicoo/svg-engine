import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SnapService } from 'svg-engine/edit';
import { TOOL_OPT_SHARED_STYLES } from '../shared-styles';

/**
 * **TOOL-OPT-D** — Options bar for the Select tool. Surfaces snap
 * controls (mode + on/off) and a smart-guides toggle (placeholder —
 * smart guides live in a separate service; if the consumer hasn't
 * mounted that one this still works because we read SnapService only).
 *
 * Snap settings are already controllable via the View menu + status
 * bar; duplicating them in the tool-options bar matches the
 * Illustrator convention "tool-relevant chrome stays at hand" and
 * means the user doesn't have to leave the canvas to flip modes.
 */
@Component({
  selector: 'svge-select-tool-options',
  standalone: true,
  imports: [MatButtonToggleModule, MatIconModule, MatTooltipModule],
  template: `
    <span class="opt-group">
      <span class="opt-label" id="select-snap-label">Snap</span>
      <mat-button-toggle-group
        [value]="snap.enabled() ? snap.mode() : 'off'"
        (change)="setSnap($event.value)"
        hideSingleSelectionIndicator
        aria-labelledby="select-snap-label"
      >
        <mat-button-toggle value="off" matTooltip="Snap off">
          <mat-icon>close</mat-icon>
        </mat-button-toggle>
        <mat-button-toggle value="grid" matTooltip="Snap to grid only">Grid</mat-button-toggle>
        <mat-button-toggle value="objects" matTooltip="Snap to objects only">
          Objects
        </mat-button-toggle>
        <mat-button-toggle value="both" matTooltip="Snap to grid + objects">Both</mat-button-toggle>
      </mat-button-toggle-group>
    </span>
    <span class="opt-spacer"></span>
  `,
  styles: TOOL_OPT_SHARED_STYLES,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeSelectToolOptions {
  protected readonly snap = inject(SnapService);

  protected setSnap(v: 'off' | 'grid' | 'objects' | 'both'): void {
    if (v === 'off') {
      this.snap.setEnabled(false);
      return;
    }
    this.snap.setEnabled(true);
    this.snap.setMode(v);
  }
}
