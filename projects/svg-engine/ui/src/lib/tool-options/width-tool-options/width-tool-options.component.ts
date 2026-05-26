import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { type WidthProfilePreset, WidthToolService } from 'svg-engine/edit';

/**
 * **TOOL-OPT-A3** — Options bar for the Width tool
 * (`com.svge.tool.width`). Built on top of {@link WidthToolService}
 * which already exposes `preset` + `baseWidth` signals — this
 * component is the visual front-end, no new state.
 *
 * Layout follows the TOOL-OPT pattern (see {@link
 * SvgeSymbolSprayerOptions}): left-to-right groups separated by
 * dividers; segmented for the preset enum, chips for the common
 * base widths, slider for arbitrary values, action button for reset.
 *
 * **Profile presets**: Uniform (constant width), Tapered (thick in
 * the middle), Calligraphic (thin at the start, thick at the end —
 * matches a calligraphy nib). The resolved curve is fetched on
 * stroke-end via `resolveProfile()` and baked into the path's
 * `widthProfile`.
 */
@Component({
  selector: 'svge-width-tool-options',
  standalone: true,
  imports: [FormsModule, MatButtonToggleModule, MatIconModule, MatSliderModule, MatTooltipModule],
  template: `
    <!-- Group 1: profile preset -->
    <span class="opt-group">
      <span class="opt-label" id="width-profile-label">Profile</span>
      <mat-button-toggle-group
        [value]="width.preset()"
        (change)="setPreset($event.value)"
        hideSingleSelectionIndicator
        aria-labelledby="width-profile-label"
        class="profile-group"
      >
        <mat-button-toggle value="uniform" matTooltip="Uniform width along the stroke">
          <mat-icon>remove</mat-icon>
        </mat-button-toggle>
        <mat-button-toggle value="tapered" matTooltip="Tapered — thick in the middle">
          <mat-icon>filter_tilt_shift</mat-icon>
        </mat-button-toggle>
        <mat-button-toggle value="calligraphic" matTooltip="Calligraphic — thin to thick">
          <mat-icon>edit</mat-icon>
        </mat-button-toggle>
      </mat-button-toggle-group>
    </span>

    <span class="opt-divider" aria-hidden="true">│</span>

    <!-- Group 2: base width chips + slider -->
    <span class="opt-group">
      <span class="opt-label" id="width-base-label">Width</span>
      <span class="chip-row" role="group" aria-labelledby="width-base-label">
        @for (preset of WIDTH_PRESETS; track preset) {
          <button
            type="button"
            class="chip"
            [class.chip--active]="width.baseWidth() === preset"
            (click)="width.setBaseWidth(preset)"
            [matTooltip]="'Set base width to ' + preset + 'px'"
          >
            {{ preset }}
          </button>
        }
      </span>
      <mat-slider min="1" max="100" step="1" discrete class="opt-slider">
        <input
          matSliderThumb
          [value]="width.baseWidth()"
          (valueChange)="width.setBaseWidth($event)"
          aria-label="Base width in pixels"
        />
      </mat-slider>
    </span>

    <span class="opt-spacer"></span>

    <!-- Reset -->
    <button
      type="button"
      class="opt-action"
      (click)="reset()"
      matTooltip="Reset to defaults"
      aria-label="Reset width tool options"
    >
      <mat-icon>refresh</mat-icon>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1 1 auto;
      min-width: 0;
    }
    .opt-group {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      flex: 0 0 auto;
    }
    .opt-label {
      font-size: 11px;
      font-weight: 500;
      opacity: 0.75;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .opt-divider {
      opacity: 0.3;
      font-weight: 200;
    }
    .opt-spacer {
      flex: 1 1 auto;
    }
    .profile-group {
      /* Compact segmented — keep within the 32px bar height */
      height: 28px;
      font-size: 11px;
    }
    .profile-group ::ng-deep .mat-button-toggle-label-content {
      padding: 0 8px;
      line-height: 26px !important;
      display: inline-flex;
      align-items: center;
    }
    .profile-group ::ng-deep mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .chip-row {
      display: inline-flex;
      gap: 2px;
    }
    .chip {
      min-width: 28px;
      padding: 2px 6px;
      font-size: 11px;
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.18));
      background: transparent;
      color: inherit;
      border-radius: 4px;
      cursor: pointer;
      transition:
        background 120ms ease,
        border-color 120ms ease;
    }
    .chip:hover {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
    }
    .chip--active {
      background: var(--mat-sys-primary, #1976d2);
      color: var(--mat-sys-on-primary, #fff);
      border-color: var(--mat-sys-primary, #1976d2);
    }
    .opt-slider {
      width: 96px;
      flex: 0 0 auto;
    }
    .opt-action {
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      border-radius: 4px;
      opacity: 0.7;
    }
    .opt-action:hover {
      background: var(--mat-sys-surface-container, rgba(0, 0, 0, 0.04));
      opacity: 1;
    }
    .opt-action mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeWidthToolOptions {
  protected readonly width = inject(WidthToolService);

  /**
   * Common base widths — pixel-art (1), thin (5), medium (12), thick
   * (25), bold (50). Slider handles any in-between value.
   */
  protected readonly WIDTH_PRESETS = [1, 5, 12, 25, 50] as const;

  protected setPreset(value: WidthProfilePreset): void {
    this.width.setPreset(value);
  }

  /**
   * Reset to defaults that match {@link WidthToolService} init:
   * preset = 'tapered', baseWidth = 12. Mirrors the service defaults
   * so the user gets a predictable "fresh state".
   */
  protected reset(): void {
    this.width.setPreset('tapered');
    this.width.setBaseWidth(12);
  }
}
