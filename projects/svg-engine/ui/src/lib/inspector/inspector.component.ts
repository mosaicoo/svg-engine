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
import { SelectionService } from 'svg-engine/edit';
import { EllipseFieldPipe, LineFieldPipe, RectFieldPipe } from './inspector-pipes';

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
                  [value]="node | rectField: 'x'"
                  (change)="setNumber('x', $any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>y</mat-label>
                <input
                  matInput
                  type="number"
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
                  [value]="node | ellipseField: 'cx'"
                  (change)="setNumber('cx', $any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>cy</mat-label>
                <input
                  matInput
                  type="number"
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
                  [value]="node | lineField: 'x1'"
                  (change)="setNumber('x1', $any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>y1</mat-label>
                <input
                  matInput
                  type="number"
                  [value]="node | lineField: 'y1'"
                  (change)="setNumber('y1', $any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>x2</mat-label>
                <input
                  matInput
                  type="number"
                  [value]="node | lineField: 'x2'"
                  (change)="setNumber('x2', $any($event.target).value)"
                />
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>y2</mat-label>
                <input
                  matInput
                  type="number"
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
          <label class="field-row">
            <span class="lbl">fill</span>
            <input
              type="color"
              [value]="styleColor('fill')"
              (change)="setStyle('fill', $any($event.target).value)"
            />
          </label>
          <label class="field-row">
            <span class="lbl">stroke</span>
            <input
              type="color"
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
      gap: 6px;
      font-size: 12px;
    }
    .field-row .lbl {
      flex: 1;
      color: var(--mat-sys-on-surface-variant, #777);
    }
    .field-row input[type='color'] {
      flex: 0 0 36px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 4px;
      cursor: pointer;
      background: transparent;
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

  /** Currently focused node, or `null` (no/multi selection or stale id). */
  protected readonly focusNode: Signal<SvgNode | null> = computed(() => {
    const id = this.selection.focusId();
    if (id === null) return null;
    if (this.selection.count() > 1) return null;
    return findNodeById(this.state.document().root, id);
  });

  protected readonly selectionCount = this.selection.count;

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

  protected styleColor(field: 'fill' | 'stroke'): string {
    const node = this.focusNode();
    if (node === null) return '#000000';
    const v = node.style[field];
    // Color inputs require `#RRGGBB` — non-hex values (e.g., 'none',
    // 'rgb(...)', 'url(#grad)') get a placeholder. Setting via the
    // picker still works and overwrites the original value.
    return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '#cccccc';
  }

  protected styleNumber(field: 'strokeWidth' | 'opacity'): string {
    const node = this.focusNode();
    if (node === null) return '';
    const v = node.style[field];
    return typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
  }

  /**
   * Set a top-level numeric property on the focused node. Drops empty
   * input or non-finite values silently (the user is mid-edit; we
   * don't want to commit `0` for `''` since `Number('')` is `0`).
   */
  protected setNumber(field: string, raw: string): void {
    const node = this.focusNode();
    if (node === null) return;
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
    if (node.style[field] === value) return;
    const nextStyle: SvgStyle = { ...node.style, [field]: value };
    this.bus.dispatch(new SetPropertyCommand(node.id, 'style', nextStyle));
  }

  /** Same as {@link setStyle} but parses + validates a numeric string first. */
  protected setStyleNumber(field: keyof SvgStyle, raw: string): void {
    const node = this.focusNode();
    if (node === null) return;
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
