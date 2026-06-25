import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { CommandBus } from '@mosaicoo/svg-engine/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import {
  GradientEditingService,
  type GradientKind,
  GradientLibraryService,
  type GradientStop,
  SetGradientCommand,
} from '@mosaicoo/svg-engine/edit';

import { SvgeColorPicker } from '../color-picker/color-picker.component';

/**
 * **D-058** — Inspector-side panel for editing the currently-active
 * gradient's stops, type, and bulk operations. Visible only when
 * `GradientEditingService.activeGradientId()` resolves; auto-hides
 * when the selection has no gradient fill.
 *
 * **Composition**:
 * - **Header**: gradient name + type toggle (Linear / Radial)
 * - **Stops list**: one row per stop with color swatch (click → color
 *   picker via mat-menu), offset 0..100 input, delete button. Drag-
 *   reorder NOT in v1 (users reorder by changing offset numerically).
 * - **Add stop** button — inserts at offset 0.5 with interpolated
 *   color (or grey if first stop).
 * - **Reverse** button — flips offsets (0 ↔ 1, 0.5 stays).
 *
 * **Coordination with `<svge-gradient-overlay>`** (D-058 overlay,
 * canvas): both components read/write the same
 * `GradientEditingService.selectedStopIndex` — clicking a stop on
 * the canvas highlights that stop's row in this panel; editing a
 * color here updates the canvas overlay's dot color.
 *
 * **Headless boundary respected**: this component IS Material-bound
 * (lives in `svg-engine/ui`), the overlay (`svg-engine/edit`) is
 * pure SVG. Color picker integration happens here so the overlay
 * stays simple.
 *
 * **Standalone usage**: can be mounted in `<svge-inspector>` as a
 * section, OR as a standalone panel in custom layouts. The internal
 * gating (active gradient signal) keeps it visually empty when
 * nothing applies.
 */
