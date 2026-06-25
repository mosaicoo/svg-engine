import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { capturePointer, releasePointer } from '@mosaicoo/svg-engine/edit';
import {
  formatHex,
  formatHsvAsHex,
  type HSV,
  hsvToRgb,
  parseHexToHsv,
  type RGB,
  rgbToHsv,
} from './color-conversions';
import { ColorHistoryService } from './color-history.service';

/**
 * Browser EyeDropper API surface. Chromium-only as of 2026; other
 * browsers degrade gracefully (button hidden). Inlined here to avoid
 * pulling DOM lib changes for a single optional feature.
 */
interface EyeDropperResult {
  readonly sRGBHex: string;
}
type EyeDropperConstructor = new () => { open(): Promise<EyeDropperResult> };
declare global {
  interface Window {
    readonly EyeDropper?: EyeDropperConstructor;
  }
}

/** Square edge in CSS pixels — fixed for predictable hit-testing math. */
const SQUARE_PX = 200;
/** Hue slider height in CSS pixels. */
const HUE_PX = 16;

/**
 * Pro-grade colour picker — sat/val square + hue slider + HEX/RGB inputs
 * + recent swatches + eyedropper (EyeDropper API).
 *
 * **Why a custom component** (not the native `<input type="color">`):
 *
 * - Native picker is OS-dependent (Mac, Windows, Linux all look different).
 * - Native picker doesn't surface hex/rgb/alpha inputs consistently.
 * - Native picker has no "recent colours" memory.
 * - Native picker offers no eyedropper on most browsers.
 *
 * **Interaction model**:
 *
 * - **Sat/val square** (200×200): drag the dot to set saturation (x)
 *   and value/brightness (y inverted — top = bright). Background is a
 *   gradient computed from the current hue.
 * - **Hue slider** (vertical, 16px wide): drag to set hue 0..360.
 *   Background is the standard rainbow gradient.
 * - **HEX input**: free-form text; commits on Enter/blur. Invalid
 *   input is silently ignored (the field reverts to the last valid
 *   value on blur).
 * - **R/G/B inputs**: number inputs 0..255; commits on input.
 * - **Recent swatches**: row of 16 most-recently picked colours from
 *   {@link ColorHistoryService}. Click applies.
 * - **Eyedropper button** (when supported): opens the browser's
 *   colour-pick-from-screen overlay (Chromium only as of 2026).
 *
 * **Signal flow**:
 *
 * The picker maintains its state internally as HSV (matches the geometry
 * of the sat/val square + hue slider) and emits `(colorChange)` events
 * as `#rrggbb` strings whenever the user commits a change. The parent
 * consumer is the source of truth; we accept the incoming `color` input
 * as the initial / synchronised value but don't write back to it.
 *
 * **Why HSV not HSL**: HSV's V (value) axis maps directly to the
 * "brightness" intuition photographers and designers expect on the
 * vertical axis of the picker square. HSL's L (lightness) would put
 * white at the top middle (sat=0, l=1) which feels surprising.
 */
