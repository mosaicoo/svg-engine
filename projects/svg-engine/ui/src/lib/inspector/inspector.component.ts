import { ChangeDetectionStrategy, Component, computed, inject, type Signal } from '@angular/core';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import {
  CommandBus,
  EditorStateService,
  findNodeById,
  SetPropertyCommand,
  type SvgNode,
  type SvgStyle,
} from 'svg-engine/core';
import { LayersService, SelectionService } from 'svg-engine/edit';
import { EllipseFieldPipe, LineFieldPipe, RectFieldPipe, roundForDisplay } from './inspector-pipes';

/**
 * Property inspector (Fase 4 Bloco 4c). Reactive panel showing the
 * editable properties of the currently focused node.
 *
 * **States**:
 * - **No selection** → "No selection" placeholder.
 * - **Multi-selection** → "Multiple selection" placeholder with count.
 *   Multi-edit (apply same value across N nodes) is a future polish —
 *   it requires either a `SetPropertyOnManyCommand` or N `SetPropertyCommand`
 *   wrapped in a single undo entry. Defer to refinement block.
 * - **Single selection** → header (type + id slice) + sections:
 *   - **Geometry** (per `node.type`): rect/ellipse/line numeric inputs.
 *     Polygon/polyline/path/text/image deferred (need richer editors).
 *     Group has no inherent geometry — section is omitted.
 *   - **Style**: fill, stroke (color inputs), strokeWidth (number),
 *     opacity (number 0-1).
 *
 * **Commits**: each `(change)` event (fired on blur or Enter for inputs;
 * on close for color pickers) dispatches a `SetPropertyCommand` via
 * `CommandBus` — single undo entry per field edit.
 *
 * **Why no per-keystroke commits**: typing "1500" through "1", "15",
 * "150", "1500" would push 4 entries on the undo stack. `(change)` fires
 * once when the user finishes (blur/Enter/picker-close), giving the
 * expected one-edit-one-undo UX.
 *
 * **Why no Material slider for opacity**: keeps imports minimal in v1.
 * Slider is a refinement (Bloco 4c-Polish) along with color pickers
 * powered by `PaletteRegistry` (4d).
 *
 * Usage:
 * ```html
 * <svge-inspector></svge-inspector>
 * ```
 */