@Component({
  selector: 'svge-gradient-editor',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIcon,
    MatIconButton,
    MatMenuModule,
    MatSlideToggleModule,
    SvgeColorPicker,
  ],
  template: `
    @if (active(); as g) {
      <header class="gradient-header">
        <span class="title">Gradient</span>
        <span class="kind-toggle">
          <button
            type="button"
            class="kind-btn"
            [class.active]="g.kind === 'linear'"
            (click)="setKind('linear')"
            title="Linear gradient"
          >
            <mat-icon>linear_scale</mat-icon>
          </button>
          <button
            type="button"
            class="kind-btn"
            [class.active]="g.kind === 'radial'"
            (click)="setKind('radial')"
            title="Radial gradient"
          >
            <mat-icon>circle</mat-icon>
          </button>
        </span>
      </header>

      <div class="stops-list" role="list" aria-label="Gradient stops">
        @for (s of g.stops; track $index; let i = $index) {
          <div
            class="stop-row"
            role="listitem"
            tabindex="0"
            [class.selected]="i === selectedIndex()"
            [attr.aria-label]="'Stop ' + (i + 1) + ' selection row'"
            (click)="selectStop(i)"
            (keydown.enter)="selectStop(i)"
            (keydown.space)="selectStop(i); $event.preventDefault()"
          >
            <button
              type="button"
              class="stop-swatch"
              [style.background]="s.color"
              [matMenuTriggerFor]="colorMenu"
              (click)="selectStop(i); $event.stopPropagation()"
              [attr.aria-label]="'Edit color of stop ' + (i + 1)"
              title="Edit color"
            ></button>
            <mat-menu #colorMenu="matMenu" panelClass="svge-picker-menu-panel">
              <div
                class="picker-host"
                role="presentation"
                (click)="$event.stopPropagation()"
                (keydown)="$event.stopPropagation()"
              >
                <svge-color-picker [color]="s.color" (colorChange)="onStopColorChange(i, $event)" />
              </div>
            </mat-menu>

            <input
              type="number"
              class="offset-input"
              min="0"
              max="100"
              step="1"
              [value]="Math.round(s.offset * 100)"
              [attr.aria-label]="'Offset of stop ' + (i + 1) + ' (percent)'"
              (change)="onOffsetChange(i, $any($event.target).value)"
              (click)="$event.stopPropagation()"
            />
            <span class="offset-unit">%</span>

            <button
              type="button"
              mat-icon-button
              class="remove-btn"
              [disabled]="g.stops.length <= 2"
              [attr.aria-label]="'Remove stop ' + (i + 1)"
              title="Remove stop"
              (click)="removeStop(i); $event.stopPropagation()"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>
        }
      </div>

      <div class="gradient-actions">
        <button type="button" class="action-btn" (click)="addStop()">
          <mat-icon>add</mat-icon>
          <span>Add stop</span>
        </button>
        <button type="button" class="action-btn" (click)="reverseStops()">
          <mat-icon>swap_horiz</mat-icon>
          <span>Reverse</span>
        </button>
      </div>
    } @else {
      <p class="empty">Select a node with a gradient fill to edit its stops.</p>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 8px 10px 12px;
      font-size: 12px;
    }
    .gradient-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--mat-sys-on-surface-variant, #5f6368);
      flex: 1;
    }
    .kind-toggle {
      display: inline-flex;
      gap: 2px;
    }
    .kind-btn {
      border: 1px solid var(--mat-sys-outline-variant, #c4c4c4);
      background: var(--mat-sys-surface-container, #f5f5f5);
      padding: 4px 8px;
      cursor: pointer;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      color: var(--mat-sys-on-surface-variant, #5f6368);
    }
    .kind-btn.active {
      background: var(--mat-sys-primary-container, #d6e4ff);
      color: var(--mat-sys-on-primary-container, #1a3370);
      border-color: var(--mat-sys-primary, #1976d2);
    }
    .kind-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .empty {
      color: var(--mat-sys-on-surface-variant, #5f6368);
      font-size: 11px;
      font-style: italic;
      margin: 6px 0 0;
    }

    .stops-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-bottom: 8px;
    }
    .stop-row {
      display: grid;
      grid-template-columns: 24px 1fr auto auto;
      align-items: center;
      gap: 6px;
      padding: 4px;
      border-radius: 4px;
      cursor: pointer;
    }
    .stop-row:hover {
      background: var(--mat-sys-surface-container-high, #ebebeb);
    }
    .stop-row.selected {
      background: var(--mat-sys-primary-container, #d6e4ff);
      outline: 1px solid var(--mat-sys-primary, #1976d2);
    }

    .stop-swatch {
      width: 24px;
      height: 24px;
      border: 1px solid rgba(0, 0, 0, 0.3);
      border-radius: 4px;
      cursor: pointer;
      padding: 0;
    }

    .offset-input {
      width: 48px;
      padding: 3px 4px;
      border: 1px solid var(--mat-sys-outline-variant, #c4c4c4);
      border-radius: 4px;
      background: var(--mat-sys-surface, #fff);
      color: var(--mat-sys-on-surface, #222);
      font: inherit;
      text-align: right;
    }
    .offset-unit {
      color: var(--mat-sys-on-surface-variant, #5f6368);
      font-size: 10px;
    }

    .remove-btn {
      width: 28px;
      height: 28px;
      --mdc-icon-button-state-layer-size: 28px;
      --mat-icon-button-touch-target-display: none;
    }
    .remove-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .gradient-actions {
      display: flex;
      gap: 6px;
    }
    .action-btn {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 6px 8px;
      border: 1px solid var(--mat-sys-outline-variant, #c4c4c4);
      background: var(--mat-sys-surface-container, #f5f5f5);
      color: var(--mat-sys-on-surface, #222);
      border-radius: 4px;
      cursor: pointer;
      font: inherit;
      font-size: 11px;
    }
    .action-btn:hover {
      background: var(--mat-sys-surface-container-high, #ebebeb);
    }
    .action-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .picker-host {
      padding: 8px;
      display: inline-block;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeGradientEditor {
  private readonly editing = inject(GradientEditingService);
  private readonly catalog = inject(GradientLibraryService);
  private readonly bus = inject(CommandBus);
  private readonly injector = inject(Injector);

  /** Expose `Math` so template can interpolate `Math.round` directly. */
  protected readonly Math = Math;

  /** Tick on every signal cycle so template re-evaluates after catalog.update(). */
  private readonly tick = signal(0);

  protected readonly selectedIndex = this.editing.selectedStopIndex;

  /**
   * Resolved gradient item from the catalog, gated on the active id.
   * Recomputes via `tick` after every mutation we dispatch (the
   * catalog signal also drives this, but tick ensures predictability
   * when in-place mutations happen during overlay drags).
   */
  protected readonly active = computed(() => {
    this.tick();
    const id = this.editing.activeGradientId();
    if (id === null) return null;
    return this.catalog.get(id);
  });

  // ── Stop mutations ────────────────────────────────────────────

  protected selectStop(index: number): void {
    this.editing.selectStop(index);
  }

  protected onStopColorChange(index: number, color: string): void {
    const id = this.editing.activeGradientId();
    if (id === null) return;
    const item = this.catalog.get(id);
    if (item === null) return;
    const stops = item.stops.map((s, i) => (i === index ? { ...s, color } : s));
    this.bus.dispatch(SetGradientCommand.for(this.injector, id, { stops }));
    this.tick.update((t) => t + 1);
  }

  protected onOffsetChange(index: number, valueStr: string): void {
    const v = Number(valueStr);
    if (Number.isNaN(v)) return;
    const offset = Math.max(0, Math.min(1, v / 100));
    const id = this.editing.activeGradientId();
    if (id === null) return;
    const item = this.catalog.get(id);
    if (item === null) return;
    const stops = item.stops.map((s, i) => (i === index ? { ...s, offset } : s));
    this.bus.dispatch(SetGradientCommand.for(this.injector, id, { stops }));
    this.tick.update((t) => t + 1);
  }

  protected removeStop(index: number): void {
    const id = this.editing.activeGradientId();
    if (id === null) return;
    const item = this.catalog.get(id);
    if (item === null) return;
    if (item.stops.length <= 2) return; // enforce min 2 stops
    const stops = item.stops.filter((_, i) => i !== index);
    this.bus.dispatch(SetGradientCommand.for(this.injector, id, { stops }));
    // Adjust selection: if removed selected, clear; if removed earlier, shift.
    const sel = this.editing.selectedStopIndex();
    if (sel === index) this.editing.selectStop(null);
    else if (sel !== null && sel > index) this.editing.selectStop(sel - 1);
    this.tick.update((t) => t + 1);
  }

  protected addStop(): void {
    const id = this.editing.activeGradientId();
    if (id === null) return;
    const item = this.catalog.get(id);
    if (item === null) return;
    // Insert at midpoint with interpolated color (matches overlay behavior).
    const offset = 0.5;
    const color = interpolateColor(item.stops, offset);
    const next: GradientStop = { offset, color };
    const stops = [...item.stops, next].sort((a, b) => a.offset - b.offset);
    this.bus.dispatch(SetGradientCommand.for(this.injector, id, { stops }));
    const newIdx = stops.findIndex((s) => s === next);
    this.editing.selectStop(newIdx);
    this.tick.update((t) => t + 1);
  }

  protected reverseStops(): void {
    const id = this.editing.activeGradientId();
    if (id === null) return;
    const item = this.catalog.get(id);
    if (item === null) return;
    const stops = item.stops.map((s) => ({ ...s, offset: 1 - s.offset })).reverse();
    this.bus.dispatch(SetGradientCommand.for(this.injector, id, { stops }));
    this.tick.update((t) => t + 1);
  }

  // ── Kind toggle ───────────────────────────────────────────────

  protected setKind(kind: GradientKind): void {
    const id = this.editing.activeGradientId();
    if (id === null) return;
    const item = this.catalog.get(id);
    if (item === null || item.kind === kind) return;
    this.bus.dispatch(SetGradientCommand.for(this.injector, id, { kind }));
    this.tick.update((t) => t + 1);
  }
}

// ── Color interpolation helpers (mirror of overlay's logic) ─────────

function interpolateColor(stops: readonly GradientStop[], offset: number): string {
  if (stops.length === 0) return '#808080';
  const sorted = [...stops].sort((a, b) => a.offset - b.offset);
  if (offset <= sorted[0]!.offset) return sorted[0]!.color;
  if (offset >= sorted.at(-1)!.offset) return sorted.at(-1)!.color;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (offset >= a.offset && offset <= b.offset) {
      const t = (offset - a.offset) / (b.offset - a.offset);
      return mixRgbHex(a.color, b.color, t);
    }
  }
  return sorted[0]!.color;
}

function mixRgbHex(a: string, b: string, t: number): string {
  const pa = parseRgb(a);
  const pb = parseRgb(b);
  if (pa === null || pb === null) return a;
  const r = Math.round(pa.r * (1 - t) + pb.r * t);
  const g = Math.round(pa.g * (1 - t) + pb.g * t);
  const bl = Math.round(pa.b * (1 - t) + pb.b * t);
  return `#${[r, g, bl].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function parseRgb(c: string): { r: number; g: number; b: number } | null {
  const hex = c.startsWith('#') ? c.slice(1) : c;
  if (hex.length === 3) {
    const r = parseInt(hex[0]!.repeat(2), 16);
    const g = parseInt(hex[1]!.repeat(2), 16);
    const b = parseInt(hex[2]!.repeat(2), 16);
    if ([r, g, b].every((v) => !Number.isNaN(v))) return { r, g, b };
  }
  if (hex.length === 6) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].every((v) => !Number.isNaN(v))) return { r, g, b };
  }
  return null;
}