@Component({
  selector: 'svge-color-picker',
  standalone: true,
  imports: [MatIconButton, MatIcon],
  host: {
    role: 'group',
    'aria-label': 'Color picker',
  },
  template: `
    <!--
      Sat/val square. SVG so we can paint the two overlapping gradients
      (left→right white→saturated colour; top→bottom transparent→black)
      that produce the classic Photoshop picker look without canvas
      shenanigans. Hit-testing is done in CSS pixel space via getBoundingClientRect.
    -->
    <svg
      #sqSvg
      class="sat-val-square"
      [attr.width]="squarePx"
      [attr.height]="squarePx"
      [attr.viewBox]="'0 0 ' + squarePx + ' ' + squarePx"
      (pointerdown)="onSquarePointerDown($event)"
      (pointermove)="onSquarePointerMove($event)"
      (pointerup)="onSquarePointerUp($event)"
      role="application"
      aria-label="Saturation and value picker, drag to choose"
    >
      <defs>
        <linearGradient [attr.id]="gradientIds().satX" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stop-color="#ffffff" />
          <stop offset="1" [attr.stop-color]="pureHueHex()" />
        </linearGradient>
        <linearGradient [attr.id]="gradientIds().valY" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#000000" stop-opacity="0" />
          <stop offset="1" stop-color="#000000" stop-opacity="1" />
        </linearGradient>
      </defs>
      <rect [attr.width]="squarePx" [attr.height]="squarePx" [attr.fill]="satXFill()" />
      <rect [attr.width]="squarePx" [attr.height]="squarePx" [attr.fill]="valYFill()" />
      <!-- Cursor dot — white outline + dark inner ring for visibility on any background. -->
      <circle
        class="sq-cursor"
        [attr.cx]="cursorX()"
        [attr.cy]="cursorY()"
        r="6"
        fill="none"
        stroke="#000000"
        stroke-width="3"
      />
      <circle
        class="sq-cursor-inner"
        [attr.cx]="cursorX()"
        [attr.cy]="cursorY()"
        r="6"
        fill="none"
        stroke="#ffffff"
        stroke-width="1.5"
      />
    </svg>

    <!--
      Hue slider. Vertical strip with the standard rainbow gradient.
      Cursor is a horizontal line across the slider at the current hue.
    -->
    <svg
      #hueSvg
      class="hue-slider"
      [attr.width]="huePx"
      [attr.height]="squarePx"
      [attr.viewBox]="'0 0 ' + huePx + ' ' + squarePx"
      (pointerdown)="onHuePointerDown($event)"
      (pointermove)="onHuePointerMove($event)"
      (pointerup)="onHuePointerUp($event)"
      role="slider"
      [attr.aria-valuenow]="hsv().h.toFixed(0)"
      aria-valuemin="0"
      aria-valuemax="360"
      aria-orientation="vertical"
      aria-label="Hue, drag to choose"
    >
      <defs>
        <linearGradient [attr.id]="gradientIds().hue" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#ff0000" />
          <stop offset="0.167" stop-color="#ffff00" />
          <stop offset="0.333" stop-color="#00ff00" />
          <stop offset="0.5" stop-color="#00ffff" />
          <stop offset="0.667" stop-color="#0000ff" />
          <stop offset="0.833" stop-color="#ff00ff" />
          <stop offset="1" stop-color="#ff0000" />
        </linearGradient>
      </defs>
      <rect [attr.width]="huePx" [attr.height]="squarePx" [attr.fill]="hueFill()" />
      <line
        [attr.x1]="0"
        [attr.y1]="hueCursorY()"
        [attr.x2]="huePx"
        [attr.y2]="hueCursorY()"
        stroke="#000000"
        stroke-width="3"
      />
      <line
        [attr.x1]="0"
        [attr.y1]="hueCursorY()"
        [attr.x2]="huePx"
        [attr.y2]="hueCursorY()"
        stroke="#ffffff"
        stroke-width="1"
      />
    </svg>

    <!-- Numeric / hex inputs row. -->
    <div class="inputs">
      <label class="input-group hex">
        <span class="lbl">HEX</span>
        <input
          type="text"
          class="hex-input"
          [value]="hexDraft()"
          (input)="onHexInput($any($event.target).value)"
          (blur)="commitHexDraft()"
          (keydown.enter)="commitHexDraft()"
          spellcheck="false"
          maxlength="7"
          aria-label="HEX colour code (#rrggbb)"
        />
      </label>
      <label class="input-group">
        <span class="lbl">R</span>
        <input
          type="number"
          min="0"
          max="255"
          [value]="rgb().r"
          (input)="onRgbInput('r', $any($event.target).valueAsNumber)"
          aria-label="Red channel, 0 to 255"
        />
      </label>
      <label class="input-group">
        <span class="lbl">G</span>
        <input
          type="number"
          min="0"
          max="255"
          [value]="rgb().g"
          (input)="onRgbInput('g', $any($event.target).valueAsNumber)"
          aria-label="Green channel, 0 to 255"
        />
      </label>
      <label class="input-group">
        <span class="lbl">B</span>
        <input
          type="number"
          min="0"
          max="255"
          [value]="rgb().b"
          (input)="onRgbInput('b', $any($event.target).valueAsNumber)"
          aria-label="Blue channel, 0 to 255"
        />
      </label>
      @if (eyedropperSupported) {
        <button
          mat-icon-button
          type="button"
          class="eyedropper-btn"
          (click)="onEyedropper()"
          [disabled]="eyedropperBusy()"
          aria-label="Pick a colour from the screen with the eyedropper"
          matTooltipPosition="below"
        >
          <mat-icon>colorize</mat-icon>
        </button>
      }
    </div>

    <!-- Recent colours strip. Hidden when empty. -->
    @if (history.history().length > 0) {
      <div class="recent" role="list" aria-label="Recent colours">
        @for (sw of history.history(); track sw) {
          <button
            type="button"
            class="recent-sw"
            role="listitem"
            [style.background-color]="sw"
            [attr.aria-label]="'Apply recent colour ' + sw"
            [attr.title]="sw"
            (click)="onSelectRecent(sw)"
          ></button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: auto auto;
      grid-template-rows: auto auto auto;
      gap: 8px;
      padding: 12px;
      background: var(--mat-sys-surface-container, #f5f5f5);
      border-radius: 8px;
      /* Fixed to the natural width of the sat/val square + hue column
         (200 + 8 gap + 16 + 24 padding = 248) so the picker fits inside
         Material's 280px menu panel WITHOUT a horizontal scrollbar. The
         inputs/recent rows wrap within this width instead of forcing the
         popover wider than the square (the old max-content let the HEX/
         RGB row push past the square and overflow into a scrollbar). */
      width: 248px;
      max-width: 100%;
      box-sizing: border-box;
      user-select: none;
      touch-action: none;
    }
    .sat-val-square {
      cursor: crosshair;
      border-radius: 4px;
      overflow: hidden;
      grid-column: 1;
      grid-row: 1;
    }
    .hue-slider {
      cursor: crosshair;
      border-radius: 4px;
      overflow: hidden;
      grid-column: 2;
      grid-row: 1;
    }
    .inputs {
      grid-column: 1 / 3;
      grid-row: 2;
      display: flex;
      /* Wrap so HEX + R/G/B never push past the picker width (the
         scrollbar fix): HEX takes its own row, R/G/B + eyedropper share
         the next. min-width:0 lets the number fields shrink to fit. */
      flex-wrap: wrap;
      gap: 6px;
      align-items: flex-end;
    }
    .input-group {
      display: flex;
      flex-direction: column;
      font-size: 11px;
      flex: 1 1 auto;
      min-width: 0;
    }
    .input-group .lbl {
      color: var(--mat-sys-on-surface-variant, #666);
      margin-bottom: 2px;
    }
    .input-group input {
      width: 100%;
      box-sizing: border-box;
      padding: 4px;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 4px;
      font-family: var(--mat-sys-body-medium-font, monospace);
      font-size: 12px;
      background: var(--mat-sys-surface, #fff);
      color: var(--mat-sys-on-surface, #000);
    }
    /* HEX takes a full row of its own; R/G/B then fit side-by-side below. */
    .input-group.hex {
      flex-basis: 100%;
    }
    .input-group .hex-input {
      text-transform: lowercase;
    }
    .eyedropper-btn {
      align-self: end;
      flex: 0 0 auto;
    }
    .recent {
      grid-column: 1 / 3;
      grid-row: 3;
      display: grid;
      grid-template-columns: repeat(16, 1fr);
      gap: 3px;
      padding-top: 4px;
      border-top: 1px solid var(--mat-sys-outline-variant, #ccc);
    }
    .recent-sw {
      width: 100%;
      aspect-ratio: 1;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 2px;
      cursor: pointer;
      padding: 0;
    }
    .recent-sw:hover {
      transform: scale(1.15);
      border-color: var(--mat-sys-primary, #1976d2);
    }
    .recent-sw:focus-visible {
      outline: 2px solid var(--mat-sys-primary, #1976d2);
      outline-offset: 2px;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeColorPicker {
  protected readonly history = inject(ColorHistoryService);

  /** Sync this from the consumer's currently-edited colour. */
  readonly color = input<string>('#000000');

  /** Emits `#rrggbb` whenever the user commits a change. */
  readonly colorChange = output<string>();

  // ── Geometry constants surfaced for the template ──────────────────

  protected readonly squarePx = SQUARE_PX;
  protected readonly huePx = HUE_PX;

  /**
   * Per-instance unique gradient ids — the picker can be instantiated
   * multiple times in the same DOM, so hardcoding `id="satX"` would
   * cause clashes. We derive ids from a counter pre-component.
   */
  protected readonly gradientIds = computed(() => {
    const n = SvgeColorPicker.idCounter++;
    return {
      satX: `svge-cp-satX-${n}`,
      valY: `svge-cp-valY-${n}`,
      hue: `svge-cp-hue-${n}`,
    };
  });
  private static idCounter = 0;

  // ── Refs for hit-test conversion (clientX → square-local) ─────────

  private readonly sqSvg = viewChild<ElementRef<SVGSVGElement>>('sqSvg');
  private readonly hueSvg = viewChild<ElementRef<SVGSVGElement>>('hueSvg');

  // ── State ─────────────────────────────────────────────────────────

  /**
   * Internal HSV state — single source of truth for the picker. Updates
   * to `color` input feed it (when the value changes externally), and
   * every interaction writes to it. RGB / hex outputs are computed.
   */
  private readonly _hsv = signal<HSV>({ h: 0, s: 0, v: 0 });
  protected readonly hsv = this._hsv.asReadonly();

  /**
   * The hex input is intentionally "lazy" — user types `#1`, `#1a`,
   * `#1a2`... we shouldn't reject those mid-typing. `hexDraft` is the
   * raw input value; we commit only on Enter/blur (via parseHex which
   * tolerates `#rgb` shorthand).
   */
  protected readonly hexDraft = signal<string>('#000000');

  // ── EyeDropper API support detection ──────────────────────────────

  protected readonly eyedropperSupported =
    typeof window !== 'undefined' && typeof window.EyeDropper === 'function';
  protected readonly eyedropperBusy = signal(false);

  constructor() {
    // Sync internal HSV from the `color` input whenever it changes.
    // We accept dirty values (e.g., user typing the input mid-edit) but
    // only the parseable ones are reflected. Interaction-driven updates
    // skip this path — they write `_hsv` directly + emit `colorChange`.
    //
    // Self-emitted values are debounced via the `currentHex === incoming`
    // short-circuit so we don't loop when the parent dutifully echoes
    // back what we just sent.
    effect(() => {
      const incoming = this.color();
      const parsed = parseHexToHsv(incoming);
      if (parsed === null) return;
      const current = this._hsv();
      const currentHex = formatHsvAsHex(current);
      if (currentHex === incoming) return;
      this._hsv.set(parsed);
      this.hexDraft.set(incoming);
    });
  }

  // ── Derived state for template ────────────────────────────────────

  protected readonly rgb = computed<RGB>(() => hsvToRgb(this._hsv()));

  /** Hex string from the current HSV state — kept in sync for output. */
  protected readonly currentHex = computed(() => formatHex(this.rgb()));

  /** Pure hue colour (sat=1, val=1) used as the sat/val square's right edge. */
  protected readonly pureHueHex = computed(() => formatHsvAsHex({ h: this._hsv().h, s: 1, v: 1 }));

  /** Sat/val cursor positions (clamped to the square). */
  protected readonly cursorX = computed(() => this._hsv().s * SQUARE_PX);
  protected readonly cursorY = computed(() => (1 - this._hsv().v) * SQUARE_PX);
  protected readonly hueCursorY = computed(() => (this._hsv().h / 360) * SQUARE_PX);

  /** Refs to inline gradient fills — SVG `fill=url(#id)`. */
  protected readonly satXFill = computed(() => `url(#${this.gradientIds().satX})`);
  protected readonly valYFill = computed(() => `url(#${this.gradientIds().valY})`);
  protected readonly hueFill = computed(() => `url(#${this.gradientIds().hue})`);

  // ── Pointer handlers ──────────────────────────────────────────────

  private squareDragging = false;
  private hueDragging = false;

  protected onSquarePointerDown(event: PointerEvent): void {
    this.squareDragging = true;
    capturePointer(event);
    this.updateFromSquare(event);
  }

  protected onSquarePointerMove(event: PointerEvent): void {
    if (!this.squareDragging) return;
    this.updateFromSquare(event);
  }

  protected onSquarePointerUp(event: PointerEvent): void {
    this.squareDragging = false;
    releasePointer(event);
    this.commit();
  }

  protected onHuePointerDown(event: PointerEvent): void {
    this.hueDragging = true;
    capturePointer(event);
    this.updateFromHue(event);
  }

  protected onHuePointerMove(event: PointerEvent): void {
    if (!this.hueDragging) return;
    this.updateFromHue(event);
  }

  protected onHuePointerUp(event: PointerEvent): void {
    this.hueDragging = false;
    releasePointer(event);
    this.commit();
  }

  // ── Input handlers ────────────────────────────────────────────────

  protected onHexInput(value: string): void {
    this.hexDraft.set(value);
  }

  protected commitHexDraft(): void {
    const draft = this.hexDraft();
    const parsed = parseHexToHsv(draft);
    if (parsed === null) {
      // Revert draft to current valid value.
      this.hexDraft.set(this.currentHex());
      return;
    }
    this._hsv.set(parsed);
    this.hexDraft.set(formatHsvAsHex(parsed));
    this.commit();
  }

  protected onRgbInput(channel: 'r' | 'g' | 'b', value: number): void {
    if (!Number.isFinite(value)) return;
    const v = Math.max(0, Math.min(255, Math.round(value)));
    const next: RGB = { ...this.rgb(), [channel]: v };
    const hsv = rgbToHsv(next);
    this._hsv.set(hsv);
    this.hexDraft.set(formatHex(next));
    this.commit();
  }

  protected onSelectRecent(hex: string): void {
    const parsed = parseHexToHsv(hex);
    if (parsed === null) return;
    this._hsv.set(parsed);
    this.hexDraft.set(hex);
    this.commit();
  }

  protected async onEyedropper(): Promise<void> {
    if (!this.eyedropperSupported || this.eyedropperBusy()) return;
    this.eyedropperBusy.set(true);
    try {
      // Re-cast to access the constructor; we already checked `typeof === 'function'`.
      const Ctor = window.EyeDropper!;
      const instance = new Ctor();
      const result = await instance.open();
      const parsed = parseHexToHsv(result.sRGBHex);
      if (parsed !== null) {
        this._hsv.set(parsed);
        this.hexDraft.set(result.sRGBHex);
        this.commit();
      }
    } catch {
      // User cancelled (Esc) or browser denied — silent no-op.
    } finally {
      this.eyedropperBusy.set(false);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private updateFromSquare(event: PointerEvent): void {
    const svg = this.sqSvg()?.nativeElement;
    if (svg === undefined) return;
    const rect = svg.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    this._hsv.update((cur) => ({ h: cur.h, s: x / rect.width, v: 1 - y / rect.height }));
    this.hexDraft.set(this.currentHex());
    // Commit on each pointer move (live preview) — the parent gets a
    // stream of updates rather than one on release. Matches Photoshop
    // behaviour (canvas updates as you drag).
    this.colorChange.emit(this.currentHex());
  }

  private updateFromHue(event: PointerEvent): void {
    const svg = this.hueSvg()?.nativeElement;
    if (svg === undefined) return;
    const rect = svg.getBoundingClientRect();
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const h = (y / rect.height) * 360;
    this._hsv.update((cur) => ({ h, s: cur.s, v: cur.v }));
    this.hexDraft.set(this.currentHex());
    this.colorChange.emit(this.currentHex());
  }

  /**
   * Commit the current colour: emit `colorChange` + push to history.
   * Called on pointer-up (drag end), Enter/blur of hex input, and every
   * change of the rgb / recent / eyedropper paths.
   */
  private commit(): void {
    const hex = this.currentHex();
    this.colorChange.emit(hex);
    this.history.add(hex);
  }
}
