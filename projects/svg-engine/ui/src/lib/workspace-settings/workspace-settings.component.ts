import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogClose, MatDialogRef } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import {
  type ImportPlacementMode,
  ImportSettingsService,
  WHEEL_ZOOM_SPEED_MAX,
  WHEEL_ZOOM_SPEED_MIN,
  WorkspaceService,
} from 'svg-engine/edit';
import { SvgeDialogShell } from '../dialog-shell';

/**
 * **PRO-GAP G1** — preset identifiers shown as radios in the Background
 * section. Maps to canonical `BackgroundConfig` values (or `null`
 * for the "custom solid color" branch, where the user picks via the
 * color input).
 *
 * **Why presets, not free-text**: the four colors below come from the
 * legacy Custom Editor toolbar swatches (Transparent / White / Light
 * Gray / Dark). Keeping them as one-click presets matches the muscle
 * memory of users transitioning from the Custom shell — the Custom
 * shell stays as-is per the user's instruction, this just makes the
 * SAME presets reachable from the Professional shell via Workspace
 * Settings (per the user's UX answer for G1).
 */
type BackgroundPresetId = 'transparent' | 'white' | 'light-gray' | 'dark' | 'custom';

/** Hex codes mirror the toolbar swatches in the legacy Custom shell. */
const PRESET_COLORS: Readonly<
  Record<Exclude<BackgroundPresetId, 'transparent' | 'custom'>, string>
> = {
  white: '#ffffff',
  'light-gray': '#e0e0e0',
  dark: '#222222',
};

/**
 * Settings dialog for the {@link WorkspaceService} — page / grid /
 * rulers / guides / interaction tuning surfaced as a Material dialog
 * so users can adjust them without leaving the canvas.
 *
 * **Layout standardized via `<svge-dialog-shell>`** — D-044 follow-up
 * (UI consistency sprint): inherits the canonical header (icon + title
 * + Close X), body padding, and footer actions slot from the shared
 * shell. Sizing comes from `svgeDialogConfig('md')` set in
 * {@link SvgeWorkspaceSettingsDialogService} — `'md'` (600px) is the
 * right bucket for forms with multiple grouped fields.
 *
 * **Surface kept narrow on purpose**:
 * - Page: width / height / orientation
 * - Grid: enabled / spacing / majorEvery (color picker deferred — the
 *   default `--mat-sys-outline-variant` blends well in both themes;
 *   custom color is plugin territory)
 * - Rulers: enabled
 * - Guides: count (read-only) + "Clear all"
 * - Interaction: wheel zoom speed slider
 *
 * Margins NOT exposed in v1 — workspace model supports them but no
 * editor feature consumes them yet (would be confusing to set without
 * visible feedback).
 *
 * **Usage**: open via {@link SvgeWorkspaceSettingsDialogService} so
 * MatDialogConfig (size + scope-aware injector wiring) stays consistent
 * across every call site.
 */
