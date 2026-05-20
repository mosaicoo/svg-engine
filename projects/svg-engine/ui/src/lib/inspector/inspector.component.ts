import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuTrigger } from '@angular/material/menu';
import {
  CommandBus,
  ConvertNodeToPathCommand,
  decomposeTransform,
  EditorStateService,
  findNodeById,
  type NodeId,
  type Point,
  ResizeNodeCommand,
  RotateNodeCommand,
  SetPropertyCommand,
  SetStylePropertyOnManyCommand,
  type SvgNode,
  type SvgStyle,
} from 'svg-engine/core';
import {
  type BBoxAnchor,
  getRenderedNodeBBox,
  getRenderedParentMatrix,
  LayersService,
  SelectionService,
  TransformService,
} from 'svg-engine/edit';
import { SvgeColorPalette } from '../color-palette/color-palette.component';
import { SvgeColorPicker } from '../color-picker/color-picker.component';
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
    MatIconButton,
    MatMenu,
    MatMenuTrigger,
    SvgeColorPalette,
    SvgeColorPicker,
    RectFieldPipe,
    EllipseFieldPipe,
    LineFieldPipe,
  ],
  // role="region" announces the inspector as a top-level landmark; the
  // aria-label gives it an accessible name distinct from the other
  // panels (layers, toolbar). SR users can jump straight to "Properties".
  host: {
    role: 'region',
    'aria-label': 'Properties inspector',
  },
  template: `
    @if (focusNode(); as node) {
      <header class="inspector-header" data-mode="single">
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

      <!--
        Transform section (Item 5 — débito 4c-Polish): decomposed
        rotation + scale numeric inputs + 3×3 pivot picker. Translation
        is already covered by the per-type geometry inputs (e.g.,
        rect x/y) so we don't duplicate it here. Single-edit only —
        decomposition of mixed-selection transforms is ill-defined.
      -->
      <section class="section">
        <h3 class="section-title">Transform</h3>
        <div class="grid">
          <mat-form-field appearance="outline">
            <mat-label>rotation°</mat-label>
            <input
              matInput
              type="number"
              step="1"
              [disabled]="isLocked()"
              [value]="transformRotationDeg()"
              (change)="setTransformRotationDeg($any($event.target).value)"
            />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>scale x</mat-label>
            <input
              matInput
              type="number"
              step="0.1"
              [disabled]="isLocked()"
              [value]="transformScaleX()"
              (change)="setTransformScale($any($event.target).value, transformScaleY())"
            />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>scale y</mat-label>
            <input
              matInput
              type="number"
              step="0.1"
              [disabled]="isLocked()"
              [value]="transformScaleY()"
              (change)="setTransformScale(transformScaleX(), $any($event.target).value)"
            />
          </mat-form-field>
          <button
            type="button"
            class="reset-btn"
            [disabled]="isLocked()"
            (click)="resetTransform()"
            aria-label="Reset rotation and scale to defaults, keeping translation"
            title="Reset rotation + scale (keeps translation)"
          >
            Reset
          </button>
        </div>
        <!-- Pivot picker: 3×3 grid + center. Clicking sets the focused
             node's pivot to the corresponding anchor of its bbox. -->
        <div class="pivot-row">
          <span class="pivot-label">pivot</span>
          <div class="pivot-grid" role="group" aria-label="Pivot anchor">
            @for (a of pivotAnchors; track a) {
              <button
                type="button"
                class="pivot-dot"
                [class.active]="currentPivotAnchor() === a"
                [attr.aria-label]="'Pivot ' + a"
                [attr.title]="'Pivot ' + a"
                (click)="setPivotAnchor(a)"
              ></button>
            }
          </div>
          <button
            type="button"
            class="reset-btn"
            (click)="resetPivot()"
            aria-label="Reset pivot to bounding-box center"
            title="Reset pivot to bbox center"
          >
            Reset
          </button>
        </div>
      </section>

      <!--
        Convert to Path button: visible only for non-path leaf nodes
        (rect/ellipse/line/polygon/polyline) — gives the user access
        to the Path Editor + Pathfinder for primitives that weren't
        authored as paths. Group/text/image hidden (no equivalent
        path semantic in v1).
      -->
      @if (canConvertToPath()) {
        <section class="section">
          <h3 class="section-title">Path operations</h3>
          <button
            type="button"
            class="reset-btn"
            [disabled]="isLocked()"
            (click)="convertToPath()"
            title="Convert this shape to an editable path"
          >
            Convert to Path
          </button>
        </section>
      }

      <section class="section">
        <h3 class="section-title">Style</h3>
        <!--
          Style section reorganised by topic (Photoshop/Figma/Affinity
          convention): Fill, Stroke and Appearance as subsections. The
          .color-cell + .active-target + .field-row selectors are kept
          intact so existing specs continue to pass — only the visual
          grouping changes (stacked rows instead of side-by-side cells).
        -->
        <div class="grid color-grid">
          <!-- ── Fill subsection ────────────────────────────────── -->
          <div class="style-subsection" aria-labelledby="style-fill-title">
            <h4 id="style-fill-title" class="style-subsection-title">Fill</h4>
            <div class="color-cell" [class.active-target]="activeColorTarget() === 'fill'">
              <label
                class="field-row"
                [class.disabled]="isLocked()"
                (pointerdown)="setActiveColorTarget('fill')"
              >
                <span class="lbl">color</span>
                <span
                  class="swatch"
                  [class.show-checker]="swatchShowChecker('fill')"
                  [style.background-color]="swatchColorWithAlpha('fill')"
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
              <!--
                Bloco 4-Alpha: separate alpha slider per color field
                (Figma/Affinity pattern). Native <input type="color"> is
                RGB-only; we expose fillOpacity / strokeOpacity here so
                users can control transparency without leaving the row.
              -->
              <input
                type="number"
                class="alpha-input"
                min="0"
                max="1"
                step="0.05"
                aria-label="Fill alpha"
                title="Fill alpha (0 = transparent, 1 = opaque)"
                [disabled]="isLocked()"
                [value]="styleAlpha('fillOpacity')"
                (change)="setStyleNumber('fillOpacity', $any($event.target).value)"
              />
              <!--
                Advanced picker trigger (Sprint C). Opens the pro-grade
                colour picker (sat/val + hue + HEX/RGB + recents +
                eyedropper) via mat-menu. The native swatch + hidden
                color input above remain as the quick-pick path — this
                button is purely additive so all existing UX continues
                to work for users who don't need the advanced controls.
              -->
              <button
                mat-icon-button
                type="button"
                class="picker-trigger-btn"
                [matMenuTriggerFor]="fillPickerMenu"
                [disabled]="isLocked()"
                aria-label="Open advanced fill colour picker"
                title="Advanced picker (hex, RGB, eyedropper, recent colours)"
              >
                <mat-icon>palette</mat-icon>
              </button>
              <mat-menu #fillPickerMenu="matMenu" xPosition="before" yPosition="below">
                <div
                  class="picker-host"
                  role="presentation"
                  (click)="$event.stopPropagation()"
                  (keydown)="$event.stopPropagation()"
                >
                  <svge-color-picker
                    [color]="styleColor('fill')"
                    (colorChange)="setStyle('fill', $event)"
                  />
                </div>
              </mat-menu>
            </div>
            <!--
              Palette swatches strip (Bloco 4d): clicking applies the
              picked color to whichever color field (fill/stroke) was
              last activated via pointerdown on its label. Default
              target is 'fill', so visually it makes more sense to
              place the palette right below the fill row.
            -->
            <svge-color-palette class="palette-strip" (colorPicked)="onPalettePick($event)" />
          </div>

          <!-- ── Stroke subsection ──────────────────────────────── -->
          <div class="style-subsection" aria-labelledby="style-stroke-title">
            <h4 id="style-stroke-title" class="style-subsection-title">Stroke</h4>
            <div class="color-cell" [class.active-target]="activeColorTarget() === 'stroke'">
              <label
                class="field-row"
                [class.disabled]="isLocked()"
                (pointerdown)="setActiveColorTarget('stroke')"
              >
                <span class="lbl">color</span>
                <span
                  class="swatch"
                  [class.show-checker]="swatchShowChecker('stroke')"
                  [style.background-color]="swatchColorWithAlpha('stroke')"
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
              <input
                type="number"
                class="alpha-input"
                min="0"
                max="1"
                step="0.05"
                aria-label="Stroke alpha"
                title="Stroke alpha (0 = transparent, 1 = opaque)"
                [disabled]="isLocked()"
                [value]="styleAlpha('strokeOpacity')"
                (change)="setStyleNumber('strokeOpacity', $any($event.target).value)"
              />
              <button
                mat-icon-button
                type="button"
                class="picker-trigger-btn"
                [matMenuTriggerFor]="strokePickerMenu"
                [disabled]="isLocked()"
                aria-label="Open advanced stroke colour picker"
                title="Advanced picker (hex, RGB, eyedropper, recent colours)"
              >
                <mat-icon>palette</mat-icon>
              </button>
              <mat-menu #strokePickerMenu="matMenu" xPosition="before" yPosition="below">
                <div
                  class="picker-host"
                  role="presentation"
                  (click)="$event.stopPropagation()"
                  (keydown)="$event.stopPropagation()"
                >
                  <svge-color-picker
                    [color]="styleColor('stroke')"
                    (colorChange)="setStyle('stroke', $event)"
                  />
                </div>
              </mat-menu>
            </div>
            <!-- Stroke width lives next to stroke colour — same topic. -->
            <mat-form-field appearance="outline" class="full-width-field">
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
          </div>

          <!-- ── Appearance subsection (opacity affects everything) ── -->
          <div class="style-subsection" aria-labelledby="style-appearance-title">
            <h4 id="style-appearance-title" class="style-subsection-title">Appearance</h4>
            <mat-form-field appearance="outline" class="full-width-field">
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
        </div>
      </section>
    } @else if (multiEditableIds().length > 1) {
      <!-- Multi-edit panel (Item 1 - débito 4c): style fields apply
           atomically to all unlocked selected nodes via one undo entry. -->
      <header class="inspector-header" data-mode="multi">
        <mat-icon class="type-icon" aria-hidden="true">filter_none</mat-icon>
        <span class="type-label">Multi-selection</span>
        <span class="id-label">{{ multiEditableIds().length }} editable</span>
      </header>
      <section class="section">
        <h3 class="section-title">Style (applies to all)</h3>
        <!-- Same Fill / Stroke / Appearance grouping as the single-
             selection path. 'placeholder=mixed' surfaces when N
             selected nodes don't agree on the value. -->
        <div class="grid color-grid">
          <div class="style-subsection" aria-labelledby="multi-style-fill-title">
            <h4 id="multi-style-fill-title" class="style-subsection-title">Fill</h4>
            <div class="color-cell" [class.active-target]="activeColorTarget() === 'fill'">
              <label class="field-row" (pointerdown)="setActiveColorTarget('fill')">
                <span class="lbl">color</span>
                <span
                  class="swatch"
                  [class.show-checker]="swatchShowChecker('fill')"
                  [style.background-color]="swatchColorWithAlpha('fill')"
                  [title]="rawStyleColor('fill')"
                  aria-hidden="true"
                ></span>
                <input
                  type="color"
                  class="color-input-hidden"
                  aria-label="Pick fill color (applies to all)"
                  [value]="styleColor('fill')"
                  (change)="setStyle('fill', $any($event.target).value)"
                />
              </label>
              <input
                type="number"
                class="alpha-input"
                min="0"
                max="1"
                step="0.05"
                aria-label="Fill alpha (applies to all)"
                [value]="styleAlpha('fillOpacity')"
                [placeholder]="hasMixedStyle('fillOpacity') ? 'mixed' : ''"
                (change)="setStyleNumber('fillOpacity', $any($event.target).value)"
              />
            </div>
            <svge-color-palette class="palette-strip" (colorPicked)="onPalettePick($event)" />
          </div>

          <div class="style-subsection" aria-labelledby="multi-style-stroke-title">
            <h4 id="multi-style-stroke-title" class="style-subsection-title">Stroke</h4>
            <div class="color-cell" [class.active-target]="activeColorTarget() === 'stroke'">
              <label class="field-row" (pointerdown)="setActiveColorTarget('stroke')">
                <span class="lbl">color</span>
                <span
                  class="swatch"
                  [class.show-checker]="swatchShowChecker('stroke')"
                  [style.background-color]="swatchColorWithAlpha('stroke')"
                  [title]="rawStyleColor('stroke')"
                  aria-hidden="true"
                ></span>
                <input
                  type="color"
                  class="color-input-hidden"
                  aria-label="Pick stroke color (applies to all)"
                  [value]="styleColor('stroke')"
                  (change)="setStyle('stroke', $any($event.target).value)"
                />
              </label>
              <input
                type="number"
                class="alpha-input"
                min="0"
                max="1"
                step="0.05"
                aria-label="Stroke alpha (applies to all)"
                [value]="styleAlpha('strokeOpacity')"
                [placeholder]="hasMixedStyle('strokeOpacity') ? 'mixed' : ''"
                (change)="setStyleNumber('strokeOpacity', $any($event.target).value)"
              />
            </div>
            <mat-form-field appearance="outline" class="full-width-field">
              <mat-label>stroke-width</mat-label>
              <input
                matInput
                type="number"
                min="0"
                step="0.5"
                [value]="styleNumber('strokeWidth')"
                [placeholder]="hasMixedStyle('strokeWidth') ? 'mixed' : ''"
                (change)="setStyleNumber('strokeWidth', $any($event.target).value)"
              />
            </mat-form-field>
          </div>

          <div class="style-subsection" aria-labelledby="multi-style-appearance-title">
            <h4 id="multi-style-appearance-title" class="style-subsection-title">Appearance</h4>
            <mat-form-field appearance="outline" class="full-width-field">
              <mat-label>opacity</mat-label>
              <input
                matInput
                type="number"
                min="0"
                max="1"
                step="0.05"
                [value]="styleNumber('opacity')"
                [placeholder]="hasMixedStyle('opacity') ? 'mixed' : ''"
                (change)="setStyleNumber('opacity', $any($event.target).value)"
              />
            </mat-form-field>
          </div>
        </div>
      </section>
    } @else if (selectionCount() > 1) {
      <p class="placeholder">
        <mat-icon aria-hidden="true">lock</mat-icon>
        Multi-selection ({{ selectionCount() }}) — all locked.
      </p>
    } @else {
      <p class="placeholder">
        <mat-icon aria-hidden="true">info</mat-icon>
        No selection.
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      /* overflow-x: hidden defends against any descendant pushing
         content past the (typically narrow ~280-320px) sidebar width.
         min-width: 0 lets descendant flex/grid items shrink past
         intrinsic content width (otherwise long inputs/labels would
         force horizontal scroll). Together these prevent the
         "horizontal scrollbar inside inspector" symptom the user
         reported after the Sprint C picker buttons were added. */
      overflow-x: hidden;
      overflow-y: auto;
      min-width: 0;
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
      min-width: 0;
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
      min-width: 0;
    }
    /* Min-width: 0 lets mat-form-field shrink past its content's
       intrinsic width — without this, long mat-label text would push
       the cell wider than the column and overflow the sidebar. */
    .grid > * {
      min-width: 0;
    }
    mat-form-field {
      width: 100%;
    }
    /* Standalone full-width form field inside a single-column flow
       (Style subsections). Equivalent to wrapping in a .grid with a
       single child, but avoids the wrapper div. */
    .full-width-field {
      width: 100%;
      display: block;
      margin-top: 4px;
    }
    /* Color grid was 2-col (fill | stroke side-by-side). Now 1-col
       (stacked vertically) — matches Photoshop/Figma/Affinity grouping
       and prevents horizontal overflow when the sidebar is narrow.
       Adding the advanced picker button per row in Sprint C pushed the
       2-col layout past the typical 280-320px sidebar width. */
    .color-grid {
      grid-template-columns: 1fr;
      margin-bottom: 0;
      gap: 4px;
    }
    /* Style subsections (Fill / Stroke / Appearance) — visual grouping
       with a tiny header that mirrors Figma's "section within a
       section" pattern. Keeps the colour, its alpha + strokeWidth on
       semantically related rows. */
    .style-subsection {
      margin-top: 8px;
      padding-top: 6px;
      border-top: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      min-width: 0;
    }
    .style-subsection:first-of-type {
      margin-top: 0;
      padding-top: 0;
      border-top: none;
    }
    .style-subsection-title {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--mat-sys-on-surface-variant, #999);
      margin: 0 0 4px;
      font-weight: 500;
    }
    /* Bloco 4-Alpha: a cell groups the color row + its alpha input.
       The active-target ring (Bloco 4d palette routing) moves from the
       <label> to the cell so it visually wraps both color and alpha. */
    .color-cell {
      display: flex;
      align-items: center;
      gap: 4px;
      padding-left: 5px;
      margin-left: -8px;
      border-radius: 2px;
      min-width: 0;
    }
    .color-cell.active-target {
      box-shadow: inset 3px 0 0 0 var(--mat-sys-primary, #1976d2);
    }
    .color-cell .field-row {
      flex: 1 1 auto;
      min-width: 0;
      margin: 0;
      padding: 0;
    }
    .alpha-input {
      flex: 0 0 44px;
      width: 44px;
      box-sizing: border-box;
      font-size: 11px;
      padding: 2px 4px;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 3px;
      background: var(--mat-sys-surface, #fff);
      color: var(--mat-sys-on-surface, inherit);
    }
    .alpha-input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    /* Advanced picker trigger — small icon button to the right of the
       alpha input. Stays unobtrusive; users discover via tooltip. */
    .picker-trigger-btn {
      width: 28px;
      height: 28px;
      line-height: 28px;
      flex: 0 0 28px;
      padding: 0;
    }
    .picker-trigger-btn .mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    /* Inner container of the mat-menu popover — keeps the picker from
       inheriting unwanted menu styling (padding 0, no min-width). */
    .picker-host {
      padding: 0;
      cursor: default;
    }
    .field-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      cursor: pointer;
      /* position: relative is REQUIRED so the absolutely-positioned
         .color-input-hidden anchors inside the row instead of
         escaping to the initial containing block (viewport). The
         native color picker dialog opens NEAR its input element —
         without this, the picker would pop up in the top-left
         corner of the page (Bloco 4-IP-FixBugs). */
      position: relative;
    }
    .field-row.disabled {
      cursor: not-allowed;
    }
    /* Bloco 4d active-target highlight moved from .field-row to the
       wrapping .color-cell so the accent ring wraps both color row
       and alpha input — see .color-cell.active-target below.
       The .field-row.active-target rule kept as no-op so old specs
       that still query the class pass. */
    .field-row.active-target {
      /* intentionally empty — moved up to .color-cell.active-target */
    }
    .palette-strip {
      display: block;
      margin: 6px 0 2px;
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

       Bloco 4z-fixes4: checkerboard backdrop is now CONDITIONAL via
       the .show-checker class, added only when the color is transparent
       or alpha < 1. Solid opaque fills render as a clean solid chip
       (no polka dots). */
    .field-row .swatch {
      flex: 0 0 28px;
      width: 28px;
      height: 22px;
      border-radius: 4px;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      transition: border-color 120ms;
    }
    .field-row .swatch.show-checker {
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
       can still reach + change colors.

       Positioned to overlay the swatch (left:36px = swatch right edge +
       gap) so the browser's native color-picker popover anchors NEXT TO
       the swatch instead of in the viewport corner. The 1px-by-1px size
       + opacity 0 keeps it invisible; pointer-events:none lets clicks
       fall through to the parent <label>, which then dispatches a
       programmatic click to this input — opening the picker. */
    .color-input-hidden {
      position: absolute;
      top: 50%;
      left: 36px;
      width: 1px;
      height: 1px;
      opacity: 0;
      overflow: hidden;
      pointer-events: none;
      margin: 0;
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
    /* Transform / Pivot section (Item 5 — débito 4c-Polish) */
    .reset-btn {
      grid-column: span 2;
      font-size: 11px;
      padding: 4px 8px;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 4px;
      background: transparent;
      color: var(--mat-sys-on-surface, inherit);
      cursor: pointer;
    }
    .reset-btn:hover:not(:disabled) {
      background: var(--mat-sys-surface-container-high, #eee);
    }
    .reset-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .pivot-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 8px 0 0;
    }
    .pivot-label {
      flex: 1 1 auto;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #777);
    }
    .pivot-grid {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: repeat(3, 12px);
      grid-template-rows: repeat(3, 12px);
      gap: 4px;
    }
    .pivot-dot {
      width: 12px;
      height: 12px;
      padding: 0;
      border-radius: 50%;
      border: 1px solid var(--mat-sys-outline-variant, #bbb);
      background: var(--mat-sys-surface, #fff);
      cursor: pointer;
      transition: transform 80ms;
    }
    .pivot-dot:hover {
      transform: scale(1.2);
      border-color: var(--mat-sys-primary, #1976d2);
    }
    .pivot-dot.active {
      background: var(--mat-sys-primary, #1976d2);
      border-color: var(--mat-sys-primary, #1976d2);
    }
    .pivot-row .reset-btn {
      grid-column: auto;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeInspector {
  private readonly state = inject(EditorStateService);
  private readonly selection = inject(SelectionService);
  private readonly bus = inject(CommandBus);
  private readonly layers = inject(LayersService);
  private readonly transformService = inject(TransformService);

  /**
   * The 8 anchors of the bbox, in the order shown by the 3×3 pivot
   * picker (Item 5 — débito 4c-Polish). `mc` (middle-center) is the
   * default and rendered as the active anchor whenever a custom pivot
   * is NOT set.
   */
  protected readonly pivotAnchors: readonly BBoxAnchor[] = [
    'tl',
    'tc',
    'tr',
    'ml',
    'mc',
    'mr',
    'bl',
    'bc',
    'br',
  ];

  /** Currently focused node, or `null` (no/multi selection or stale id). */
  protected readonly focusNode: Signal<SvgNode | null> = computed(() => {
    const id = this.selection.focusId();
    if (id === null) return null;
    if (this.selection.count() > 1) return null;
    return findNodeById(this.state.document().root, id);
  });

  protected readonly selectionCount = this.selection.count;

  /**
   * Editable ids = the set of selected nodes that style writes will
   * apply to (Item 1 — débito 4c multi-edit).
   *
   * - Single selection (unlocked): one id → single-edit behavior
   *   identical to pre-multi-edit
   * - Multi-selection: ALL unlocked selected ids → writes apply
   *   atomically via `SetStylePropertyOnManyCommand`
   * - Empty when nothing is selected or everything selected is locked
   *
   * Locked nodes are filtered defensively here too — `SelectionService`
   * already prunes locked from the selection set, but if a future
   * consumer programmatically forces them in, the inspector still
   * refuses to write to them.
   */
  protected readonly multiEditableIds = computed<readonly NodeId[]>(() =>
    Array.from(this.selection.selectedIds()).filter((id) => !this.layers.isLocked(id)),
  );

  /**
   * Tracks which color field (`fill` or `stroke`) the palette strip
   * should write to. Updated by `pointerdown` on either color label so
   * the palette routes to the user's most recent intent. Defaults to
   * `'fill'` (the most-commonly-edited field per Figma/Affinity
   * telemetry). Visually mirrored back via the `.active-target` class
   * on the corresponding row so the user knows where the next palette
   * click will go.
   */
  protected readonly activeColorTarget = signal<'fill' | 'stroke'>('fill');
  protected setActiveColorTarget(target: 'fill' | 'stroke'): void {
    this.activeColorTarget.set(target);
  }

  /**
   * Apply a swatch from `<svge-color-palette>` to the active color
   * field. Lock and "same value" checks live inside `setStyle()` so
   * we don't duplicate them here.
   */
  protected onPalettePick(color: string): void {
    this.setStyle(this.activeColorTarget(), color);
  }

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
   * The "common" value of `field` across all currently-editable nodes
   * (Item 1 — débito 4c multi-edit). Returns:
   *
   * - `undefined` when no editable nodes exist (no selection / all locked)
   * - The shared value when every editable node has the same value
   *   for `field` (single-selection always falls into this case)
   * - A `MIXED` sentinel when at least two nodes disagree (only
   *   reachable in multi-selection)
   *
   * The sentinel is distinguishable from `undefined` so the template
   * can show different states ("empty input" vs "mixed placeholder").
   */
  protected commonStyleValue<K extends keyof SvgStyle>(
    field: K,
  ): SvgStyle[K] | typeof MIXED | undefined {
    const ids = this.editableIdsForStyle();
    if (ids.length === 0) return undefined;
    const doc = this.state.document();
    let value: SvgStyle[K] | undefined;
    let first = true;
    for (const id of ids) {
      const node = findNodeById(doc.root, id);
      if (node === null) continue;
      const v = node.style[field];
      if (first) {
        value = v;
        first = false;
      } else if (v !== value) {
        return MIXED;
      }
    }
    return value;
  }

  /**
   * True when the editable selection has mixed values for `field` —
   * UI uses this to show a "mixed" placeholder on number/text inputs.
   */
  protected hasMixedStyle(field: keyof SvgStyle): boolean {
    return this.commonStyleValue(field) === MIXED;
  }

  /**
   * Resolves the id list that style writes target. Single mode: the
   * focused node id (when present and unlocked). Multi mode: every
   * unlocked selected id. Empty when nothing can be written.
   */
  private editableIdsForStyle(): readonly NodeId[] {
    const focus = this.focusNode();
    if (focus !== null) return this.layers.isLocked(focus.id) ? [] : [focus.id];
    return this.multiEditableIds();
  }

  /**
   * Value bound to the `<input type="color">` picker. Color inputs only
   * accept `#RRGGBB`, so non-hex values are NORMALIZED to hex via
   * {@link cssColorToHex6}. Special non-paint values (`'none'`,
   * `'url(...)'`, `'transparent'`) fall through to neutral. Mixed
   * values in multi-edit also fall through to neutral (picker can't
   * display "mixed").
   */
  protected styleColor(field: 'fill' | 'stroke'): string {
    const v = this.commonStyleValue(field);
    if (v === MIXED || v === undefined) return '#cccccc';
    if (typeof v !== 'string') return '#cccccc';
    if (v === 'none' || v === 'transparent' || v.startsWith('url(')) return '#cccccc';
    return cssColorToHex6(v) ?? '#cccccc';
  }

  /**
   * Raw CSS color value drives the visual swatch. In multi-edit mode
   * with mixed values, returns `'transparent'` so the swatch shows
   * the checkerboard ("the color isn't uniform").
   */
  protected rawStyleColor(field: 'fill' | 'stroke'): string {
    const v = this.commonStyleValue(field);
    if (v === MIXED || v === undefined) return 'transparent';
    return typeof v === 'string' && v.length > 0 ? v : 'transparent';
  }

  /**
   * Same as {@link rawStyleColor} but composes the alpha into the
   * color so the swatch visually reflects transparency too —
   * checkerboard shows through semi-transparent colors.
   */
  protected swatchColorWithAlpha(field: 'fill' | 'stroke'): string {
    const raw = this.rawStyleColor(field);
    if (raw === 'transparent') return raw;
    const alphaField: 'fillOpacity' | 'strokeOpacity' =
      field === 'fill' ? 'fillOpacity' : 'strokeOpacity';
    const alpha = this.commonStyleValue(alphaField);
    if (alpha === MIXED || alpha === undefined || typeof alpha !== 'number' || alpha >= 1) {
      return raw;
    }
    if (alpha <= 0) return 'transparent';
    const hex = cssColorToHex6(raw);
    if (hex === null) return raw;
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Whether the swatch for `field` should render the checkerboard
   * backdrop. True when the underlying paint is "see-through" (color
   * is `'transparent'` / `'none'` / undefined, OR alpha < 1, OR
   * the value is mixed across multi-edit selection).
   */
  protected swatchShowChecker(field: 'fill' | 'stroke'): boolean {
    if (this.hasMixedStyle(field)) return true;
    const raw = this.rawStyleColor(field);
    if (raw === 'transparent' || raw === 'none') return true;
    const alphaField: 'fillOpacity' | 'strokeOpacity' =
      field === 'fill' ? 'fillOpacity' : 'strokeOpacity';
    const alpha = this.commonStyleValue(alphaField);
    return typeof alpha === 'number' && Number.isFinite(alpha) && alpha < 1;
  }

  /**
   * String value bound to the per-color alpha input. SVG defaults to
   * 1 — we surface that explicitly so the user always sees a concrete
   * number to edit. Multi-edit mixed values render as empty.
   */
  protected styleAlpha(field: 'fillOpacity' | 'strokeOpacity'): string {
    const v = this.commonStyleValue(field);
    if (v === MIXED) return '';
    if (typeof v === 'number' && Number.isFinite(v)) return v.toFixed(2);
    return '1';
  }

  /**
   * String value bound to the numeric style inputs (`strokeWidth`,
   * `opacity`). Mixed values in multi-edit render empty (placeholder
   * shows "mixed").
   */
  protected styleNumber(field: 'strokeWidth' | 'opacity'): string {
    const v = this.commonStyleValue(field);
    if (v === MIXED) return '';
    if (typeof v === 'number' && Number.isFinite(v)) {
      return field === 'opacity' ? v.toFixed(2) : String(roundForDisplay(v));
    }
    // SVG defaults: opacity = 1 (full opaque), stroke-width = 1
    return '1';
  }

  // ── Transform decomposition (Item 5 — débito 4c-Polish) ──────

  /** Decomposed transform of the focused node (single-edit only). */
  private readonly decomposed = computed(() => {
    const node = this.focusNode();
    if (node === null) return null;
    return decomposeTransform(node.transform);
  });

  protected transformRotationDeg(): string {
    const d = this.decomposed();
    if (d === null) return '';
    return ((d.rotationRad * 180) / Math.PI).toFixed(1);
  }

  protected transformScaleX(): string {
    const d = this.decomposed();
    if (d === null) return '';
    return d.scaleX.toFixed(2);
  }

  protected transformScaleY(): string {
    const d = this.decomposed();
    if (d === null) return '';
    return d.scaleY.toFixed(2);
  }

  /**
   * Apply a new ABSOLUTE rotation (in degrees) to the focused node,
   * preserving its geometric position the same way the canvas
   * rotation-handle drag does.
   *
   * **Why not the previous raw `composeTransform` approach**: that
   * variant decomposed the existing transform, swapped the rotation
   * slot, and recomposed — but composeTransform recomposes around the
   * matrix ORIGIN (0,0). That's wrong as soon as the node has a
   * translation, an editor-defined pivot, or lives inside a group:
   * the shape drifts away from its visual location with every keystroke.
   *
   * **New approach** (mirrors `TransformService.endRotate`): compute
   * the DELTA between the requested absolute angle and the current
   * decomposed rotation, then dispatch a `RotateNodeCommand(nodeId,
   * deltaRad, pivot)`. The command applies `T(pivot)·R(Δ)·T(-pivot)·existing`
   * — preserving everything else (translation, scale, prior rotation
   * composed inside) and keeping the pivot point stationary.
   *
   * The pivot is resolved from the editor state (custom per-node pivot
   * or the bbox center) via `TransformService.resolvePivot(bbox)`, so
   * the inspector matches the same crosshair the user sees on canvas.
   */
  protected setTransformRotationDeg(raw: string): void {
    const node = this.focusNode();
    if (node === null || this.layers.isLocked(node.id)) return;
    const deg = parseNumericInput(raw);
    if (deg === null) return;
    const targetRad = (deg * Math.PI) / 180;
    const decomposed = decomposeTransform(node.transform);
    const deltaRad = targetRad - decomposed.rotationRad;
    if (Math.abs(deltaRad) < 1e-6) return;
    const pivot = this.resolveCommandPivot(node.id);
    this.bus.dispatch(new RotateNodeCommand(node.id, deltaRad, pivot));
  }

  /**
   * Apply new ABSOLUTE scale factors to the focused node, preserving
   * the pivot point's visual position. Mirrors `TransformService.endResize`
   * by dispatching `ResizeNodeCommand` with an anchor (the editor's
   * pivot, in doc coords) and the SCALE DELTA from the node's current
   * scale to the requested values.
   *
   * Same drift problem as rotation: a raw `composeTransform({scaleX,
   * scaleY})` recomposes around origin (0,0), so any node not at
   * origin would teleport. Using `ResizeNodeCommand` with the
   * editor's pivot (= same point the user expects the shape to be
   * "anchored" to) keeps the shape visually in place except for the
   * intended size change.
   *
   * `parentMatrix` is captured so the command's transform-aware path
   * (added in the latest sprint) kicks in when the node lives inside
   * a translated/rotated group.
   */
  protected setTransformScale(rawX: string | number, rawY: string | number): void {
    const node = this.focusNode();
    if (node === null || this.layers.isLocked(node.id)) return;
    const sx = typeof rawX === 'number' ? rawX : parseNumericInput(rawX);
    const sy = typeof rawY === 'number' ? rawY : parseNumericInput(rawY);
    if (sx === null || sy === null) return;
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
    if (sx === 0 || sy === 0) return; // would collapse the shape — refuse
    const decomposed = decomposeTransform(node.transform);
    const deltaSx = sx / decomposed.scaleX;
    const deltaSy = sy / decomposed.scaleY;
    if (Math.abs(deltaSx - 1) < 1e-6 && Math.abs(deltaSy - 1) < 1e-6) return;
    const anchor = this.resolveCommandPivot(node.id);
    const parentMatrix = this.resolveParentMatrix(node.id);
    this.bus.dispatch(new ResizeNodeCommand(node.id, anchor, deltaSx, deltaSy, parentMatrix));
  }

  /**
   * Resolve the pivot point in document coordinates for command
   * dispatch — same source the canvas uses (`TransformService.resolvePivot`),
   * so inspector and canvas behave identically when the user sets a
   * custom pivot.
   *
   * Returns the rendered bbox center as a safe default when the node
   * isn't rendered yet (avoids a `null` pivot which would crash the
   * command).
   */
  private resolveCommandPivot(nodeId: NodeId): Point {
    const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
    const bbox = svg !== null ? getRenderedNodeBBox(svg, nodeId) : null;
    const fallbackBBox = bbox ?? { x: 0, y: 0, width: 0, height: 0 };
    return this.transformService.resolvePivot(fallbackBBox);
  }

  /**
   * Composed ancestor transform of the node (NOT including self) —
   * required by `ResizeNodeCommand` so the bake math is correct for
   * shapes inside translated/rotated groups. Mirrors what
   * `SelectionOverlay.onResizeHandlePointerDown` does for the canvas
   * drag path.
   *
   * Returns `null` (= identity) when the SVG isn't rendered yet or
   * the node lives directly under the SVG root.
   */
  private resolveParentMatrix(nodeId: NodeId) {
    const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
    if (svg === null) return null;
    return getRenderedParentMatrix(svg, nodeId);
  }

  /**
   * Reset rotation + scale to identity, keeping the translation
   * components literally. Useful for "I got lost in the transforms"
   * recovery — semantically "clear the matrix" not "preserve visual
   * position". The user can re-arrange by editing geometry x/y or
   * by dragging in the canvas afterwards.
   *
   * **Why a raw SetPropertyCommand** (different from rotation/scale
   * fields, which dispatch RotateNodeCommand/ResizeNodeCommand):
   * - The other field handlers apply an ABSOLUTE target via a delta;
   *   they pivot around the editor's pivot to keep visual position
   *   stable across keystrokes (so 30→31° doesn't teleport the shape).
   * - "Reset", by contrast, is a single mechanical action: produce
   *   a clean `[1, 0, 0, 1, e, f]` matrix. Anchoring it to the pivot
   *   would generally NOT collapse rotation+scale to identity — it
   *   would smear them into the translation. That contradicts the
   *   user's intent here (and breaks the pre-existing reset test).
   */
  protected resetTransform(): void {
    const node = this.focusNode();
    if (node === null || this.layers.isLocked(node.id)) return;
    const next: import('svg-engine/core').Transform = [
      1,
      0,
      0,
      1,
      node.transform[4],
      node.transform[5],
    ];
    if (
      next[0] === node.transform[0] &&
      next[1] === node.transform[1] &&
      next[2] === node.transform[2] &&
      next[3] === node.transform[3]
    ) {
      return;
    }
    this.bus.dispatch(new SetPropertyCommand(node.id, 'transform', next));
  }

  // ── Convert to Path (gateway to Path Editor + Pathfinder) ──

  /**
   * `true` when the focused node is a non-path leaf type that the
   * `ConvertNodeToPathCommand` knows how to handle. Drives the
   * visibility of the "Convert to Path" button in the Path
   * operations section.
   *
   * Hidden for paths (no-op), groups (not handled in v1), text and
   * image (no geometric equivalent).
   */
  protected readonly canConvertToPath = computed(() => {
    const node = this.focusNode();
    if (node === null) return false;
    return (
      node.type === 'rect' ||
      node.type === 'ellipse' ||
      node.type === 'line' ||
      node.type === 'polygon' ||
      node.type === 'polyline'
    );
  });

  /** Dispatch the ConvertNodeToPathCommand for the focused node. */
  protected convertToPath(): void {
    const node = this.focusNode();
    if (node === null || this.layers.isLocked(node.id)) return;
    if (!this.canConvertToPath()) return;
    this.bus.dispatch(new ConvertNodeToPathCommand(node.id));
  }

  // ── Pivot picker (Item 5 — débito 4c-Polish) ────────────────

  /**
   * Currently-active anchor of the focused node's pivot, or `'mc'`
   * (default center) when no custom pivot is set OR the custom pivot
   * doesn't match any of the 8 named anchors. The 3×3 picker uses
   * this to highlight the active dot.
   */
  protected readonly currentPivotAnchor = computed<BBoxAnchor>(() => {
    const node = this.focusNode();
    if (node === null) return 'mc';
    const customPivots = this.transformService.customPivots();
    const local = customPivots.get(node.id);
    if (local === undefined) return 'mc'; // default
    // The custom pivot is stored in NODE-LOCAL coords (0..1 fractional
    // along bbox). Match against the 9 anchor positions.
    const eps = 1e-3;
    const closeX = (a: number, b: number): boolean => Math.abs(a - b) < eps;
    const x = local.x;
    const y = local.y;
    let xName: 'l' | 'c' | 'r';
    let yName: 't' | 'm' | 'b';
    if (closeX(x, 0)) xName = 'l';
    else if (closeX(x, 0.5)) xName = 'c';
    else if (closeX(x, 1)) xName = 'r';
    else return 'mc'; // arbitrary custom pivot — none of the 9 anchors active
    if (closeX(y, 0)) yName = 't';
    else if (closeX(y, 0.5)) yName = 'm';
    else if (closeX(y, 1)) yName = 'b';
    else return 'mc';
    // Compose: e.g., y=t, x=l → 'tl'; y=m, x=c → 'mc'
    return (yName + xName) as BBoxAnchor;
  });

  /**
   * Set the focused node's pivot to one of the 9 bbox anchors. Looks
   * up the rendered bbox via the SVG root (queried from the document —
   * inspector and renderer share the same DOM tree). No-op when no
   * SVG root or no rendered element (e.g., during initial mount).
   */
  protected setPivotAnchor(anchor: BBoxAnchor): void {
    const node = this.focusNode();
    if (node === null) return;
    const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
    if (svg === null) return;
    const bbox = getRenderedNodeBBox(svg, node.id);
    if (bbox === null) return;
    this.transformService.setPivotAnchorForNode(node.id, anchor, bbox);
  }

  protected resetPivot(): void {
    this.transformService.resetPivot();
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
   * Set a string-valued style field (`fill`, `stroke`, etc.) on every
   * editable selected node atomically. Single selection produces a
   * 1-node multi-edit (same observable effect as the old SetPropertyCommand
   * path); multi-selection writes to all in one undo entry.
   *
   * **Dedup**: skipped when the new value equals the current common
   * value (avoids a no-op undo entry on touch-without-change UIs).
   */
  protected setStyle(field: keyof SvgStyle, value: string): void {
    const ids = this.editableIdsForStyle();
    if (ids.length === 0) return;
    const current = this.commonStyleValue(field);
    if (current !== MIXED && current === value) return;
    this.bus.dispatch(new SetStylePropertyOnManyCommand(ids, field, value));
  }

  /** Numeric variant of {@link setStyle}: parses + validates first. */
  protected setStyleNumber(field: keyof SvgStyle, raw: string): void {
    const ids = this.editableIdsForStyle();
    if (ids.length === 0) return;
    const value = parseNumericInput(raw);
    if (value === null) return;
    const current = this.commonStyleValue(field);
    if (current !== MIXED && current === value) return;
    this.bus.dispatch(new SetStylePropertyOnManyCommand(ids, field, value));
  }
}

/**
 * Sentinel returned by {@link SvgeInspector.commonStyleValue} to
 * distinguish "values are mixed across multi-selection" from "value
 * is undefined everywhere". Module-level `unique symbol` so the
 * `typeof MIXED` type works in the method's return-type union.
 */
const MIXED: unique symbol = Symbol('mixed');

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

/**
 * Normalize any CSS color string to a 6-character `#RRGGBB` hex (lower-
 * case). Returns `null` when the input can't be interpreted as a color
 * (`'none'`, `'url(#grad)'`, malformed, etc. — callers handle the
 * fallback). Used by the inspector's color picker to seed the native
 * `<input type="color">` so it opens at the **real** model color (e.g.
 * a `hsl(...)` from a generative palette) instead of the gray default.
 *
 * Strategy — short-circuits in order of decreasing cheapness:
 * 1. `#rrggbb` / `#rgb` → regex match, no DOM
 * 2. `rgb(...)` / `rgba(...)` → pure-JS parse, no DOM
 * 3. `hsl(...)` / `hsla(...)` → pure-JS parse + HSL→RGB conversion
 * 4. Named colors / exotic syntaxes → Canvas `fillStyle` round-trip
 *    (DOM required; safely returns `null` in non-browser contexts
 *    or when Canvas isn't fully implemented — e.g., jsdom)
 *
 * Alpha is discarded — native `<input type="color">` doesn't support it.
 *
 * Why not just always use Canvas: jsdom's Canvas impl is incomplete
 * (writing `fillStyle` doesn't normalize), so tests can't rely on it.
 * The pure-JS paths also avoid one DOM allocation per inspector update.
 */
export function cssColorToHex6(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  // Already 6-char hex → fast path.
  if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
  // 3-char shorthand hex → expand without touching DOM.
  const short = trimmed.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (short !== null) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  }
  const fromRgb = parseRgbToHex(trimmed);
  if (fromRgb !== null) return fromRgb;
  const fromHsl = parseHslToHex(trimmed);
  if (fromHsl !== null) return fromHsl;
  // Last resort: Canvas round-trip for named/lab/lch/system colors. In
  // jsdom the round-trip may return an object or stay unchanged; we
  // detect that and return null so callers fall back to gray.
  if (typeof document === 'undefined') return null;
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx === null) return null;
  const sentinel = '#000000';
  ctx.fillStyle = sentinel;
  ctx.fillStyle = trimmed;
  const out = ctx.fillStyle;
  if (typeof out !== 'string') return null;
  if (/^#[0-9a-f]{6}$/i.test(out)) return out.toLowerCase();
  return parseRgbToHex(out);
}

