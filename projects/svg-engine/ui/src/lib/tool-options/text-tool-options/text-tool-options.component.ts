import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { InlineTextEditorService } from '@mosaicoo/svg-engine/edit';
import { TOOL_OPT_SHARED_STYLES } from '../shared-styles';

/**
 * **TOOL-OPT-C** — Options bar for the Text tool. Surfaces typography
 * defaults from {@link InlineTextEditorService} so the user can pre-
 * set font + size + weight + anchor before clicking on the canvas.
 *
 * **Why these defaults persist**: when the user picks "Inter Bold 24"
 * once, every subsequent click should produce text with the same look
 * — matching Illustrator's "tool defaults sticky" convention. The
 * service signals back-stop these prefs and `TextTool.onPointerDown`
 * consumes them at node creation time.
 *
 * **Font family list**: a small curated set of system-safe fallbacks
 * (sans + serif + mono). Same set the Inspector uses for D-069 —
 * keeping the two surfaces in sync so the user's mental model holds.
 */
@Component({
  selector: 'svge-text-tool-options',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  template: `
    <span class="opt-group">
      <span class="opt-label">Font</span>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="font-select">
        <mat-select
          [value]="text.fontFamily()"
          (selectionChange)="text.setFontFamily($event.value)"
          placeholder="Default"
        >
          <mat-option [value]="null">Default</mat-option>
          @for (f of FONT_FAMILIES; track f.value) {
            <mat-option [value]="f.value">{{ f.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </span>
    <span class="opt-divider" aria-hidden="true">│</span>
    <span class="opt-group">
      <span class="opt-label">Size</span>
      <input
        type="number"
        class="opt-number"
        min="6"
        max="400"
        step="1"
        [value]="text.fontSize() ?? ''"
        placeholder="16"
        (change)="setFontSize($event)"
        matTooltip="Font size (px)"
        aria-label="Font size"
      />
    </span>
    <span class="opt-divider" aria-hidden="true">│</span>
    <span class="opt-group">
      <span class="opt-label">Weight</span>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="weight-select">
        <mat-select
          [value]="text.fontWeight()"
          (selectionChange)="text.setFontWeight($event.value)"
          placeholder="—"
        >
          <mat-option [value]="null">—</mat-option>
          @for (w of WEIGHTS; track w) {
            <mat-option [value]="w">{{ w }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
    </span>
    <span class="opt-divider" aria-hidden="true">│</span>
    <span class="opt-group">
      <button
        type="button"
        class="opt-toggle"
        [class.opt-toggle--active]="text.fontStyle() === 'italic'"
        (click)="text.setItalic(text.fontStyle() !== 'italic')"
        matTooltip="Italic"
        aria-label="Toggle italic"
      >
        <mat-icon>format_italic</mat-icon>
      </button>
    </span>
    <span class="opt-divider" aria-hidden="true">│</span>
    <span class="opt-group">
      <span class="opt-label" id="text-anchor-label">Anchor</span>
      <mat-button-toggle-group
        [value]="text.textAnchor()"
        (change)="text.setTextAnchor($event.value)"
        hideSingleSelectionIndicator
        aria-labelledby="text-anchor-label"
      >
        <mat-button-toggle value="start" matTooltip="Left-align (text-anchor: start)">
          <mat-icon>format_align_left</mat-icon>
        </mat-button-toggle>
        <mat-button-toggle value="middle" matTooltip="Center (text-anchor: middle)">
          <mat-icon>format_align_center</mat-icon>
        </mat-button-toggle>
        <mat-button-toggle value="end" matTooltip="Right-align (text-anchor: end)">
          <mat-icon>format_align_right</mat-icon>
        </mat-button-toggle>
      </mat-button-toggle-group>
    </span>
    <span class="opt-divider" aria-hidden="true">│</span>
    <span class="opt-group">
      <span class="opt-label">Fill</span>
      <label class="opt-color" [style.background]="text.fill()" matTooltip="Text fill color">
        <input type="color" [value]="text.fill()" (change)="setFill($event)" />
      </label>
    </span>
    <span class="opt-spacer"></span>
    <button
      type="button"
      class="opt-action"
      (click)="reset()"
      matTooltip="Reset to defaults"
      aria-label="Reset text tool options"
    >
      <mat-icon>refresh</mat-icon>
    </button>
  `,
  styles: `
    ${TOOL_OPT_SHARED_STYLES}
    .font-select {
      min-width: 140px;
      max-width: 200px;
      font-size: 12px;
    }
    .weight-select {
      min-width: 70px;
      max-width: 90px;
      font-size: 12px;
    }
    .font-select ::ng-deep .mat-mdc-form-field-infix,
    .weight-select ::ng-deep .mat-mdc-form-field-infix {
      min-height: 28px;
      padding-top: 4px !important;
      padding-bottom: 4px !important;
    }
    .font-select ::ng-deep .mat-mdc-form-field-flex,
    .weight-select ::ng-deep .mat-mdc-form-field-flex {
      min-height: 28px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeTextToolOptions {
  protected readonly text = inject(InlineTextEditorService);

  /** Curated system-safe font stack — same set used in the Inspector. */
  protected readonly FONT_FAMILIES = [
    { label: 'Sans Serif', value: 'system-ui, -apple-system, sans-serif' },
    { label: 'Serif', value: 'Georgia, serif' },
    { label: 'Mono', value: '"SFMono-Regular", Menlo, Consolas, monospace' },
    { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
    { label: 'Helvetica', value: 'Helvetica, Arial, sans-serif' },
    { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
    { label: 'Inter', value: '"Inter", sans-serif' },
  ];

  protected readonly WEIGHTS = [100, 300, 400, 500, 600, 700, 900] as const;

  protected setFontSize(e: Event): void {
    const raw = (e.target as HTMLInputElement).value;
    if (raw === '') {
      this.text.setFontSize(null);
      return;
    }
    const v = Number(raw);
    if (Number.isFinite(v)) this.text.setFontSize(v);
  }

  protected setFill(e: Event): void {
    this.text.setFill((e.target as HTMLInputElement).value);
  }

  protected reset(): void {
    this.text.setFontFamily(null);
    this.text.setFontSize(null);
    this.text.setFontWeight(null);
    this.text.setItalic(false);
    this.text.setTextAnchor('start');
    this.text.setFill('#000000');
  }
}
