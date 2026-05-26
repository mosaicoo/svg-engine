import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  SymbolLibraryService,
  SymbolSelectionService,
  SymbolSprayerService,
} from 'svg-engine/edit';

/**
 * **TOOL-OPT-A2** — Options bar for the Symbol Sprayer tool
 * (`com.svge.tool.symbol-sprayer`). Aka "Stamp" in the playground demo.
 *
 * Pattern: Illustrator's Control Bar layout — left-to-right groups of
 * compact controls separated by visual dividers. Reads/writes its
 * state directly against the headless services:
 *
 * - {@link SymbolSelectionService}: which symbol master to spray.
 * - {@link SymbolSprayerService}: spacing, base size, scale jitter.
 * - {@link SymbolLibraryService}: catalog of registered symbols
 *   (populated by `builtinSymbolsPlugin` + any user plugins).
 *
 * **Why a dedicated component instead of cramming controls into the
 * Inspector**: the Sprayer is a tool — its options apply to the
 * NEXT spray gesture, not to any selected node. Putting them in the
 * Inspector would mislead the user into thinking they're editing the
 * currently-selected object. Tool-options bar is the right home, and
 * the controls disappear automatically when the user switches tools.
 *
 * **Compact controls**: tooltips carry the long form labels so the
 * bar stays narrow; sliders use `discrete` with step + showTickMarks
 * disabled to feel snappy without grids.
 */
@Component({
  selector: 'svge-symbol-sprayer-options',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSliderModule,
    MatTooltipModule,
  ],
  template: `
    <!-- Group 1: active symbol -->
    <span class="opt-group">
      <span class="opt-label">Symbol</span>
      @if (symbolItems().length > 0) {
        <mat-form-field appearance="outline" subscriptSizing="dynamic" class="symbol-select">
          <mat-select
            [value]="activeSymbolId()"
            (selectionChange)="setActiveSymbol($event.value)"
            placeholder="None"
          >
            <mat-option [value]="null">None</mat-option>
            @for (item of symbolItems(); track item.id) {
              <mat-option [value]="item.id">{{ item.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      } @else {
        <span class="empty-hint">No symbols registered</span>
      }
    </span>

    <span class="opt-divider" aria-hidden="true">│</span>

    <!-- Group 2: size -->
    <span class="opt-group">
      <span class="opt-label" id="sprayer-size-label">Size</span>
      <span class="chip-row" role="group" aria-labelledby="sprayer-size-label">
        @for (preset of SIZE_PRESETS; track preset) {
          <button
            type="button"
            class="chip"
            [class.chip--active]="sprayer.baseSize() === preset"
            (click)="sprayer.setBaseSize(preset)"
            [matTooltip]="'Set base size to ' + preset + 'px'"
          >
            {{ preset }}
          </button>
        }
      </span>
      <mat-slider min="4" max="200" step="2" discrete class="opt-slider">
        <input
          matSliderThumb
          [value]="sprayer.baseSize()"
          (valueChange)="sprayer.setBaseSize($event)"
          aria-label="Base size"
        />
      </mat-slider>
    </span>

    <span class="opt-divider" aria-hidden="true">│</span>

    <!-- Group 3: spacing -->
    <span class="opt-group">
      <span class="opt-label">Spacing</span>
      <mat-slider min="2" max="200" step="2" discrete class="opt-slider">
        <input
          matSliderThumb
          [value]="sprayer.spacing()"
          (valueChange)="sprayer.setSpacing($event)"
          aria-label="Spacing in pixels"
        />
      </mat-slider>
    </span>

    <span class="opt-divider" aria-hidden="true">│</span>

    <!-- Group 4: scale jitter -->
    <span class="opt-group">
      <span class="opt-label" matTooltip="Random ± scale variation per drop">Jitter</span>
      <mat-slider
        min="0"
        max="1"
        step="0.05"
        discrete
        class="opt-slider"
        [displayWith]="formatJitter"
      >
        <input
          matSliderThumb
          [value]="sprayer.scaleJitter()"
          (valueChange)="sprayer.setScaleJitter($event)"
          aria-label="Scale jitter"
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
      aria-label="Reset sprayer options"
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
    .symbol-select {
      min-width: 140px;
      max-width: 200px;
      font-size: 12px;
    }
    /* Compact form-field so it fits in the 32px tool bar */
    .symbol-select ::ng-deep .mat-mdc-form-field-infix {
      min-height: 28px;
      padding-top: 4px !important;
      padding-bottom: 4px !important;
    }
    .symbol-select ::ng-deep .mat-mdc-form-field-flex {
      min-height: 28px;
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
    .empty-hint {
      font-size: 11px;
      opacity: 0.55;
      font-style: italic;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeSymbolSprayerOptions {
  protected readonly sprayer = inject(SymbolSprayerService);
  protected readonly selection = inject(SymbolSelectionService);
  protected readonly catalog = inject(SymbolLibraryService);

  /**
   * Reactive list of symbol items from the catalog. Filters to items
   * with a non-empty name so the dropdown is usable; unnamed entries
   * (rare; usually authored by a plugin without `name`) fall back to
   * showing their id.
   */
  protected readonly symbolItems = computed(() => this.catalog.items());

  protected readonly activeSymbolId = computed(() => this.selection.selectedSymbolId());

  /**
   * Chip presets for base size — common typographic sizes that also
   * map well to icon sprays. Slider handles arbitrary values.
   */
  protected readonly SIZE_PRESETS = [24, 48, 96] as const;

  /** Display "0.25" as "25%" in the slider thumb tooltip. */
  protected readonly formatJitter = (value: number): string => `${Math.round(value * 100)}%`;

  protected setActiveSymbol(id: string | null): void {
    this.selection.select(id);
  }

  /**
   * Reset all controls to their defaults — base size 48, spacing 40,
   * jitter 0.25 (matches {@link SymbolSprayerService} initial values).
   * Active symbol selection is preserved (resetting that would surprise
   * the user mid-workflow).
   */
  protected reset(): void {
    this.sprayer.setBaseSize(48);
    this.sprayer.setSpacing(40);
    this.sprayer.setScaleJitter(0.25);
  }
}