function parseRgbToHex(input: string): string | null {
  // CSS accepts both comma-separated (legacy) and whitespace-separated
  // (CSS Color 4) forms. We match both, plus optional `rgba(`/`/ a` tail
  // (alpha is discarded).
  const m = input.match(
    /^rgba?\(\s*(-?\d+(?:\.\d+)?%?)\s*[, ]\s*(-?\d+(?:\.\d+)?%?)\s*[, ]\s*(-?\d+(?:\.\d+)?%?)\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i,
  );
  if (m === null) return null;
  const r = parseChannel(m[1]!);
  const g = parseChannel(m[2]!);
  const b = parseChannel(m[3]!);
  if (r === null || g === null || b === null) return null;
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

function parseHslToHex(input: string): string | null {
  // hsl(H, S%, L%) or hsl(H S% L%) with optional alpha. Hue in degrees
  // (with optional 'deg'/'turn'/'rad'/'grad' unit), S/L are percentages.
  const m = input.match(
    /^hsla?\(\s*(-?\d+(?:\.\d+)?)(deg|rad|grad|turn)?\s*[, ]\s*(-?\d+(?:\.\d+)?)%\s*[, ]\s*(-?\d+(?:\.\d+)?)%\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/i,
  );
  if (m === null) return null;
  let h = Number.parseFloat(m[1]!);
  const unit = m[2]?.toLowerCase();
  if (unit === 'rad') h = (h * 180) / Math.PI;
  else if (unit === 'grad') h = h * 0.9;
  else if (unit === 'turn') h = h * 360;
  // Normalize hue to [0, 360)
  h = ((h % 360) + 360) % 360;
  const s = clamp01(Number.parseFloat(m[3]!) / 100);
  const l = clamp01(Number.parseFloat(m[4]!) / 100);
  const { r, g, b } = hslToRgb(h, s, l);
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

function parseChannel(raw: string): number | null {
  if (raw.endsWith('%')) {
    const pct = Number.parseFloat(raw.slice(0, -1));
    if (!Number.isFinite(pct)) return null;
    return Math.round(clamp01(pct / 100) * 255);
  }
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function toHex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

/**
 * HSL→RGB per CSS Color spec (https://www.w3.org/TR/css-color-3/#hsl-color).
 * Returns 8-bit RGB channels (0..255 inclusive).
 */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  // h in [0, 360), s/l in [0, 1]
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hPrime = h / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hPrime < 1) {
    r1 = c;
    g1 = x;
  } else if (hPrime < 2) {
    r1 = x;
    g1 = c;
  } else if (hPrime < 3) {
    g1 = c;
    b1 = x;
  } else if (hPrime < 4) {
    g1 = x;
    b1 = c;
  } else if (hPrime < 5) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }
  const m = l - c / 2;
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}
