import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  type Signal,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { type Palette, PaletteRegistry } from 'svg-engine/edit';

/**
 * Renders one or more color palettes as compact swatch grids and emits
 * a `colorPicked` event when the user clicks any swatch. Designed for
 * embedding inside the inspector under the color fields, but works as
 * a standalone component too (e.g., for a docked palette panel).
 *
 * **Inputs**:
 * - `palettes` (optional): explicit list of palettes to render. When
 *   omitted, the component pulls the live snapshot from
 *   `PaletteRegistry.palettes()` — i.e., everything every installed
 *   plugin (including the built-in palettes plugin) has contributed.
 *   Pass a curated list to scope the picker to e.g. one brand palette.
 * - `transparentLabel` (optional): tooltip text for swatches whose
 *   color is `'transparent'`. Default `'Clear'`. The visual treatment
 *   (red diagonal stripe) is fixed — universal in the design-tool
 *   world (Figma, Affinity, Inkscape).
 *
 * **Output**:
 * - `colorPicked`: emits the swatch's raw CSS color string (the
 *   original value — `'transparent'`, `'hsl(...)'`, `'#ff0000'`, etc.).
 *   Consumers should normalize / write to the model as appropriate.
 *
 * **Why no internal model write**: the palette is a presentation
 * primitive — it doesn't know whether the user wants to apply the
 * color to fill, stroke, both, or something else (gradient stop,
 * shadow, ...). Routing is the consumer's job (e.g., the inspector
 * applies the picked color to whichever field was last focused).
 */
@Component({
  selector: 'svge-color-palette',
  standalone: true,
  imports: [MatIcon, MatTooltip],
  template: `
    @for (p of effectivePalettes(); track p.id) {
      <section class="palette" [attr.aria-label]="p.name">
        <header class="palette-header">
          <span class="palette-name">{{ p.name }}</span>
        </header>
        <div class="swatches" role="group" [attr.aria-label]="p.name + ' swatches'">
          @for (sw of p.swatches; track sw) {
            <button
              type="button"
              class="swatch"
              [class.transparent]="sw === 'transparent'"
              [style.background-color]="sw"
              [attr.aria-label]="sw === 'transparent' ? transparentLabel() : sw"
              [matTooltip]="sw === 'transparent' ? transparentLabel() : sw"
              matTooltipPosition="above"
              (click)="onPick(sw)"
            >
              @if (sw === 'transparent') {
                <mat-icon class="x-icon" aria-hidden="true">block</mat-icon>
              }
            </button>
          }
        </div>
      </section>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .palette + .palette {
      margin-top: 8px;
    }
    .palette-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
    }
    .palette-name {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--mat-sys-on-surface-variant, #777);
    }
    .swatches {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    /* Swatch chip — slightly smaller than the inspector's per-field
       swatch (24×16 vs 28×22) so a full palette fits in two rows. */
    .swatch {
      flex: 0 0 24px;
      width: 24px;
      height: 16px;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 3px;
      cursor: pointer;
      position: relative;
      transition: transform 80ms;
      /* Checkerboard backdrop for transparent / semi-transparent
         swatches — same pattern as the inspector field swatch. */
      background-image:
        linear-gradient(45deg, #ddd 25%, transparent 25%),
        linear-gradient(-45deg, #ddd 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #ddd 75%),
        linear-gradient(-45deg, transparent 75%, #ddd 75%);
      background-size: 6px 6px;
      background-position:
        0 0,
        0 3px,
        3px -3px,
        -3px 0;
    }
    .swatch:hover {
      transform: scale(1.12);
      border-color: var(--mat-sys-primary, #1976d2);
      z-index: 1;
    }
    .swatch:focus-visible {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: 1px;
    }
    .swatch.transparent {
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: transparent;
    }
    .swatch.transparent .x-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      line-height: 14px;
      color: #d32f2f;
      opacity: 0.85;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeColorPalette {
  private readonly registry = inject(PaletteRegistry);

  /**
   * Palettes to render. Defaults to the live `PaletteRegistry`
   * snapshot (every plugin-contributed palette) when not provided.
   * Pass an explicit list to scope the picker.
   */
  readonly palettes = input<readonly Palette[] | null>(null);

  /** Tooltip for the `'transparent'` swatch (defaults to `'Clear'`). */
  readonly transparentLabel = input<string>('Clear');

  /** Emits the picked swatch's raw CSS color string. */
  readonly colorPicked = output<string>();

  /**
   * Effective palette list shown by the template. Either the
   * caller-provided array (`palettes` input) or the live registry
   * snapshot. Computed so changing the input (or registry contents)
   * auto-refreshes the UI without manual subscriptions.
   */
  protected readonly effectivePalettes: Signal<readonly Palette[]> = computed(
    () => this.palettes() ?? this.registry.palettes(),
  );

  protected onPick(color: string): void {
    this.colorPicked.emit(color);
  }
}