@Component({
  selector: 'svge-workspace-settings',
  standalone: true,
  imports: [
    SvgeDialogShell,
    MatDialogClose,
    MatButtonModule,
    MatFormField,
    MatLabel,
    MatInput,
    MatSelectModule,
    MatCheckboxModule,
    MatRadioModule,
  ],
  template: `
    <svge-dialog-shell
      icon="tune"
      title="Workspace settings"
      subtitle="Background · Page · Grid · Rulers · Guides · Import · Interaction"
    >
      <!-- Body (default slot) -->
      <!--
        PRO-GAP G1 — Canvas Background. Moved into Workspace Settings
        per the UX answer (instead of polluting the View menu with a
        4-preset submenu). Mirrors the Custom Editor toolbar swatches
        as radios + a hex color input that activates when "Custom" is
        selected. Reset goes back to the default transparent
        checkerboard via WorkspaceService.resetBackground().
      -->
      <section class="group">
        <h3>Background</h3>
        <mat-radio-group
          class="bg-presets"
          [value]="backgroundPreset()"
          (change)="setBackgroundPreset($any($event).value)"
          aria-label="Canvas background preset"
        >
          <mat-radio-button value="transparent">
            <span class="swatch transparent" aria-hidden="true"></span>
            Transparent
          </mat-radio-button>
          <mat-radio-button value="white">
            <span
              class="swatch"
              style="background:#ffffff;border:1px solid #ccc"
              aria-hidden="true"
            ></span>
            White
          </mat-radio-button>
          <mat-radio-button value="light-gray">
            <span class="swatch" style="background:#e0e0e0" aria-hidden="true"></span>
            Light Gray
          </mat-radio-button>
          <mat-radio-button value="dark">
            <span class="swatch" style="background:#222222" aria-hidden="true"></span>
            Dark
          </mat-radio-button>
          <mat-radio-button value="custom">
            <span
              class="swatch"
              [style.background]="customColor()"
              [style.border]="'1px solid #ccc'"
              aria-hidden="true"
            ></span>
            Custom
          </mat-radio-button>
        </mat-radio-group>
        @if (backgroundPreset() === 'custom') {
          <label class="custom-row">
            <span class="custom-label">Color</span>
            <input
              type="color"
              class="custom-color"
              [value]="customColor()"
              (input)="setCustomColor($any($event.target).value)"
              aria-label="Custom background color"
            />
            <span class="custom-hex">{{ customColor() }}</span>
          </label>
        }
      </section>

      <section class="group">
        <h3>Page</h3>
        <div class="row">
          <mat-form-field appearance="outline" class="small">
            <mat-label>width</mat-label>
            <input
              matInput
              type="number"
              min="1"
              [value]="pageWidth()"
              (change)="setPageWidth($any($event.target).value)"
            />
          </mat-form-field>
          <mat-form-field appearance="outline" class="small">
            <mat-label>height</mat-label>
            <input
              matInput
              type="number"
              min="1"
              [value]="pageHeight()"
              (change)="setPageHeight($any($event.target).value)"
            />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>orientation</mat-label>
            <mat-select
              [value]="pageOrientation()"
              (selectionChange)="setOrientation($any($event).value)"
            >
              <mat-option value="landscape">Landscape</mat-option>
              <mat-option value="portrait">Portrait</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
      </section>

      <section class="group">
        <h3>Grid</h3>
        <mat-checkbox [checked]="gridEnabled()" (change)="setGridEnabled($any($event).checked)">
          Show grid
        </mat-checkbox>
        <div class="row">
          <mat-form-field appearance="outline" class="small">
            <mat-label>spacing</mat-label>
            <input
              matInput
              type="number"
              min="1"
              step="1"
              [value]="gridSpacing()"
              (change)="setGridSpacing($any($event.target).value)"
            />
          </mat-form-field>
          <mat-form-field appearance="outline" class="small">
            <mat-label>major every</mat-label>
            <input
              matInput
              type="number"
              min="1"
              step="1"
              [value]="gridMajorEvery()"
              (change)="setGridMajorEvery($any($event.target).value)"
            />
          </mat-form-field>
        </div>
      </section>

      <section class="group">
        <h3>Rulers</h3>
        <mat-checkbox [checked]="rulersEnabled()" (change)="setRulersEnabled($any($event).checked)">
          Show rulers
        </mat-checkbox>
      </section>

      <section class="group">
        <h3>Guides</h3>
        <p class="info">{{ guideCount() }} guide{{ guideCount() === 1 ? '' : 's' }} on canvas</p>
        <button mat-button type="button" [disabled]="guideCount() === 0" (click)="clearGuides()">
          Clear all
        </button>
      </section>

      <!--
        D-107 — SVG Import placement preference. Persisted via
        ImportSettingsService (localStorage). Controls how File ▸ Import ▸
        SVG positions the imported art: 'centered' drops it at natural 1:1
        size on the active page; 'place' lets the user drag an insertion
        rectangle on the canvas (Illustrator's *Place*).
      -->
      <section class="group">
        <h3>SVG Import</h3>
        <mat-radio-group
          class="import-modes"
          [value]="placementMode()"
          (change)="setPlacementMode($any($event).value)"
          aria-label="SVG import placement"
        >
          <mat-radio-button value="centered">Centered at 100% (natural size)</mat-radio-button>
          <mat-radio-button value="place">Drag a placement rectangle</mat-radio-button>
        </mat-radio-group>
        <p class="info">
          Choose how an imported SVG is positioned. “Centered” inserts it at its natural size on the
          active page; “Drag a placement rectangle” lets you draw the insertion area on the canvas
          (press Esc to cancel).
        </p>
      </section>

      <section class="group">
        <h3>Interaction</h3>
        <label class="slider-row">
          <span class="slider-label">
            Wheel zoom speed: <strong>{{ wheelZoomSpeed() }}</strong>
          </span>
          <input
            type="range"
            class="speed-slider"
            [min]="speedMin"
            [max]="speedMax"
            step="1"
            [value]="wheelZoomSpeed()"
            (input)="setWheelZoomSpeed($any($event.target).value)"
            aria-label="Wheel zoom sensitivity"
          />
          <span class="slider-hints">
            <span>Slow</span>
            <span>Fast</span>
          </span>
        </label>
        <p class="info">
          Controls how much one notch of the mouse wheel changes zoom. Try lowering this if a single
          scroll feels like it jumps too far.
        </p>
      </section>

      <!-- Footer actions slot -->
      <ng-container svgeDialogFooterActions>
        <button mat-button type="button" (click)="resetAll()">Reset defaults</button>
        <button mat-flat-button type="button" mat-dialog-close>Done</button>
      </ng-container>
    </svge-dialog-shell>
  `,
  styles: `
    /* Internals only — header / footer / sizing live in <svge-dialog-shell>. */
    .group {
      padding: 12px 0;
      border-top: 1px solid var(--mat-sys-outline-variant, #ddd);
    }
    .group:first-of-type {
      padding-top: 0;
      border-top: 0;
    }
    .group h3 {
      margin: 0 0 8px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--mat-sys-on-surface-variant, #777);
    }
    .row {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      flex-wrap: wrap;
    }
    .small {
      flex: 0 0 110px;
    }
    .info {
      margin: 0 0 8px;
      color: var(--mat-sys-on-surface-variant, #777);
      font-size: 13px;
    }
    mat-checkbox {
      display: block;
      margin-bottom: 8px;
    }
    .slider-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 4px;
    }
    .slider-label {
      font-size: 13px;
      color: var(--mat-sys-on-surface, inherit);
    }
    .slider-label strong {
      color: var(--mat-sys-primary, #1976d2);
      font-variant-numeric: tabular-nums;
    }
    .speed-slider {
      width: 100%;
      accent-color: var(--mat-sys-primary, #1976d2);
    }
    .slider-hints {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant, #777);
    }
    /* PRO-GAP G1 — Background presets row */
    .bg-presets {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    /* D-107 — SVG import placement radios (vertical, same as bg-presets) */
    .import-modes {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 8px;
    }
    .bg-presets mat-radio-button {
      display: flex;
      align-items: center;
    }
    .swatch {
      display: inline-block;
      width: 16px;
      height: 16px;
      margin-right: 6px;
      border-radius: 3px;
      vertical-align: middle;
    }
    /* Checkerboard for the transparent preset — same pattern the
       <svge-workspace-background> uses on the canvas. */
    .swatch.transparent {
      background-image:
        linear-gradient(45deg, #ccc 25%, transparent 25%),
        linear-gradient(-45deg, #ccc 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #ccc 75%),
        linear-gradient(-45deg, transparent 75%, #ccc 75%);
      background-size: 8px 8px;
      background-position:
        0 0,
        0 4px,
        4px -4px,
        -4px 0;
      background-color: #fff;
    }
    .custom-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding-left: 28px; /* align under the radio label */
    }
    .custom-label {
      font-size: 13px;
      color: var(--mat-sys-on-surface, inherit);
    }
    .custom-color {
      width: 36px;
      height: 26px;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 3px;
      background: transparent;
      cursor: pointer;
    }
    .custom-hex {
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #777);
      font-variant-numeric: tabular-nums;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeWorkspaceSettings {
  private readonly ws = inject(WorkspaceService);
  /**
   * **D-107** — SVG import placement preference (centered 100% vs
   * interactive *place* rectangle). Root-scoped (a global preference,
   * not per-editor) and persisted to localStorage by the service.
   */
  private readonly importSettings = inject(ImportSettingsService);
  /**
   * Kept injected (even though the Done button uses `mat-dialog-close`)
   * so callers wiring `afterClosed()` can still distinguish "Done"
   * vs the implicit dismiss paths if needed in the future.
   */
  protected readonly dialogRef = inject(MatDialogRef<SvgeWorkspaceSettings>);

  // ── Background readers (PRO-GAP G1) ───────────────────────────

  /**
   * **PRO-GAP-FIX B1** — sticky "user picked Custom" flag.
   *
   * Without this signal, choosing Custom while the previous color
   * happens to match a preset hex (e.g., the user came from "Dark"
   * with `#222222`) would re-snap the radio back to that preset
   * inside `backgroundPreset()` — and the `@if` would hide the color
   * picker. The flag pins the radio to Custom until the user
   * explicitly picks a different preset.
   *
   * Reset to `false` whenever `setBackgroundPreset` is called with a
   * non-custom preset; also implicitly inert when the live config is
   * `kind: 'transparent'` (transparent always wins over the flag).
   */
  private readonly userChoseCustom = signal(false);

  /**
   * Map the live `BackgroundConfig` signal to a preset id used by
   * the radio group. Solid colors matching one of the canonical preset
   * swatches snap to that preset; anything else surfaces as "custom"
   * so the color input stays in sync with whatever the user typed.
   *
   * **Why a computed (not a separate signal)**: keeps a single source
   * of truth — `WorkspaceService.background()`. Editing via radios or
   * via the color input both push into the service, the UI re-derives.
   * Prevents drift between the radio and the actual canvas state if
   * an external plugin calls `setBackground` directly.
   *
   * **PRO-GAP-FIX B1**: honors {@link userChoseCustom} so the radio
   * doesn't pop back to a preset when the picked color coincides with
   * one of the preset hex codes.
   */
  protected readonly backgroundPreset = computed<BackgroundPresetId>(() => {
    const bg = this.ws.background();
    if (bg.kind === 'transparent') return 'transparent';
    if (bg.kind === 'image') return 'custom'; // image url → treated as custom-ish
    // Solid color — if the user explicitly chose Custom, stay on
    // Custom regardless of hex value. Otherwise snap to a canonical
    // preset when the hex matches; else `custom` (defensive fallback).
    if (this.userChoseCustom()) return 'custom';
    const hex = bg.color.toLowerCase();
    if (hex === PRESET_COLORS.white.toLowerCase()) return 'white';
    if (hex === PRESET_COLORS['light-gray'].toLowerCase()) return 'light-gray';
    if (hex === PRESET_COLORS.dark.toLowerCase()) return 'dark';
    return 'custom';
  });

  /**
   * Current hex shown in the color input. When the user is on a
   * canonical preset the input still shows its color (so flipping
   * "custom" doesn't reset to black); when on transparent we default
   * to white as a starting point for the color picker.
   */
  protected readonly customColor = computed<string>(() => {
    const bg = this.ws.background();
    if (bg.kind === 'solid') return bg.color;
    return '#ffffff';
  });

  // ── Page readers ──────────────────────────────────────────────

  protected readonly pageWidth = computed(() => this.ws.page().width);
  protected readonly pageHeight = computed(() => this.ws.page().height);
  protected readonly pageOrientation = computed(() => this.ws.page().orientation);

  // ── Grid / Rulers / Guides readers ────────────────────────────

  protected readonly gridEnabled = computed(() => this.ws.grid().enabled);
  protected readonly gridSpacing = computed(() => this.ws.grid().spacing);
  protected readonly gridMajorEvery = computed(() => this.ws.grid().majorEvery);
  protected readonly rulersEnabled = computed(() => this.ws.rulers().enabled);
  protected readonly guideCount = computed(() => this.ws.guides().length);
  protected readonly wheelZoomSpeed = computed(() => this.ws.interaction().wheelZoomSpeed);
  protected readonly speedMin = WHEEL_ZOOM_SPEED_MIN;
  protected readonly speedMax = WHEEL_ZOOM_SPEED_MAX;

  // ── SVG import readers (D-107) ────────────────────────────────

  protected readonly placementMode = computed(() => this.importSettings.placementMode());

  // ── Mutators (delegate validation to WorkspaceService) ────────

  /**
   * PRO-GAP G1 — apply a background preset. Transparent uses the
   * dedicated `kind: 'transparent'` variant; the three solid presets
   * map to their canonical hex codes; `custom` re-asserts the current
   * custom color (or seeds white if we're switching from transparent
   * so the color input has a sensible starting state).
   *
   * **PRO-GAP-FIX B1**: toggles the {@link userChoseCustom} sticky
   * flag so the radio stays on the user-picked option even when the
   * resulting hex coincides with a preset (e.g., Custom + #222222
   * shouldn't snap back to Dark).
   */
  protected setBackgroundPreset(preset: BackgroundPresetId): void {
    if (preset === 'transparent') {
      this.userChoseCustom.set(false);
      this.ws.setBackground({ kind: 'transparent' });
      return;
    }
    if (preset === 'custom') {
      this.userChoseCustom.set(true);
      // Use whatever color the picker last had; if we're switching
      // FROM transparent we need to seed something other than ''.
      const seed = this.customColor();
      this.ws.setBackground({ kind: 'solid', color: seed });
      return;
    }
    // Canonical preset (white / light-gray / dark) — un-stick Custom
    // so subsequent re-derivation maps the hex back to the preset id.
    this.userChoseCustom.set(false);
    const hex = PRESET_COLORS[preset];
    this.ws.setBackground({ kind: 'solid', color: hex });
  }

  /**
   * Live update from the `<input type="color">` element. We never
   * commit empty strings (the picker can briefly emit them during
   * resets in some browsers) — the service validator would reject it
   * anyway, but skipping early avoids a spurious change-detection
   * round trip.
   *
   * **PRO-GAP-FIX B1**: keep the Custom flag sticky during color
   * picking — without this, if the user happens to pick a hex matching
   * a preset, the radio would jump to that preset mid-interaction.
   */
  protected setCustomColor(value: string): void {
    if (typeof value !== 'string' || value.length === 0) return;
    this.userChoseCustom.set(true);
    this.ws.setBackground({ kind: 'solid', color: value });
  }

  protected setPageWidth(raw: string): void {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n > 0) this.ws.patchPage({ width: n });
  }
  protected setPageHeight(raw: string): void {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n > 0) this.ws.patchPage({ height: n });
  }
  protected setOrientation(value: 'landscape' | 'portrait'): void {
    this.ws.patchPage({ orientation: value });
  }
  protected setGridEnabled(checked: boolean): void {
    this.ws.patchGrid({ enabled: checked });
  }
  protected setGridSpacing(raw: string): void {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n > 0) this.ws.patchGrid({ spacing: n });
  }
  protected setGridMajorEvery(raw: string): void {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) this.ws.patchGrid({ majorEvery: n });
  }
  protected setRulersEnabled(checked: boolean): void {
    this.ws.setRulersEnabled(checked);
  }
  protected clearGuides(): void {
    this.ws.clearGuides();
  }
  protected setWheelZoomSpeed(raw: string | number): void {
    const n = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
    if (Number.isFinite(n)) this.ws.patchInteraction({ wheelZoomSpeed: n });
  }
  /** D-107 — persist the chosen SVG-import placement mode. */
  protected setPlacementMode(mode: ImportPlacementMode): void {
    this.importSettings.setPlacementMode(mode);
  }
  protected resetAll(): void {
    // PRO-GAP G1 — include background in "Reset defaults" so users
    // expect the dialog to revert ALL workspace settings (not just
    // some of them silently). PRO-GAP-FIX B1: also clear the Custom
    // sticky flag so post-reset the radio reflects the (transparent)
    // default cleanly.
    this.userChoseCustom.set(false);
    this.ws.resetBackground();
    this.ws.resetPage();
    this.ws.resetGrid();
    this.ws.setRulersEnabled(false);
    this.ws.clearGuides();
    this.ws.resetInteraction();
    // D-107 — also revert the SVG-import placement preference to the
    // 'centered' default so "Reset defaults" reverts every control in
    // this dialog (including the Import section), not just some.
    this.importSettings.setPlacementMode('centered');
  }
}
