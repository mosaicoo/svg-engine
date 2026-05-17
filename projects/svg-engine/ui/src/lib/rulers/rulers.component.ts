import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WorkspaceService } from 'svg-engine/edit';
import { ViewportService } from 'svg-engine/render';

/**
 * Top + left rulers showing document-space coordinates (Bloco 4f).
 * HTML/CSS overlay — not SVG — so labels remain crisp at any zoom and
 * the ruler thickness stays fixed in CSS pixels independent of the
 * viewBox transform.
 *
 * **Layout contract**: the caller positions this component as a
 * fixed-thickness overlay above + left of the canvas. The rulers'
 * own dimensions are 100% × 100% of the parent — the top strip spans
 * the full width, the left strip the full height. The canvas content
 * area is offset inside the parent (CSS responsibility of the shell).
 *
 * **Tick generation**: derives a "nice" tick spacing from the current
 * viewBox width and a target of ~8-12 visible major ticks. Picks from
 * the 1/2/5 multiples of 10ⁿ scale (the standard ruler heuristic).
 * Minor ticks at 1/5 of major spacing.
 *
 * **Visibility**: respects `WorkspaceService.rulers().enabled` —
 * renders nothing when disabled (CSS reserves no space when the host
 * gets `[hidden]` from the consumer; this component doesn't toggle
 * the host visibility itself).
 */
@Component({
  selector: 'svge-rulers',
  standalone: true,
  template: `
    @if (visible()) {
      <div class="ruler ruler-h" aria-hidden="true">
        @for (t of horizontalTicks(); track t.key) {
          <div
            class="tick"
            [class.major]="t.major"
            [style.left.%]="t.percent"
            [attr.data-label]="t.major ? t.label : null"
          ></div>
        }
      </div>
      <div class="ruler ruler-v" aria-hidden="true">
        @for (t of verticalTicks(); track t.key) {
          <div
            class="tick"
            [class.major]="t.major"
            [style.top.%]="t.percent"
            [attr.data-label]="t.major ? t.label : null"
          ></div>
        }
      </div>
      <div class="corner" aria-hidden="true"></div>
    }
  `,
  styles: `
    /* Ruler thickness — bumped from 20→24 so the label has room to
       render comfortably alongside the tick marks at 10px font. */
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
      pointer-events: none;
      font-family: ui-monospace, monospace;
      font-size: 10px;
      line-height: 12px;
      color: var(--mat-sys-on-surface, #222);
    }
    .ruler {
      position: absolute;
      background: var(--mat-sys-surface-container-low, #f5f5f5);
      border: 1px solid var(--mat-sys-outline-variant, #ddd);
    }
    .ruler-h {
      top: 0;
      left: 24px;
      right: 0;
      height: 24px;
      border-left: 0;
      overflow: hidden;
    }
    .ruler-v {
      top: 24px;
      left: 0;
      bottom: 0;
      width: 24px;
      border-top: 0;
      overflow: hidden;
    }
    .corner {
      position: absolute;
      top: 0;
      left: 0;
      width: 24px;
      height: 24px;
      background: var(--mat-sys-surface-container, #eee);
      border-right: 1px solid var(--mat-sys-outline-variant, #ddd);
      border-bottom: 1px solid var(--mat-sys-outline-variant, #ddd);
    }
    .tick {
      position: absolute;
    }
    /* Horizontal layout:
       - Label at TOP (0..12px) so the user reads it naturally
       - Tick line at BOTTOM (minor 18..24, major 12..24) — major is
         taller so it visually anchors the label above it. */
    .ruler-h .tick {
      bottom: 0;
      width: 0;
      height: 6px;
      border-left: 1px solid var(--mat-sys-outline-variant, #bbb);
    }
    .ruler-h .tick.major {
      height: 12px;
      border-left-color: var(--mat-sys-on-surface-variant, #777);
    }
    .ruler-h .tick.major[data-label]::after {
      content: attr(data-label);
      position: absolute;
      top: -12px;
      left: 2px;
      white-space: nowrap;
      color: var(--mat-sys-on-surface, #333);
    }
    /* Vertical layout (mirror image):
       - Label rotated 90° CCW on the LEFT side
       - Tick line on the RIGHT side */
    .ruler-v .tick {
      right: 0;
      width: 6px;
      height: 0;
      border-top: 1px solid var(--mat-sys-outline-variant, #bbb);
    }
    .ruler-v .tick.major {
      width: 12px;
      border-top-color: var(--mat-sys-on-surface-variant, #777);
    }
    .ruler-v .tick.major[data-label]::after {
      content: attr(data-label);
      position: absolute;
      top: 2px;
      left: -10px;
      white-space: nowrap;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      color: var(--mat-sys-on-surface, #333);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeRulers {
  private readonly ws = inject(WorkspaceService);
  private readonly viewport = inject(ViewportService);

  protected readonly visible = computed(() => this.ws.rulers().enabled);

  protected readonly horizontalTicks = computed(() =>
    generateTicks(this.viewport.viewBox().x, this.viewport.viewBox().width),
  );
  protected readonly verticalTicks = computed(() =>
    generateTicks(this.viewport.viewBox().y, this.viewport.viewBox().height),
  );
}

/**
 * Compute ruler ticks covering `[start, start+span]`. Returns up to
 * ~5×N tick records (5 minor per major) with percent positions inside
 * the span — letting the template `[style.left.%]` / `[style.top.%]`
 * lay them out without DOM measurement.
 *
 * **"Nice" major spacing**: from {1, 2, 5} × 10ⁿ, picks the largest
 * value that still produces ≥ ~8 major ticks across the span. This
 * is the textbook ruler / axis-tick heuristic (matches Matplotlib,
 * d3-scale, Photoshop).
 */
function generateTicks(
  start: number,
  span: number,
): readonly { key: string; percent: number; major: boolean; label: string }[] {
  if (span <= 0 || !Number.isFinite(span)) return [];
  const targetMajors = 8;
  const rawStep = span / targetMajors;
  const major = niceTickSpacing(rawStep);
  const minor = major / 5;
  const out: { key: string; percent: number; major: boolean; label: string }[] = [];
  // Iterate minor ticks; mark every 5th as major.
  const firstMinor = Math.ceil(start / minor);
  const lastMinor = Math.floor((start + span) / minor);
  for (let i = firstMinor; i <= lastMinor; i++) {
    const value = i * minor;
    const percent = ((value - start) / span) * 100;
    const isMajor = i % 5 === 0;
    out.push({
      key: `t${i}`,
      percent,
      major: isMajor,
      label: isMajor ? formatLabel(value) : '',
    });
  }
  return out;
}

function niceTickSpacing(raw: number): number {
  if (raw <= 0 || !Number.isFinite(raw)) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const magnitude = Math.pow(10, exponent);
  const normalized = raw / magnitude; // in [1, 10)
  let nice: number;
  if (normalized < 1.5) nice = 1;
  else if (normalized < 3.5) nice = 2;
  else if (normalized < 7.5) nice = 5;
  else nice = 10;
  return nice * magnitude;
}

function formatLabel(value: number): string {
  // Strip trailing zeros; cap at 2 decimals to avoid noisy labels.
  if (Math.abs(value) >= 1000) {
    return `${Math.round(value)}`;
  }
  if (Math.abs(value) >= 1 || value === 0) {
    return `${Math.round(value * 100) / 100}`;
  }
  return value.toFixed(2);
}