@Component({
  selector: 'svge-inspector',
  standalone: true,
  imports: [
    MatFormField,
    MatLabel,
    MatInput,
    MatIcon,
    RectFieldPipe,
    EllipseFieldPipe,
    LineFieldPipe,
  ],
  template: `
    @if (focusNode(); as node) {
      <header class="inspector-header">
        <mat-icon class="type-icon" aria-hidden="true">{{ typeIcon(node) }}</mat-icon>
        <span class="type-label">{{ node.type }}</span>
        <span class="id-label" [title]="node.id">{{ node.id.slice(0, 8) }}</span>
      </header>

      @switch (node.type) {
        @case ('rect') {
          <section class="section">
            <h3 class="section-title">Geometry</h3>
            <div class="grid">
              <mat-form-field appearance="outline">
                <mat-label>x</mat-label>
                <input
                  matInput
                  type="number"
                  [disabled]="isLocked()"
                  [value]="node | rectField: 'x'"
                  (change)="setNumber('x', $any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>y</mat-label>
                <input
                  matInput
                  type="number"
                  [disabled]="isLocked()"
                  [value]="node | rectField: 'y'"
                  (change)="setNumber('y', $any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>w</mat-label>
                <input
                  matInput
                  type="number"
                  min="0"
                  [disabled]="isLocked()"
                  [value]="node | rectField: 'width'"
                  (change)="setNumber('width', $any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>h</mat-label>
                <input
                  matInput
                  type="number"
                  min="0"
                  [disabled]="isLocked()"
                  [value]="node | rectField: 'height'"
                  (change)="setNumber('height', $any($event.target).value)"
                />
              </mat-form-field>
            </div>
          </section>
        }
        @case ('ellipse') {
          <section class="section">
            <h3 class="section-title">Geometry</h3>
            <div class="grid">
              <mat-form-field appearance="outline">
                <mat-label>cx</mat-label>
                <input
                  matInput
                  type="number"
                  [disabled]="isLocked()"
                  [value]="node | ellipseField: 'cx'"
                  (change)="setNumber('cx', $any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>cy</mat-label>
                <input
                  matInput
                  type="number"
                  [disabled]="isLocked()"
                  [value]="node | ellipseField: 'cy'"
                  (change)="setNumber('cy', $any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>rx</mat-label>
                <input
                  matInput
                  type="number"
                  min="0"
                  [disabled]="isLocked()"
                  [value]="node | ellipseField: 'rx'"
                  (change)="setNumber('rx', $any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>ry</mat-label>
                <input
                  matInput
                  type="number"
                  min="0"
                  [disabled]="isLocked()"
                  [value]="node | ellipseField: 'ry'"
                  (change)="setNumber('ry', $any($event.target).value)"
                />
              </mat-form-field>
            </div>
          </section>
        }
        @case ('line') {
          <section class="section">
            <h3 class="section-title">Geometry</h3>
            <div class="grid">
              <mat-form-field appearance="outline">
                <mat-label>x1</mat-label>
                <input
                  matInput
                  type="number"
                  [disabled]="isLocked()"
                  [value]="node | lineField: 'x1'"
                  (change)="setNumber('x1', $any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>y1</mat-label>
                <input
                  matInput
                  type="number"
                  [disabled]="isLocked()"
                  [value]="node | lineField: 'y1'"
                  (change)="setNumber('y1', $any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>x2</mat-label>
                <input
                  matInput
                  type="number"
                  [disabled]="isLocked()"
                  [value]="node | lineField: 'x2'"
                  (change)="setNumber('x2', $any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>y2</mat-label>
                <input
                  matInput
                  type="number"
                  [disabled]="isLocked()"
                  [value]="node | lineField: 'y2'"
                  (change)="setNumber('y2', $any($event.target).value)"
                />
              </mat-form-field>
            </div>
          </section>
        }
        @default {
          @if (node.type !== 'group') {
            <section class="section">
              <h3 class="section-title">Geometry</h3>
              <p class="placeholder small">
                Editing geometry of <strong>{{ node.type }}</strong> nodes here is not yet supported
                — use the canvas tools.
              </p>
            </section>
          }
        }
      }

      <section class="section">
        <h3 class="section-title">Style</h3>
        <div class="grid color-grid">
          <label class="field-row" [class.disabled]="isLocked()">
            <span class="lbl">fill</span>
            <span
              class="swatch"
              [style.background-color]="rawStyleColor('fill')"
              [title]="rawStyleColor('fill')"
              aria-hidden="true"
            ></span>
            <input
              type="color"
              class="color-input-hidden"
              aria-label="Pick fill color"
              [disabled]="isLocked()"
              [value]="styleColor('fill')"
              (change)="setStyle('fill', $any($event.target).value)"
            />
          </label>
          <label class="field-row" [class.disabled]="isLocked()">
            <span class="lbl">stroke</span>
            <span
              class="swatch"
              [style.background-color]="rawStyleColor('stroke')"
              [title]="rawStyleColor('stroke')"
              aria-hidden="true"
            ></span>
            <input
              type="color"
              class="color-input-hidden"
              aria-label="Pick stroke color"
              [disabled]="isLocked()"
              [value]="styleColor('stroke')"
              (change)="setStyle('stroke', $any($event.target).value)"
            />
          </label>
        </div>
        <div class="grid">
          <mat-form-field appearance="outline">
            <mat-label>stroke-width</mat-label>
            <input
              matInput
              type="number"
              min="0"
              step="0.5"
              [disabled]="isLocked()"
              [value]="styleNumber('strokeWidth')"
              (change)="setStyleNumber('strokeWidth', $any($event.target).value)"
            />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>opacity</mat-label>
            <input
              matInput
              type="number"
              min="0"
              max="1"
              step="0.05"
              [disabled]="isLocked()"
              [value]="styleNumber('opacity')"
              (change)="setStyleNumber('opacity', $any($event.target).value)"
            />
          </mat-form-field>
        </div>
      </section>
    } @else {
      @if (selectionCount() > 1) {
        <p class="placeholder">
          <mat-icon aria-hidden="true">filter_none</mat-icon>
          Multiple selection ({{ selectionCount() }}) — multi-edit pending.
        </p>
      } @else {
        <p class="placeholder">
          <mat-icon aria-hidden="true">info</mat-icon>
          No selection.
        </p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      overflow-y: auto;
      font-size: 13px;
      background: var(--mat-sys-surface-container, #fafafa);
      padding: 0;
    }
    .inspector-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #ddd);
      background: var(--mat-sys-surface-container-high, #f0f0f0);
    }
    .inspector-header .type-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      line-height: 20px;
      opacity: 0.75;
    }
    .inspector-header .type-label {
      font-weight: 500;
      text-transform: capitalize;
    }
    .inspector-header .id-label {
      margin-left: auto;
      font-family: monospace;
      font-size: 11px;
      opacity: 0.6;
    }
    .section {
      padding: 8px 16px 4px;
    }
    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--mat-sys-on-surface-variant, #777);
      margin: 0 0 6px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 8px;
    }
    mat-form-field {
      width: 100%;
    }
    .color-grid {
      grid-template-columns: 1fr 1fr;
      margin-bottom: 8px;
    }
    .field-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      cursor: pointer;
    }
    .field-row.disabled {
      cursor: not-allowed;
    }
    .field-row .lbl {
      flex: 1;
      color: var(--mat-sys-on-surface-variant, #777);
    }
    /* Bloco 4-IP-Fix: single visible color chip (swatch). The native
       <input type="color"> is visually hidden but kept in the DOM as
       a sibling of this <label>'s text; clicking the label opens the
       native picker via the browser's label-input association. Result:
       one element to look at AND to click (Figma/Affinity pattern).

       Background-image draws a checkerboard backdrop so transparent /
       semi-transparent fills show through. The [style.background-color]
       binding paints the real model color on top. */
    .field-row .swatch {
      flex: 0 0 28px;
      width: 28px;
      height: 22px;
      border-radius: 4px;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
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
      transition: border-color 120ms;
    }
    .field-row:not(.disabled):hover .swatch {
      border-color: var(--mat-sys-primary, #1976d2);
    }
    .field-row.disabled .swatch {
      opacity: 0.5;
    }
    /* Native color input visually hidden — clicking the parent <label>
       still opens its picker dialog (browsers: label-for-input association).
       Kept tab-focusable (NOT removed via display:none) so keyboard users
       can still reach + change colors. */
    .color-input-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      opacity: 0;
      overflow: hidden;
      pointer-events: none;
      margin: -1px;
      padding: 0;
      border: 0;
    }
    .placeholder {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 16px;
      color: var(--mat-sys-on-surface-variant, #777);
      font-style: italic;
    }
    .placeholder.small {
      font-size: 12px;
      padding: 4px 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeInspector {
  private readonly state = inject(EditorStateService);
  private readonly selection = inject(SelectionService);
  private readonly bus = inject(CommandBus);
  private readonly layers = inject(LayersService);

  /** Currently focused node, or `null` (no/multi selection or stale id). */
  protected readonly focusNode: Signal<SvgNode | null> = computed(() => {
    const id = this.selection.focusId();
    if (id === null) return null;
    if (this.selection.count() > 1) return null;
    return findNodeById(this.state.document().root, id);
  });

  protected readonly selectionCount = this.selection.count;

  /**
   * Defense-in-depth: under normal operation `SelectionService` filters
   * locked ids, so a locked node should never become focused (and the
   * inspector renders the "No selection" placeholder instead). This
   * computed exists so that if some future consumer manually sets
   * focus on a locked id (bypassing `SelectionService`), the inputs
   * still disable and the setters short-circuit. Cheap insurance.
   */
  protected readonly isLocked = computed(() => {
    const node = this.focusNode();
    return node !== null && this.layers.isLocked(node.id);
  });

  /**
   * Material icon name for the node's type. Mirrors the layers panel
   * convention so consumers get visual consistency across panels.
   */
  protected typeIcon(node: SvgNode): string {
    switch (node.type) {
      case 'group':
        return 'folder';
      case 'rect':
        return 'rectangle';
      case 'ellipse':
        return 'circle';
      case 'line':
        return 'show_chart';
      case 'polygon':
        return 'pentagon';
      case 'polyline':
        return 'timeline';
      case 'path':
        return 'gesture';
      case 'text':
        return 'text_fields';
      case 'image':
        return 'image';
    }
  }

  /**
   * Value bound to the `<input type="color">` picker. Color inputs
   * require `#RRGGBB` — non-hex values (e.g., `'rgb(...)'`, `'hsl(...)'`,
   * `'none'`, `'url(#grad)'`) get a neutral fallback. The **real** current
   * color is shown in the swatch element next to the picker via
   * {@link rawStyleColor} (any CSS color string).
   */
  protected styleColor(field: 'fill' | 'stroke'): string {
    const node = this.focusNode();
    if (node === null) return '#000000';
    const v = node.style[field];
    return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#cccccc';
  }

  /**
   * Raw CSS color value from the model (any format the user/plugin set
   * — hex, rgb, hsl, named, url). Drives the visual swatch next to the
   * picker so the user always sees the **actual** current color even
   * when it's not a 6-char hex (which the native `<input type="color">`
   * can't render). `'transparent'` when the field is undefined.
   */
  protected rawStyleColor(field: 'fill' | 'stroke'): string {
    const node = this.focusNode();
    if (node === null) return 'transparent';
    const v = node.style[field];
    return typeof v === 'string' && v.length > 0 ? v : 'transparent';
  }

  /**
   * String value bound to the numeric style inputs. Rounded to integer
   * for `strokeWidth` (display-only — model preserves precision when
   * user edits). `opacity` shows 2 decimals and defaults to `'1'` when
   * the model has no explicit value (the SVG implicit default), so the
   * input always shows a concrete number instead of Material's floating
   * label placeholder.
   */
  protected styleNumber(field: 'strokeWidth' | 'opacity'): string {
    const node = this.focusNode();
    if (node === null) return '';
    const v = node.style[field];
    if (typeof v === 'number' && Number.isFinite(v)) {
      return field === 'opacity' ? v.toFixed(2) : String(roundForDisplay(v));
    }
    // SVG defaults: opacity = 1 (full opaque), stroke-width = 1
    return field === 'opacity' ? '1' : '1';
  }

  /**
   * Set a top-level numeric property on the focused node. Drops empty
   * input or non-finite values silently (the user is mid-edit; we
   * don't want to commit `0` for `''` since `Number('')` is `0`).
   */
  protected setNumber(field: string, raw: string): void {
    const node = this.focusNode();
    if (node === null) return;
    if (this.layers.isLocked(node.id)) return; // lock enforcement
    const value = parseNumericInput(raw);
    if (value === null) return;
    if ((node as unknown as Record<string, number>)[field] === value) return;
    this.bus.dispatch(
      new SetPropertyCommand<SvgNode, never>(node.id, field as never, value as never),
    );
  }

  /**
   * Set a string-valued style field (`fill`, `stroke`, etc.) on the
   * focused node by replacing the entire `style` object — required
   * because `SetPropertyCommand` works on top-level keys only.
   */
  protected setStyle(field: keyof SvgStyle, value: string): void {
    const node = this.focusNode();
    if (node === null) return;
    if (this.layers.isLocked(node.id)) return; // lock enforcement
    if (node.style[field] === value) return;
    const nextStyle: SvgStyle = { ...node.style, [field]: value };
    this.bus.dispatch(new SetPropertyCommand(node.id, 'style', nextStyle));
  }

  /** Same as {@link setStyle} but parses + validates a numeric string first. */
  protected setStyleNumber(field: keyof SvgStyle, raw: string): void {
    const node = this.focusNode();
    if (node === null) return;
    if (this.layers.isLocked(node.id)) return; // lock enforcement
    const value = parseNumericInput(raw);
    if (value === null) return;
    if (node.style[field] === value) return;
    const nextStyle: SvgStyle = { ...node.style, [field]: value };
    this.bus.dispatch(new SetPropertyCommand(node.id, 'style', nextStyle));
  }
}

/**
 * Parse a numeric input value, returning `null` for empty / whitespace
 * / non-finite. Distinct from `Number(raw)` which returns `0` for `''`
 * (would silently overwrite the field with zero on accidental clear).
 */
function parseNumericInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const v = Number(trimmed);
  return Number.isFinite(v) ? v : null;
}
