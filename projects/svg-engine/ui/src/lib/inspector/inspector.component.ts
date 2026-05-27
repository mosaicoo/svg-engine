import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  signal,
  type Signal,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuTrigger } from '@angular/material/menu';
import { MatOption, MatSelect } from '@angular/material/select';
import {
  BatchConvertToPathCommand,
  type BoundingBox,
  CommandBus,
  decomposeTransform,
  DeletePageCommand,
  EditorStateService,
  findNodeById,
  type FlipAxis,
  FlipNodeCommand,
  getPageName,
  getPageViewBox,
  GroupSelectionCommand,
  isGroupNode,
  isPage,
  isSmartObject,
  type NodeId,
  type Point,
  type ReorderDirection,
  RenamePageCommand,
  ReorderNodeCommand,
  ResizeNodeCommand,
  ResizePageCommand,
  RotateNodeCommand,
  SetPropertyCommand,
  SetStylePropertyOnManyCommand,
  type SvgNode,
  type SvgStyle,
  type TextNode,
  UngroupCommand,
  walk,
} from 'svg-engine/core';
import {
  type AlignAxis,
  AlignmentService,
  type BBoxAnchor,
  ClipPathLibraryService,
  type DistributeAxis,
  getRenderedNodeBBox,
  getRenderedParentMatrix,
  LayersService,
  MaskLibraryService,
  type NodeBBox,
  SelectionService,
  SmartObjectActionsService,
  TransformService,
} from 'svg-engine/edit';
import { SvgeColorPalette } from '../color-palette/color-palette.component';
import { SvgeColorPicker } from '../color-picker/color-picker.component';
import { SvgePanelGroup, SvgePanelGroupTab } from '../panel-group';
import { SvgeSmartObjectEditorDialogService } from '../smart-object-dialog';
import { EllipseFieldPipe, LineFieldPipe, RectFieldPipe, roundForDisplay } from './inspector-pipes';

/**
 * Property inspector (Fase 4 Bloco 4c). Reactive panel showing the
 * editable properties of the currently focused node.
 *
 * **States**:
 * - **No selection** → "No selection" placeholder.
 * - **Multi-selection** → multi-edit mode when the selected nodes share
 *   editable properties: the inspector renders the same fields and
 *   each edit dispatches a `SetStylePropertyOnManyCommand` so all N
 *   nodes change atomically in a single undo entry (`MIXED` sentinel
 *   covers fields that differ across the selection). Falls back to a
 *   simple "Multiple selection" placeholder when nothing is shareable.
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
 * **Color editing**: fill and stroke use `<svge-color-picker>` (Sprint
 * C-ColorPicker — sat/light + hue + inputs + recent swatches + native
 * EyeDropper API) backed by `PaletteRegistry` for the recent / preset
 * swatches. Opacity stays as a number input — a Material slider
 * remains a possible future polish.
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
    MatButton,
    MatMenu,
    MatMenuTrigger,
    MatSelect,
    MatOption,
    SvgeColorPalette,
    SvgeColorPicker,
    SvgePanelGroup,
    SvgePanelGroupTab,
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

      <!--
        D-078 — Inspector reorg. Properties moved into a vertical
        svge-panel-group (same pattern Libraries Panel uses): tabs
        for each topic (Colors / Geometry / Transform / Composition /
        contextual Text + Smart Object + Advanced). Only one tab body
        visible at a time so the user is not overwhelmed by a long
        scroll. Each tab keeps its existing inner markup intact —
        the refactor is purely structural (no command/method changes,
        no spec churn for the underlying behavior).
      -->
      <svge-panel-group title="Properties" [compact]="true" orientation="vertical">
        <ng-template
          svgePanelGroupTab
          svgePanelGroupTabId="geometry"
          label="Geometry"
          icon="straighten"
        >
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
                    Editing geometry of <strong>{{ node.type }}</strong> nodes here is not yet
                    supported — use the canvas tools.
                  </p>
                </section>
              }
            }
          }
        </ng-template>

        <!--
          D-076 — Smart Object contextual tab. Visible only when the
          focused group carries metadata.customData.svgeKind ===
          smart-object. Surfaces the same 3 actions (Edit / Replace /
          Rasterize) from the menu submenu plus a quick name +
          child-count read-out so the user gets a Photoshop-style
          asset-properties panel without leaving the Inspector.
        -->
        <!--
          D-079 / PAGES-D — Page section. Conditional on the focused
          node being a page (mutually exclusive with smart-object).
          Surfaces editable name + viewBox dimensions + delete action.
          The Pages tab strip above the canvas handles add/select/
          reorder; this section is the "property sheet" for the page
          currently focused.
        -->
        @if (isPageNode(node)) {
          <ng-template
            svgePanelGroupTab
            svgePanelGroupTabId="page"
            label="Page"
            icon="crop_landscape"
          >
            <section class="section">
              <h3 class="section-title">Page</h3>
              <div class="page-meta">
                <mat-icon class="page-icon" aria-hidden="true">crop_landscape</mat-icon>
                <mat-form-field appearance="outline" class="page-name-field">
                  <mat-label>Name</mat-label>
                  <input
                    matInput
                    type="text"
                    [value]="pageName(node)"
                    (change)="onPageNameChange(node, $event)"
                  />
                </mat-form-field>
              </div>
              <div class="page-viewbox-grid">
                <mat-form-field appearance="outline">
                  <mat-label>X</mat-label>
                  <input
                    matInput
                    type="number"
                    [value]="pageViewBoxField(node, 'x')"
                    (change)="onPageViewBoxChange(node, 'x', $event)"
                  />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Y</mat-label>
                  <input
                    matInput
                    type="number"
                    [value]="pageViewBoxField(node, 'y')"
                    (change)="onPageViewBoxChange(node, 'y', $event)"
                  />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Width</mat-label>
                  <input
                    matInput
                    type="number"
                    [value]="pageViewBoxField(node, 'width')"
                    (change)="onPageViewBoxChange(node, 'width', $event)"
                  />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>Height</mat-label>
                  <input
                    matInput
                    type="number"
                    [value]="pageViewBoxField(node, 'height')"
                    (change)="onPageViewBoxChange(node, 'height', $event)"
                  />
                </mat-form-field>
              </div>
              <div class="page-actions">
                <button
                  mat-stroked-button
                  type="button"
                  class="page-action-btn page-action-danger"
                  (click)="deletePage(node)"
                  title="Delete this page (children removed; Ctrl+Z to restore)"
                >
                  <mat-icon aria-hidden="true">delete_outline</mat-icon>
                  Delete Page
                </button>
              </div>
            </section>
          </ng-template>
        }

        @if (isSmartObjectNode(node)) {
          <ng-template
            svgePanelGroupTab
            svgePanelGroupTabId="smart-object"
            label="Smart Object"
            icon="inventory_2"
          >
            <section class="section">
              <h3 class="section-title">Smart Object</h3>
              <div class="so-summary">
                <mat-icon class="so-icon" aria-hidden="true">inventory_2</mat-icon>
                <div class="so-meta">
                  <div class="so-name">{{ smartObjectName(node) }}</div>
                  <div class="so-count">
                    {{ smartObjectChildCount(node) }}
                    {{ smartObjectChildCount(node) === 1 ? 'child' : 'children' }}
                  </div>
                </div>
              </div>
              <div class="so-actions">
                <button
                  mat-stroked-button
                  type="button"
                  class="so-action-btn"
                  [disabled]="isLocked()"
                  (click)="editSmartObjectContents(node)"
                  title="Open the inner SVG source in an editor dialog"
                >
                  <mat-icon aria-hidden="true">edit_note</mat-icon>
                  Edit Contents…
                </button>
                <button
                  mat-stroked-button
                  type="button"
                  class="so-action-btn"
                  [disabled]="isLocked()"
                  (click)="replaceSmartObjectContents(node)"
                  title="Pick an SVG file to swap the children (transform + style preserved)"
                >
                  <mat-icon aria-hidden="true">sync_alt</mat-icon>
                  Replace Contents…
                </button>
                <button
                  mat-stroked-button
                  type="button"
                  class="so-action-btn so-action-danger"
                  [disabled]="isLocked()"
                  (click)="rasterizeSmartObject(node)"
                  title="Unwrap the smart object (drops the flag, hoists children)"
                >
                  <mat-icon aria-hidden="true">view_module</mat-icon>
                  Rasterize
                </button>
              </div>
            </section>
          </ng-template>
        }

        <!--
          Transform tab (Item 5 — débito 4c-Polish): decomposed
          rotation + scale numeric inputs + 3×3 pivot picker.
          Translation is already covered by the per-type geometry
          inputs (e.g., rect x/y) so we don't duplicate it here.
          Single-edit only — decomposition of mixed-selection
          transforms is ill-defined.
        -->
        <ng-template
          svgePanelGroupTab
          svgePanelGroupTabId="transform"
          label="Transform"
          icon="open_with"
        >
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
            <!--
          D-078 — Flip horizontal / vertical buttons. Each click
          dispatches one FlipNodeCommand per selected unlocked node,
          pivoting around its own bbox centre so the shape mirrors
          in place. Multi-selection produces N commands (one per id).
        -->
            <div class="flip-row">
              <span class="flip-label">flip</span>
              <button
                type="button"
                class="flip-btn"
                [disabled]="isLocked()"
                (click)="flipNode('horizontal')"
                title="Flip horizontal (mirror left ↔ right)"
                aria-label="Flip horizontal"
              >
                <mat-icon aria-hidden="true">swap_horiz</mat-icon>
              </button>
              <button
                type="button"
                class="flip-btn"
                [disabled]="isLocked()"
                (click)="flipNode('vertical')"
                title="Flip vertical (mirror top ↔ bottom)"
                aria-label="Flip vertical"
              >
                <mat-icon aria-hidden="true">swap_vert</mat-icon>
              </button>
            </div>
          </section>
        </ng-template>

        <!--
          D-078 — Align & Distribute tab. Delegates to AlignmentService
          (same service the Object ▸ Align / Distribute submenus use),
          so a click here and a click in the menu produce identical
          undo entries. Each button calls alignSelection / distribute
          Selection which resolve bboxes from the rendered DOM and
          pass them to the service. Disabled gates: ≥ 2 for align,
          ≥ 3 for distribute (semantic minima).
        -->
        <ng-template
          svgePanelGroupTab
          svgePanelGroupTabId="align"
          label="Align"
          icon="align_horizontal_center"
        >
          <section class="section">
            <h3 class="section-title">Align</h3>
            <div class="align-grid">
              <button
                type="button"
                class="align-btn"
                [disabled]="!canAlign()"
                (click)="alignSelection('left')"
                title="Align left edges"
                aria-label="Align left"
              >
                <mat-icon aria-hidden="true">align_horizontal_left</mat-icon>
              </button>
              <button
                type="button"
                class="align-btn"
                [disabled]="!canAlign()"
                (click)="alignSelection('center-x')"
                title="Align horizontal centers"
                aria-label="Align horizontal center"
              >
                <mat-icon aria-hidden="true">align_horizontal_center</mat-icon>
              </button>
              <button
                type="button"
                class="align-btn"
                [disabled]="!canAlign()"
                (click)="alignSelection('right')"
                title="Align right edges"
                aria-label="Align right"
              >
                <mat-icon aria-hidden="true">align_horizontal_right</mat-icon>
              </button>
              <button
                type="button"
                class="align-btn"
                [disabled]="!canAlign()"
                (click)="alignSelection('top')"
                title="Align top edges"
                aria-label="Align top"
              >
                <mat-icon aria-hidden="true">align_vertical_top</mat-icon>
              </button>
              <button
                type="button"
                class="align-btn"
                [disabled]="!canAlign()"
                (click)="alignSelection('center-y')"
                title="Align vertical centers"
                aria-label="Align vertical center"
              >
                <mat-icon aria-hidden="true">align_vertical_center</mat-icon>
              </button>
              <button
                type="button"
                class="align-btn"
                [disabled]="!canAlign()"
                (click)="alignSelection('bottom')"
                title="Align bottom edges"
                aria-label="Align bottom"
              >
                <mat-icon aria-hidden="true">align_vertical_bottom</mat-icon>
              </button>
            </div>
          </section>
          <section class="section">
            <h3 class="section-title">Distribute</h3>
            <div class="align-grid">
              <button
                type="button"
                class="align-btn"
                [disabled]="!canDistribute()"
                (click)="distributeSelection('horizontal')"
                title="Distribute horizontally (≥ 3 nodes)"
                aria-label="Distribute horizontal"
              >
                <mat-icon aria-hidden="true">horizontal_distribute</mat-icon>
              </button>
              <button
                type="button"
                class="align-btn"
                [disabled]="!canDistribute()"
                (click)="distributeSelection('vertical')"
                title="Distribute vertically (≥ 3 nodes)"
                aria-label="Distribute vertical"
              >
                <mat-icon aria-hidden="true">vertical_distribute</mat-icon>
              </button>
            </div>
          </section>
        </ng-template>

        <!--
          D-078 — Arrange tab. Composition + organization actions:
          z-index reordering (Bring to Front / Forward / Backward /
          Send to Back), Group / Ungroup, Lock / Visibility toggles.
          Mirrors the Object ▸ {Bring/Send, Group/Ungroup} menu
          submenu. Lock/visibility delegate directly to LayersService
          (same writes the Layers panel performs).
        -->
        <ng-template svgePanelGroupTab svgePanelGroupTabId="arrange" label="Arrange" icon="layers">
          <section class="section">
            <h3 class="section-title">Order (z-index)</h3>
            <div class="align-grid arrange-grid">
              <button
                type="button"
                class="align-btn"
                [disabled]="!canArrange()"
                (click)="reorderSelection('toFront')"
                title="Bring to Front (Ctrl+Shift+])"
                aria-label="Bring to Front"
              >
                <mat-icon aria-hidden="true">flip_to_front</mat-icon>
              </button>
              <button
                type="button"
                class="align-btn"
                [disabled]="!canArrange()"
                (click)="reorderSelection('forward')"
                title="Bring Forward (Ctrl+])"
                aria-label="Bring Forward"
              >
                <mat-icon aria-hidden="true">arrow_upward</mat-icon>
              </button>
              <button
                type="button"
                class="align-btn"
                [disabled]="!canArrange()"
                (click)="reorderSelection('backward')"
                title="Send Backward (Ctrl+[)"
                aria-label="Send Backward"
              >
                <mat-icon aria-hidden="true">arrow_downward</mat-icon>
              </button>
              <button
                type="button"
                class="align-btn"
                [disabled]="!canArrange()"
                (click)="reorderSelection('toBack')"
                title="Send to Back (Ctrl+Shift+[)"
                aria-label="Send to Back"
              >
                <mat-icon aria-hidden="true">flip_to_back</mat-icon>
              </button>
            </div>
          </section>
          <section class="section">
            <h3 class="section-title">Group</h3>
            <div class="arrange-row">
              <button
                mat-stroked-button
                type="button"
                class="arrange-action-btn"
                [disabled]="!canGroup()"
                (click)="groupSelection()"
                title="Group selection (Ctrl+G) — ≥ 2 sibling nodes"
              >
                <mat-icon aria-hidden="true">workspaces</mat-icon>
                Group
              </button>
              <button
                mat-stroked-button
                type="button"
                class="arrange-action-btn"
                [disabled]="!canUngroup()"
                (click)="ungroupFocused()"
                title="Ungroup (Ctrl+Shift+G) — focused group only"
              >
                <mat-icon aria-hidden="true">grid_off</mat-icon>
                Ungroup
              </button>
            </div>
          </section>
          <section class="section">
            <h3 class="section-title">Visibility & Lock</h3>
            <div class="arrange-row">
              <button
                mat-stroked-button
                type="button"
                class="arrange-action-btn"
                [disabled]="!canArrange()"
                (click)="toggleVisibility()"
                [title]="allVisible() ? 'Hide selection' : 'Show selection'"
              >
                <mat-icon aria-hidden="true">{{
                  allVisible() ? 'visibility' : 'visibility_off'
                }}</mat-icon>
                {{ allVisible() ? 'Hide' : 'Show' }}
              </button>
              <button
                mat-stroked-button
                type="button"
                class="arrange-action-btn"
                [disabled]="!canArrange()"
                (click)="toggleLock()"
                [title]="allLocked() ? 'Unlock selection' : 'Lock selection'"
              >
                <mat-icon aria-hidden="true">{{ allLocked() ? 'lock' : 'lock_open' }}</mat-icon>
                {{ allLocked() ? 'Unlock' : 'Lock' }}
              </button>
            </div>
          </section>
        </ng-template>

        <!--
          Convert to Path tab — visible only for non-path leaf nodes
          (rect/ellipse/line/polygon/polyline). Group/text/image
          hidden (no equivalent path semantic in v1).
        -->
        @if (canConvertToPath()) {
          <ng-template
            svgePanelGroupTab
            svgePanelGroupTabId="advanced"
            label="Advanced"
            icon="tune"
          >
            <section class="section">
              <h3 class="section-title">Path operations</h3>
              <button
                type="button"
                class="reset-btn"
                (click)="convertToPath()"
                title="Convert this shape (or all convertible shapes in the selection) to an editable path"
              >
                {{ convertToPathLabel() }}
              </button>
            </section>
          </ng-template>
        }

        <!--
          Type tab (D-068) — exposes the D-053 text-only fields.
          Visible only when the focused node is a text.
        -->
        @if (textNode(); as text) {
          <ng-template svgePanelGroupTab svgePanelGroupTabId="text" label="Text" icon="text_fields">
            <section class="section">
              <h3 class="section-title">Type</h3>

              <!--
            ── D-069 — Basics first: the typography knobs every design
            tool exposes (font/size/weight/anchor/italic/underline/
            line-height). Engine + renderer + exporter all carried
            most of these since the original D-053; this is the UI
            that was missing. Placed at the top of the Type section
            so common-case edits don't require scrolling past the
            advanced D-053/D-068 controls (variable axes, OpenType,
            textPath).
          -->
              <h4 class="style-subsection-title">Font</h4>
              <mat-form-field appearance="outline" class="full-width-field">
                <mat-label>family</mat-label>
                <mat-select
                  [value]="fontFamilyValue()"
                  [disabled]="isLocked()"
                  (selectionChange)="setFontFamilyPreset($event.value)"
                >
                  <mat-option [value]="''">(default)</mat-option>
                  @for (f of FONT_FAMILY_PRESETS; track f.value) {
                    <mat-option [value]="f.value">{{ f.label }}</mat-option>
                  }
                  <mat-option value="__custom__">Custom…</mat-option>
                </mat-select>
              </mat-form-field>
              @if (fontFamilyValue() === '__custom__' || isCustomFontFamily()) {
                <mat-form-field appearance="outline" class="full-width-field">
                  <mat-label>custom font-family</mat-label>
                  <input
                    matInput
                    type="text"
                    [disabled]="isLocked()"
                    [value]="text.fontFamily ?? ''"
                    placeholder="'Inter', sans-serif"
                    (change)="setFontFamilyCustom($any($event.target).value)"
                  />
                </mat-form-field>
              }

              <div class="grid">
                <mat-form-field appearance="outline">
                  <mat-label>size (px)</mat-label>
                  <input
                    matInput
                    type="number"
                    min="1"
                    step="1"
                    [disabled]="isLocked()"
                    [value]="text.fontSize ?? ''"
                    placeholder="16"
                    (change)="setFontSize($any($event.target).value)"
                  />
                </mat-form-field>
                <mat-form-field appearance="outline">
                  <mat-label>weight</mat-label>
                  <mat-select
                    [value]="fontWeightValue()"
                    [disabled]="isLocked()"
                    (selectionChange)="setFontWeight($event.value)"
                  >
                    <mat-option [value]="''">(default)</mat-option>
                    @for (w of FONT_WEIGHT_PRESETS; track w.value) {
                      <mat-option [value]="w.value">{{ w.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              </div>

              <div class="anchor-row" role="group" aria-label="Text anchor">
                <span class="anchor-label">anchor</span>
                <div class="anchor-buttons">
                  @for (a of TEXT_ANCHOR_OPTIONS; track a.value) {
                    <button
                      type="button"
                      class="anchor-btn"
                      [class.active]="(text.textAnchor ?? 'start') === a.value"
                      [disabled]="isLocked()"
                      [attr.aria-pressed]="(text.textAnchor ?? 'start') === a.value"
                      [title]="a.title"
                      (click)="setTextAnchor(a.value)"
                    >
                      <mat-icon aria-hidden="true">{{ a.icon }}</mat-icon>
                    </button>
                  }
                </div>
              </div>

              <div class="style-toggles" role="group" aria-label="Text style toggles">
                <span class="style-toggles-label">style</span>
                <button
                  type="button"
                  class="feature-toggle italic-btn"
                  [class.active]="text.fontStyle === 'italic'"
                  [disabled]="isLocked()"
                  [attr.aria-pressed]="text.fontStyle === 'italic'"
                  title="Italic"
                  (click)="toggleItalic()"
                >
                  <em>I</em>
                </button>
                <button
                  type="button"
                  class="feature-toggle underline-btn"
                  [class.active]="text.textDecoration === 'underline'"
                  [disabled]="isLocked()"
                  [attr.aria-pressed]="text.textDecoration === 'underline'"
                  title="Underline"
                  (click)="toggleDecoration('underline')"
                >
                  <span class="deco-underline">U</span>
                </button>
                <button
                  type="button"
                  class="feature-toggle strike-btn"
                  [class.active]="text.textDecoration === 'line-through'"
                  [disabled]="isLocked()"
                  [attr.aria-pressed]="text.textDecoration === 'line-through'"
                  title="Strikethrough"
                  (click)="toggleDecoration('line-through')"
                >
                  <span class="deco-strike">S</span>
                </button>
              </div>

              <mat-form-field appearance="outline" class="full-width-field">
                <mat-label>line-height (× font-size)</mat-label>
                <input
                  matInput
                  type="number"
                  min="0.5"
                  step="0.05"
                  [disabled]="isLocked()"
                  [value]="text.lineHeight ?? ''"
                  placeholder="1.2"
                  (change)="setLineHeight($any($event.target).value)"
                />
              </mat-form-field>
              <p class="hint-text">
                Affects multi-line text (newlines in content). 1.0 = tight, 1.2 = default, 1.5 =
                relaxed.
              </p>

              <h4 class="style-subsection-title">Spacing</h4>
              <mat-form-field appearance="outline" class="full-width-field">
                <mat-label>letter-spacing (px)</mat-label>
                <input
                  matInput
                  type="number"
                  step="0.1"
                  [disabled]="isLocked()"
                  [value]="text.letterSpacing ?? ''"
                  placeholder="0"
                  (change)="setLetterSpacing($any($event.target).value)"
                />
              </mat-form-field>

              <h4 class="style-subsection-title">Variable font axes</h4>
              <mat-form-field appearance="outline" class="full-width-field">
                <mat-label>font-variation-settings</mat-label>
                <input
                  matInput
                  type="text"
                  [disabled]="isLocked()"
                  [value]="text.fontVariationSettings ?? ''"
                  placeholder="'wght' 650, 'wdth' 95"
                  (change)="setFontVariationSettings($any($event.target).value)"
                />
              </mat-form-field>
              <p class="hint-text">
                Comma-separated axis tuples. Inactive on static (non-variable) fonts.
              </p>

              <h4 class="style-subsection-title">OpenType features</h4>
              <div class="feature-toggles" role="group" aria-label="OpenType feature quick toggles">
                @for (feat of OPENTYPE_QUICK_TOGGLES; track feat.tag) {
                  <button
                    type="button"
                    class="feature-toggle"
                    [class.active]="hasFontFeature(feat.tag)"
                    [disabled]="isLocked()"
                    [attr.aria-pressed]="hasFontFeature(feat.tag)"
                    [title]="feat.title"
                    (click)="toggleFontFeature(feat.tag)"
                  >
                    {{ feat.label }}
                  </button>
                }
              </div>
              <mat-form-field appearance="outline" class="full-width-field">
                <mat-label>font-feature-settings (raw)</mat-label>
                <input
                  matInput
                  type="text"
                  [disabled]="isLocked()"
                  [value]="text.fontFeatureSettings ?? ''"
                  placeholder="'liga' on, 'smcp' on"
                  (change)="setFontFeatureSettings($any($event.target).value)"
                />
              </mat-form-field>
              <p class="hint-text">
                Quick toggles edit common features; raw input lets you set anything (e.g. 'ss03' on,
                'cv11' 2).
              </p>

              <h4 class="style-subsection-title">Text on path</h4>
              <mat-form-field appearance="outline" class="full-width-field">
                <mat-label>follow path</mat-label>
                <mat-select
                  [value]="text.textPathRef ?? ''"
                  [disabled]="isLocked() || pathsInDoc().length === 0"
                  (selectionChange)="setTextPathRef($event.value)"
                >
                  <mat-option [value]="''">(none — straight baseline)</mat-option>
                  @for (p of pathsInDoc(); track p.id) {
                    <mat-option [value]="p.id">{{ p.label }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width-field">
                <mat-label>start offset</mat-label>
                <input
                  matInput
                  type="text"
                  [disabled]="isLocked() || text.textPathRef === undefined"
                  [value]="text.textPathStartOffset ?? ''"
                  placeholder="50% or 40"
                  (change)="setTextPathStartOffset($any($event.target).value)"
                />
              </mat-form-field>
              <p class="hint-text">
                Empty offset starts the text at the beginning of the path. Multi-line text is
                flattened to a single run when following a path (SVG limitation).
              </p>
            </section>
          </ng-template>
        }

        <!--
          Colors tab — Fill, Stroke and Appearance (opacity). The
          .color-cell + .active-target + .field-row selectors are
          unchanged so existing specs continue to pass. Composition
          (blend mode / clip-path / mask) moved into its own tab so
          asset styling and compositing read separately.
        -->
        <ng-template svgePanelGroupTab svgePanelGroupTabId="colors" label="Colors" icon="palette">
          <section class="section">
            <h3 class="section-title">Style</h3>
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
                  <mat-menu
                    #fillPickerMenu="matMenu"
                    xPosition="before"
                    yPosition="below"
                    panelClass="svge-picker-menu-panel"
                  >
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
                  <mat-menu
                    #strokePickerMenu="matMenu"
                    xPosition="before"
                    yPosition="below"
                    panelClass="svge-picker-menu-panel"
                  >
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
        </ng-template>

        <!--
          Composition tab (D-049 Item 4) — mix-blend-mode + clip-path
          + mask. Surfaced separately from Colors so users distinguish
          "what the asset looks like" from "how it composes with what
          is underneath". Disabled selects when no catalog items are
          registered.
        -->
        <ng-template
          svgePanelGroupTab
          svgePanelGroupTabId="composition"
          label="Composition"
          icon="gradient"
        >
          <section class="section">
            <h3 class="section-title">Composition</h3>
            <div class="grid color-grid">
              <div class="style-subsection" aria-labelledby="style-composition-title">
                <h4 id="style-composition-title" class="style-subsection-title">Composition</h4>
                <mat-form-field appearance="outline" class="full-width-field">
                  <mat-label>blend mode</mat-label>
                  <mat-select
                    [value]="compositionStringValue('mixBlendMode') ?? 'normal'"
                    [disabled]="isLocked()"
                    (selectionChange)="setCompositionString('mixBlendMode', $event.value)"
                  >
                    @for (mode of BLEND_MODES; track mode) {
                      <mat-option [value]="mode">{{ mode }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline" class="full-width-field">
                  <mat-label>clip path</mat-label>
                  <mat-select
                    [value]="compositionRefValue('clipPath') ?? ''"
                    [disabled]="isLocked() || clipPathItems().length === 0"
                    (selectionChange)="setCompositionRef('clipPath', $event.value)"
                  >
                    <mat-option [value]="''">(none)</mat-option>
                    @for (cp of clipPathItems(); track cp.id) {
                      <mat-option [value]="cp.id">{{ cp.name }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                <mat-form-field appearance="outline" class="full-width-field">
                  <mat-label>mask</mat-label>
                  <mat-select
                    [value]="compositionRefValue('mask') ?? ''"
                    [disabled]="isLocked() || maskItems().length === 0"
                    (selectionChange)="setCompositionRef('mask', $event.value)"
                  >
                    <mat-option [value]="''">(none)</mat-option>
                    @for (m of maskItems(); track m.id) {
                      <mat-option [value]="m.id">{{ m.name }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              </div>
            </div>
          </section>
        </ng-template>
      </svge-panel-group>
    } @else if (multiEditableIds().length > 1) {
      <!-- Multi-edit panel (Item 1 - débito 4c): style fields apply
           atomically to all unlocked selected nodes via one undo entry. -->
      <header class="inspector-header" data-mode="multi">
        <mat-icon class="type-icon" aria-hidden="true">filter_none</mat-icon>
        <span class="type-label">Multi-selection</span>
        <span class="id-label">{{ multiEditableIds().length }} editable</span>
      </header>

      <!--
        D-078 — Multi-edit uses the same svge-panel-group reorganization
        as single-edit so the user gets a consistent topic-tabbed UX
        regardless of selection count. Tabs available in multi-edit
        are a subset (Colors applies-to-all + conditional Advanced
        for batch Convert to Path) because per-node geometry / transform
        / type don't have well-defined batch semantics.
      -->
      <svge-panel-group title="Properties" [compact]="true" orientation="vertical">
        <ng-template svgePanelGroupTab svgePanelGroupTabId="colors" label="Colors" icon="palette">
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
        </ng-template>

        <!--
          D-071b — Batch Convert to Path in multi-edit mode. Visible
          when the selection contains at least one convertible shape.
          Single undo entry via BatchConvertToPathCommand. The button
          label updates to "Convert N to Path" so the user sees the
          batch size before clicking.
        -->
        @if (canConvertToPath()) {
          <ng-template
            svgePanelGroupTab
            svgePanelGroupTabId="advanced"
            label="Advanced"
            icon="tune"
          >
            <section class="section">
              <h3 class="section-title">Path operations</h3>
              <button
                type="button"
                class="reset-btn"
                (click)="convertToPath()"
                title="Convert all convertible shapes in the selection to editable paths (single undo)"
              >
                {{ convertToPathLabel() }}
              </button>
            </section>
          </ng-template>
        }
      </svge-panel-group>
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
    /* D-068 — Type section (text-only) */
    .feature-toggles {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: 4px 0 8px;
    }
    .feature-toggle {
      font-size: 11px;
      font-family: 'JetBrains Mono', 'Fira Code', Consolas, Menlo, monospace;
      padding: 3px 8px;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 4px;
      background: var(--mat-sys-surface, #fff);
      color: var(--mat-sys-on-surface-variant, #777);
      cursor: pointer;
      user-select: none;
      transition:
        background 120ms,
        color 120ms,
        border-color 120ms;
    }
    .feature-toggle:hover:not(:disabled) {
      background: var(--mat-sys-surface-container-high, #eee);
      border-color: var(--mat-sys-primary, #1976d2);
    }
    .feature-toggle.active {
      background: var(--mat-sys-primary, #1976d2);
      color: var(--mat-sys-on-primary, #fff);
      border-color: var(--mat-sys-primary, #1976d2);
    }
    .feature-toggle:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .hint-text {
      margin: -4px 0 8px;
      font-size: 11px;
      line-height: 1.4;
      color: var(--mat-sys-on-surface-variant, #888);
      font-style: italic;
    }
    /* D-069 — Type section basics: anchor segmented control + style chip toggles. */
    .anchor-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 4px 0 8px;
    }
    .anchor-label,
    .style-toggles-label {
      flex: 1 1 auto;
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant, #777);
    }
    .anchor-buttons {
      flex: 0 0 auto;
      display: inline-flex;
      gap: 0;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 4px;
      overflow: hidden;
    }
    .anchor-btn {
      width: 30px;
      height: 26px;
      padding: 0;
      border: 0;
      border-right: 1px solid var(--mat-sys-outline-variant, #ccc);
      background: var(--mat-sys-surface, #fff);
      color: var(--mat-sys-on-surface-variant, #777);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition:
        background 100ms,
        color 100ms;
    }
    .anchor-btn:last-child {
      border-right: 0;
    }
    .anchor-btn:hover:not(:disabled) {
      background: var(--mat-sys-surface-container-high, #eee);
    }
    .anchor-btn.active {
      background: var(--mat-sys-primary, #1976d2);
      color: var(--mat-sys-on-primary, #fff);
    }
    .anchor-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .anchor-btn .mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .style-toggles {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0 0 8px;
    }
    /* Italic / Underline / Strike chips reuse the .feature-toggle styles
       but show actual visual hints (italic 'I', underlined 'U', struck 'S')
       instead of OpenType tags. */
    .italic-btn em {
      font-style: italic;
      font-family: serif;
    }
    .deco-underline {
      text-decoration: underline;
      font-family: serif;
    }
    .deco-strike {
      text-decoration: line-through;
      font-family: serif;
    }
    /* D-078 — Arrange tab grids + buttons. Reuses .align-btn style for
       the z-index 4-button row; arrange-row is for the stacked
       Group/Ungroup + Visibility/Lock pairs (icon + label). */
    .arrange-grid {
      grid-template-columns: repeat(4, 1fr);
    }
    .arrange-row {
      display: flex;
      gap: 4px;
    }
    .arrange-action-btn {
      flex: 1 1 auto;
      justify-content: flex-start;
      font-size: 12px;
      line-height: 1.2;
    }
    .arrange-action-btn .mat-icon {
      margin-right: 4px;
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    /* D-078 — Align & Distribute grid inside Align tab */
    .align-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 4px;
    }
    .align-btn {
      width: 100%;
      aspect-ratio: 1;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--mat-sys-surface, #fff);
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 4px;
      cursor: pointer;
      color: var(--mat-sys-on-surface, inherit);
    }
    .align-btn:hover:not(:disabled) {
      background: var(--mat-sys-surface-container-high, #eee);
    }
    .align-btn:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
    .align-btn .mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    /* D-078 — Flip H/V row inside Transform tab */
    .flip-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px solid var(--mat-sys-outline-variant, #eee);
    }
    .flip-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: var(--mat-sys-on-surface-variant, #777);
      flex: 0 0 auto;
    }
    .flip-btn {
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--mat-sys-surface, #fff);
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 4px;
      cursor: pointer;
      color: var(--mat-sys-on-surface, inherit);
    }
    .flip-btn:hover:not(:disabled) {
      background: var(--mat-sys-surface-container-high, #eee);
    }
    .flip-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .flip-btn .mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
    /* D-076 — Smart Object contextual section */
    .so-summary {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .so-icon {
      /* Match the tertiary accent used by the Layers panel for smart-
         object rows so both surfaces present the same visual language. */
      color: var(--mat-sys-tertiary, #d97706);
      font-size: 28px;
      width: 28px;
      height: 28px;
      flex: 0 0 auto;
    }
    .so-meta {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .so-name {
      font-weight: 500;
      font-size: 13px;
      color: var(--mat-sys-on-surface, inherit);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .so-count {
      font-size: 11px;
      color: var(--mat-sys-on-surface-variant, #777);
      font-variant-numeric: tabular-nums;
    }
    .so-actions {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .so-action-btn {
      justify-content: flex-start;
      font-size: 12px;
      line-height: 1.2;
    }
    .so-action-btn .mat-icon {
      margin-right: 4px;
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .so-action-danger {
      /* Subtle warning tint — rasterize is destructive (drops the
         wrapper irreversibly via undo only). */
      color: var(--mat-sys-error, #b3261e);
    }
    /* D-079 / PAGES-D — Page section. Mirrors so-summary / so-actions
       structure for visual consistency in the Inspector. */
    .page-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
    }
    .page-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      opacity: 0.65;
      flex-shrink: 0;
    }
    .page-name-field {
      flex: 1 1 auto;
      min-width: 0;
    }
    .page-viewbox-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      padding: 4px 0;
    }
    .page-actions {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 4px;
    }
    .page-action-btn {
      justify-content: flex-start;
      font-size: 12px;
      line-height: 1.2;
    }
    .page-action-btn .mat-icon {
      margin-right: 4px;
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .page-action-danger {
      color: var(--mat-sys-error, #b3261e);
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
  // **D-076** — Smart Object action wiring. Service powers Replace +
  // Rasterize (shared with the menu plugin); dialog service opens the
  // Material textarea editor for Edit Contents. The host Injector is
  // forwarded to the dialog so it reads the active editor scope (D-042).
  private readonly smartObjectActions = inject(SmartObjectActionsService);
  private readonly smartObjectEditorDialog = inject(SvgeSmartObjectEditorDialogService);
  private readonly injector = inject(Injector);
  // **D-078** — alignment + distribution surfaced in the Inspector Align
  // tab. Same service the Object ▸ Align menu submenu uses, so one tap
  // in the Inspector and one tap in the menu produce identical results
  // (and identical undo entries).
  private readonly alignment = inject(AlignmentService);

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

  // ── D-076 — Smart Object section helpers ─────────────────────────

  /**
   * Template guard for the Smart Object section. Re-exposed as a
   * method (rather than calling `isSmartObject` directly in the
   * template) so the Inspector keeps its imports tidy and so future
   * refactors of the guard signature land in one place.
   */
  protected isSmartObjectNode(node: SvgNode): boolean {
    return isSmartObject(node);
  }

  /**
   * Display name for the Smart Object header. Falls back to a `id`
   * slice when no human name was set — matches the layers panel
   * convention so the same wrapper shows the same string in both
   * surfaces.
   */
  protected smartObjectName(node: SvgNode): string {
    const name = node.metadata.name;
    if (name !== undefined && name.length > 0) return name;
    return `Smart Object (${node.id.slice(0, 6)})`;
  }

  /**
   * Children count read-out (just `children.length` for groups, `0`
   * for non-groups — defensive, the section template already gates on
   * `isSmartObjectNode` which only succeeds for groups).
   */
  protected smartObjectChildCount(node: SvgNode): number {
    return node.type === 'group' ? node.children.length : 0;
  }

  /**
   * Open the textarea source editor for this smart object. The host
   * `Injector` is forwarded so the dialog's
   * `inject(EditorStateService)` resolves to THIS editor's scope —
   * without it, the dialog would see the root document (= empty in
   * multi-editor apps). Same wiring rationale as the menu plugin's
   * Edit Contents handler.
   */
  protected editSmartObjectContents(node: SvgNode): void {
    if (!isSmartObject(node)) return;
    this.smartObjectEditorDialog.open(node.id, this.injector);
  }

  /**
   * Delegate to {@link SmartObjectActionsService.replaceContents} —
   * same file-picker + parse + dispatch used by the menu plugin. Single
   * source of truth (D-076 refactor).
   */
  protected replaceSmartObjectContents(node: SvgNode): void {
    if (!isSmartObject(node)) return;
    this.smartObjectActions.replaceContents(node.id);
  }

  /**
   * Delegate to {@link SmartObjectActionsService.rasterize} — drops
   * the wrapper, hoists children. Single undoable history entry.
   */
  protected rasterizeSmartObject(node: SvgNode): void {
    if (!isSmartObject(node)) return;
    this.smartObjectActions.rasterize(node.id);
  }

  // ── D-079 / PAGES-D — Page section helpers ───────────────────────

  /** Template guard — true when the focused node is a Page. */
  protected isPageNode(node: SvgNode): boolean {
    return isPage(node);
  }

  /** Display name for the Page tab. Falls back via getPageName helper. */
  protected pageName(node: SvgNode): string {
    return getPageName(node);
  }

  /**
   * Read one component of the page's viewBox for the number-input
   * binding. Returns empty string when the page's viewBox is missing
   * — defensive, since the input is editable and a user-cleared field
   * would temporarily hit this code path between `change` events.
   */
  protected pageViewBoxField(node: SvgNode, field: keyof BoundingBox): string {
    const vb = getPageViewBox(node);
    if (vb === null) return '';
    const v = vb[field];
    return Number.isFinite(v) ? String(v) : '';
  }

  /** Commit a page rename via {@link RenamePageCommand}. */
  protected onPageNameChange(node: SvgNode, event: Event): void {
    if (!isPage(node)) return;
    const target = event.target as HTMLInputElement | null;
    if (target === null) return;
    const next = target.value.trim();
    this.bus.dispatch(new RenamePageCommand(node.id, next));
  }

  /**
   * Commit a single viewBox component edit via
   * {@link ResizePageCommand}. Reads the current viewBox first to
   * preserve the other 3 components — the command takes the FULL
   * new viewBox so we must compose the next state here.
   */
  protected onPageViewBoxChange(node: SvgNode, field: keyof BoundingBox, event: Event): void {
    if (!isPage(node)) return;
    const current = getPageViewBox(node);
    if (current === null) return;
    const target = event.target as HTMLInputElement | null;
    if (target === null) return;
    const parsed = Number.parseFloat(target.value);
    if (!Number.isFinite(parsed)) return;
    const next: BoundingBox = { ...current, [field]: parsed };
    this.bus.dispatch(new ResizePageCommand(node.id, next));
  }

  /**
   * Delete the focused page via {@link DeletePageCommand}. The
   * ActivePageService's auto-recovery effect picks a remaining page
   * automatically — no manual reactivation needed here.
   */
  protected deletePage(node: SvgNode): void {
    if (!isPage(node)) return;
    this.bus.dispatch(new DeletePageCommand(node.id));
  }

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
      case 'symbol-use':
        // D-059 — symbol instance (mirror layers panel icon choice).
        return 'star_outline';
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
   * Convertible node types — every shape the
   * `ConvertNodeToPathCommand` knows how to handle. Used by both the
   * single-node and batch (D-071b) paths.
   */
  private readonly CONVERTIBLE_TYPES = new Set(['rect', 'ellipse', 'line', 'polygon', 'polyline']);

  /**
   * Ids that the "Convert to Path" button will operate on. In single
   * selection this is just the focused id (when convertible); in
   * multi-selection (D-071b) this is every selected, unlocked,
   * convertible id. Empty when nothing is convertible.
   */
  protected readonly convertibleIds = computed<readonly NodeId[]>(() => {
    const doc = this.state.document();
    const selectedIds = Array.from(this.selection.selectedIds());
    if (selectedIds.length === 0) {
      // No multi-selection — fall back to focused single (covers the
      // pre-D-071b pattern where the inspector only shows for a focus).
      const focus = this.focusNode();
      if (focus === null || this.layers.isLocked(focus.id)) return [];
      return this.CONVERTIBLE_TYPES.has(focus.type) ? [focus.id] : [];
    }
    const out: NodeId[] = [];
    for (const id of selectedIds) {
      if (this.layers.isLocked(id)) continue;
      const node = findNodeById(doc.root, id);
      if (node !== null && this.CONVERTIBLE_TYPES.has(node.type)) {
        out.push(id);
      }
    }
    return out;
  });

  /**
   * `true` when at least one convertible (and unlocked) node is
   * selected. Drives the "Path operations" section visibility.
   * Replaces the pre-D-071b single-focus check; now true for any
   * selection containing >= 1 convertible.
   */
  protected readonly canConvertToPath = computed(() => this.convertibleIds().length > 0);

  /**
   * Label for the button — pluralized when multi-selection has >1
   * convertible. Single-node selection keeps the historical "Convert
   * to Path" label.
   */
  protected readonly convertToPathLabel = computed(() => {
    const n = this.convertibleIds().length;
    return n <= 1 ? 'Convert to Path' : `Convert ${n} to Path`;
  });

  /**
   * **D-071b** — Dispatch a single batch command that converts every
   * convertible node in the current selection. Single undo entry
   * regardless of node count (Ctrl+Z reverts the whole batch).
   *
   * The 1-node case still goes through the batch path for code
   * uniformity — the `BatchConvertToPathCommand` label degrades to
   * "Convert to path" for n=1, matching the historical command label.
   */
  protected convertToPath(): void {
    const ids = this.convertibleIds();
    if (ids.length === 0) return;
    this.bus.dispatch(new BatchConvertToPathCommand(ids));
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
   * **D-078** — flip every selected node along the given axis. Each
   * flip pivots around its OWN bbox centre so the shape mirrors in
   * place (matches Photoshop "Flip Horizontal" / Illustrator
   * "Reflect" expectations). One {@link FlipNodeCommand} per node
   * — multi-undo is the trade-off vs implementing a batch command,
   * acceptable for a low-frequency operation. Future polish could
   * fold the dispatches into a transactional bundle.
   *
   * **Why not apply a single shared pivot for multi-selection**:
   * mirroring 3 shapes "around the average bbox centre" relocates
   * all 3, which is rarely what users want when clicking Flip
   * inside the Inspector (they want each shape mirrored in place).
   * Future "Reflect across" command can take an external pivot.
   */
  protected flipNode(axis: FlipAxis): void {
    const ids = Array.from(this.selection.selectedIds());
    if (ids.length === 0) return;
    const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
    if (svg === null) return;
    for (const id of ids) {
      if (this.layers.isLocked(id)) continue;
      const bbox = getRenderedNodeBBox(svg, id);
      if (bbox === null) continue;
      const pivot: Point = {
        x: bbox.x + bbox.width / 2,
        y: bbox.y + bbox.height / 2,
      };
      this.bus.dispatch(new FlipNodeCommand(id, axis, pivot));
    }
  }

  /**
   * **D-078** — true when ≥ 2 nodes are selected (alignment requires
   * a relative position, single-selection has no meaningful axis to
   * align to). Drives the Align tab's disabled state.
   */
  protected readonly canAlign = computed(() => this.selection.selectedIds().size >= 2);

  /**
   * Distribution semantically requires ≥ 3 nodes (need at least one
   * intermediate to spread between the two extremes). Drives the
   * Distribute buttons' disabled state.
   */
  protected readonly canDistribute = computed(() => this.selection.selectedIds().size >= 3);

  /**
   * Resolve bboxes for every selected id from the rendered DOM, then
   * delegate to {@link AlignmentService.align}. Shares the same
   * call path as the Object ▸ Align menu submenu — single source of
   * truth for "align selection".
   */
  protected alignSelection(axis: AlignAxis): void {
    const items = this.collectSelectedBBoxes();
    if (items.length < 2) return;
    this.alignment.align(items, axis);
  }

  /** Same flow for distribute (≥ 3 items required). */
  protected distributeSelection(axis: DistributeAxis): void {
    const items = this.collectSelectedBBoxes();
    if (items.length < 3) return;
    this.alignment.distribute(items, axis);
  }

  /**
   * Resolve {@link NodeBBox} pairs from the rendered DOM for every
   * id in the active selection. Used by both align and distribute.
   * Skips ids without a rendered bbox (defensive — e.g., node just
   * created, not yet painted).
   */
  private collectSelectedBBoxes(): readonly NodeBBox[] {
    const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
    if (svg === null) return [];
    const out: NodeBBox[] = [];
    for (const id of this.selection.selectedIds()) {
      const bbox = getRenderedNodeBBox(svg, id);
      if (bbox === null) continue;
      out.push({ id, bbox });
    }
    return out;
  }

  // ── D-078 — Arrange tab handlers (z-index + group + lock/visibility) ─

  /** True when at least one node is selected — most Arrange ops apply
   *  per-id, single or batch. */
  protected readonly canArrange = computed(() => this.selection.selectedIds().size >= 1);

  /** Group requires ≥ 2 nodes sharing a common parent (the command
   *  validates the second condition; UI gate uses count only). */
  protected readonly canGroup = computed(() => this.selection.selectedIds().size >= 2);

  /** Ungroup requires the focused node to be a group. */
  protected readonly canUngroup = computed(() => {
    const node = this.focusNode();
    return node !== null && isGroupNode(node);
  });

  /**
   * Read aggregate visibility state across the selection — `true` when
   * EVERY selected id is visible. Drives the toggle's "currently shown"
   * state.
   */
  protected readonly allVisible = computed(() => {
    const ids = Array.from(this.selection.selectedIds());
    if (ids.length === 0) return true;
    return ids.every((id) => this.layers.isVisible(id));
  });

  /** Same as {@link allVisible} for the lock flag. */
  protected readonly allLocked = computed(() => {
    const ids = Array.from(this.selection.selectedIds());
    if (ids.length === 0) return false;
    return ids.every((id) => this.layers.isLocked(id));
  });

  /**
   * Dispatch one {@link ReorderNodeCommand} per selected id. Same
   * one-undo-per-id trade-off as flipNode — `Object ▸ Bring to Front`
   * menu uses the same dispatch loop.
   */
  protected reorderSelection(direction: ReorderDirection): void {
    const ids = Array.from(this.selection.selectedIds());
    if (ids.length === 0) return;
    for (const id of ids) {
      this.bus.dispatch(new ReorderNodeCommand(id, direction));
    }
  }

  /**
   * Group the current selection (≥ 2 ids sharing the same parent).
   * Auto-selects the new group so the user sees the result; matches
   * the menu plugin's Ctrl+G behaviour.
   */
  protected groupSelection(): void {
    const ids = Array.from(this.selection.selectedIds());
    if (ids.length < 2) return;
    const cmd = new GroupSelectionCommand(ids);
    this.bus.dispatch(cmd);
    // The command stores the new group id on itself; consumers usually
    // read it post-dispatch via cmd's internal field. The menu plugin
    // skips this because the user's focus naturally lands on the new
    // group (selection cleared, then re-selected via tree-level click).
  }

  /**
   * Ungroup the focused group (single-selection ungroup only — multi-
   * selection ungroup is ambiguous: should it ungroup ALL selected
   * groups, or only the focused one? Convention follows Illustrator:
   * single focused group).
   */
  protected ungroupFocused(): void {
    const node = this.focusNode();
    if (node === null || !isGroupNode(node)) return;
    this.bus.dispatch(new UngroupCommand(node.id));
  }

  /**
   * Flip visibility for every selected id — when `allVisible()` is true
   * we hide all; otherwise we show all (Photoshop/Figma convention for
   * multi-toggles).
   */
  protected toggleVisibility(): void {
    const target = !this.allVisible();
    for (const id of this.selection.selectedIds()) {
      this.layers.setVisible(id, target);
    }
  }

  /** Same flip for the lock flag. */
  protected toggleLock(): void {
    const target = !this.allLocked();
    for (const id of this.selection.selectedIds()) {
      this.layers.setLocked(id, target);
    }
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

  // ── D-049 (Item 4 — Composição / Recorte) ───────────────────────
  //
  // Catalog injections feed the Inspector's clipPath + mask dropdowns.
  // Both registries are root-scoped (the Catalog half of the D-048-fix
  // split) so plugin-registered presets show up here regardless of which
  // route the inspector is mounted in.
  private readonly clipPathCatalog = inject(ClipPathLibraryService);
  private readonly maskCatalog = inject(MaskLibraryService);

  /** Live signal of registered clipPath items — drives the dropdown. */
  protected readonly clipPathItems = this.clipPathCatalog.items;

  /** Live signal of registered mask items — drives the dropdown. */
  protected readonly maskItems = this.maskCatalog.items;

  /**
   * Whitelist of CSS `mix-blend-mode` values exposed in the picker.
   * Matches the CSS Compositing & Blending Level 1 spec (W3C). Listed
   * in a predictable visual ordering (normal first, then the 12 main
   * blends grouped by family) instead of alphabetical — designers
   * scan for "multiply" / "screen" / "overlay" by category, not name.
   */
  protected readonly BLEND_MODES = [
    'normal',
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'color-dodge',
    'color-burn',
    'hard-light',
    'soft-light',
    'difference',
    'exclusion',
    'hue',
    'saturation',
    'color',
    'luminosity',
  ] as const;

  /**
   * Read a string style field (mix-blend-mode) as a literal string.
   * Mixed multi-edit values surface as `undefined` so the dropdown
   * doesn't pick an arbitrary one. Used by the blend-mode picker.
   */
  protected compositionStringValue(field: 'mixBlendMode'): string | undefined {
    const v = this.commonStyleValue(field);
    if (v === MIXED || typeof v !== 'string') return undefined;
    return v;
  }

  /**
   * Read a url(#id) style field (clipPath, mask) and unwrap to bare
   * `id` — that's what the dropdown's mat-option values use. Returns
   * `undefined` for mixed/missing values (dropdown falls back to `''`,
   * which is the "(none)" option).
   */
  protected compositionRefValue(field: 'clipPath' | 'mask'): string | undefined {
    const v = this.commonStyleValue(field);
    if (v === MIXED || typeof v !== 'string' || v.length === 0) return undefined;
    // Extract id from "url(#id)" — tolerant of whitespace + quotes.
    const m = /^url\(\s*['"]?#([^'"\s)]+)['"]?\s*\)$/.exec(v.trim());
    return m === null ? undefined : m[1];
  }

  /**
   * Write a string style field with the "clear when value === default"
   * sugar. `mixBlendMode: 'normal'` is the CSS default — writing it
   * explicitly would persist the attribute on the SVG even though it
   * has no visual effect, so we clear instead. The user's choice of
   * "normal" in the dropdown thus reverts to the implicit default.
   */
  protected setCompositionString(field: 'mixBlendMode', value: string): void {
    const ids = this.editableIdsForStyle();
    if (ids.length === 0) return;
    const newValue: string | undefined = value === 'normal' ? undefined : value;
    const current = this.commonStyleValue(field);
    if (current !== MIXED && current === newValue) return;
    this.bus.dispatch(new SetStylePropertyOnManyCommand(ids, field, newValue));
  }

  /**
   * Write a clipPath / mask reference by wrapping the bare id in
   * `url(#id)`. The "(none)" option's value is `''` — that clears the
   * property (passes `undefined` to the command, the renderer's `?? null`
   * then removes the attribute).
   */
  protected setCompositionRef(field: 'clipPath' | 'mask', id: string): void {
    const ids = this.editableIdsForStyle();
    if (ids.length === 0) return;
    const newValue: string | undefined = id === '' ? undefined : `url(#${id})`;
    const current = this.commonStyleValue(field);
    if (current !== MIXED && current === newValue) return;
    this.bus.dispatch(new SetStylePropertyOnManyCommand(ids, field, newValue));
  }

  // ── D-068 — Type section (text-only) ─────────────────────────────

  /**
   * Focused node downcast to `TextNode` when applicable. Drives the
   * `@if` guard around the Type section in the template. Returns `null`
   * for any non-text node (or no/multi selection), which collapses the
   * section to nothing — zero impact for shape/group/image users.
   */
  protected readonly textNode: Signal<TextNode | null> = computed(() => {
    const node = this.focusNode();
    return node !== null && node.type === 'text' ? (node as TextNode) : null;
  });

  /**
   * All `path` nodes in the current document — feeds the textPath
   * dropdown. Recomputes only when the document signal changes. The
   * label prefers `metadata.name` (user-set in Layer Panel rename)
   * with the short id appended for disambiguation; falls back to the
   * short id alone when no name is set.
   *
   * **Why only paths, not all shapes**: SVG `<textPath href>` accepts
   * only `<path>` elements (other geometric primitives don't have an
   * intrinsic parametric curve). Listing rects/ellipses would create
   * a non-working option. Users who want text on a circle should
   * "Convert to Path" first (already a 1-click op in the Inspector).
   */
  protected readonly pathsInDoc: Signal<readonly { id: NodeId; label: string }[]> = computed(() => {
    const out: { id: NodeId; label: string }[] = [];
    walk(this.state.document().root, (n) => {
      if (n.type === 'path') {
        const name = n.metadata?.name;
        const short = n.id.slice(0, 6);
        out.push({
          id: n.id,
          label:
            typeof name === 'string' && name.length > 0 ? `${name} (${short})` : n.id.slice(0, 8),
        });
      }
    });
    return out;
  });

  /**
   * OpenType feature quick-toggle catalog. Limited to the 4 most-used
   * features (Figma/Illustrator selection) — `liga` (ligatures),
   * `smcp` (small caps), `tnum` (tabular figures), `ss01` (stylistic
   * set 1). Users who want anything else use the raw input below.
   *
   * Each entry's `tag` matches the 4-letter OpenType feature code
   * exactly; `label` is the chip text; `title` is the tooltip
   * (descriptive name).
   */
  protected readonly OPENTYPE_QUICK_TOGGLES: readonly {
    readonly tag: string;
    readonly label: string;
    readonly title: string;
  }[] = [
    { tag: 'liga', label: 'Liga', title: 'Standard ligatures (fi, fl, …)' },
    { tag: 'smcp', label: 'SmCp', title: 'Small caps' },
    { tag: 'tnum', label: 'TNum', title: 'Tabular figures (monospaced digits)' },
    { tag: 'ss01', label: 'SS01', title: 'Stylistic set 1 (font-specific)' },
  ];

  /**
   * Helper to dispatch a `SetPropertyCommand` on the focused text node
   * for one of the D-068 text fields. Defensive guards:
   *
   * - No-op when no text node is focused.
   * - No-op when the node is locked (mirrors all other setters).
   * - Dedup: skips when the new value equals the current — keeps the
   *   undo stack clean from blur-without-change UX.
   *
   * The `as TextNode[K]` cast is required because TypeScript narrows
   * the generic `K` to a specific key but loses the `value` -> `TextNode[K]`
   * relationship across the dispatch boundary. Safe because every
   * caller hard-codes K and the runtime type matches the declared one.
   */
  private setTextProperty<K extends keyof TextNode>(
    field: K,
    value: TextNode[K] | undefined,
  ): void {
    const text = this.textNode();
    if (text === null || this.layers.isLocked(text.id)) return;
    if (text[field] === value) return;
    this.bus.dispatch(new SetPropertyCommand<TextNode, K>(text.id, field, value as TextNode[K]));
  }

  /**
   * Letter-spacing setter. Empty string clears the field (`undefined`),
   * which lets the renderer fall back to the SVG default (auto). Non-
   * finite input is ignored silently (consistent with `setNumber`).
   */
  protected setLetterSpacing(raw: string): void {
    const trimmed = raw.trim();
    if (trimmed === '') {
      this.setTextProperty('letterSpacing', undefined);
      return;
    }
    const v = Number(trimmed);
    if (!Number.isFinite(v)) return;
    this.setTextProperty('letterSpacing', v);
  }

  /** Variable-font axes raw setter. Empty clears the field. */
  protected setFontVariationSettings(raw: string): void {
    const trimmed = raw.trim();
    this.setTextProperty('fontVariationSettings', trimmed === '' ? undefined : trimmed);
  }

  /** OpenType features raw setter. Empty clears the field. */
  protected setFontFeatureSettings(raw: string): void {
    const trimmed = raw.trim();
    this.setTextProperty('fontFeatureSettings', trimmed === '' ? undefined : trimmed);
  }

  /**
   * textPath dropdown setter. The "(none)" option's value is `''` —
   * that clears `textPathRef` (renderer falls back to straight-line
   * layout) AND clears `textPathStartOffset` to avoid leaving an
   * orphan offset attached to no path.
   */
  protected setTextPathRef(id: string): void {
    if (id === '') {
      this.setTextProperty('textPathRef', undefined);
      this.setTextProperty('textPathStartOffset', undefined);
      return;
    }
    this.setTextProperty('textPathRef', id as NodeId);
  }

  /** Start-offset setter (free-form CSS length: `'50%'` / `'40'`). */
  protected setTextPathStartOffset(raw: string): void {
    const trimmed = raw.trim();
    this.setTextProperty('textPathStartOffset', trimmed === '' ? undefined : trimmed);
  }

  /**
   * True when the OpenType feature tag is currently enabled in the
   * focused text node's `fontFeatureSettings`. Drives the `.active`
   * highlight on the quick-toggle chips.
   */
  protected hasFontFeature(tag: string): boolean {
    const text = this.textNode();
    if (text === null) return false;
    return parseFontFeatures(text.fontFeatureSettings).get(tag) === true;
  }

  /**
   * Toggle an OpenType feature tag in the focused text node's
   * `fontFeatureSettings`. Round-trips through parse → mutate → stringify
   * so existing tags the user typed in the raw input are preserved
   * (only the toggled tag is added/removed).
   */
  protected toggleFontFeature(tag: string): void {
    const text = this.textNode();
    if (text === null || this.layers.isLocked(text.id)) return;
    const features = parseFontFeatures(text.fontFeatureSettings);
    if (features.get(tag) === true) features.delete(tag);
    else features.set(tag, true);
    const next = stringifyFontFeatures(features);
    this.setTextProperty('fontFeatureSettings', next === '' ? undefined : next);
  }

  // ── D-069 — Typography basics (Inspector UI for pre-existing model
  // fields fontSize / fontFamily / fontWeight / textAnchor PLUS three
  // new fields fontStyle / textDecoration / lineHeight introduced here.
  // Surfaces in the Inspector Type section ABOVE the D-068 advanced
  // controls so common-case edits come first.

  /**
   * Curated list of web-safe + popular UI font stacks. Users who need
   * something else pick "Custom…" and type their own family. Stacks
   * include the obvious fallbacks (sans-serif / serif / monospace) so
   * the chosen font degrades gracefully when not available.
   */
  protected readonly FONT_FAMILY_PRESETS: readonly {
    readonly label: string;
    readonly value: string;
  }[] = [
    { label: 'System sans', value: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    { label: 'System serif', value: 'Georgia, "Times New Roman", serif' },
    { label: 'System mono', value: '"JetBrains Mono", "Fira Code", Consolas, Menlo, monospace' },
    { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
    { label: 'Helvetica', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
    { label: 'Times', value: '"Times New Roman", Times, serif' },
    { label: 'Courier', value: '"Courier New", Courier, monospace' },
    { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
    { label: 'Tahoma', value: 'Tahoma, Geneva, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
  ];

  /**
   * Standard CSS font-weight numeric ladder (100 = Thin … 900 = Black).
   * Weights the loaded font doesn't ship are gracefully synthesised by
   * the browser, so listing all 9 is safe.
   */
  protected readonly FONT_WEIGHT_PRESETS: readonly {
    readonly label: string;
    readonly value: number;
  }[] = [
    { label: '100 Thin', value: 100 },
    { label: '200 ExtraLight', value: 200 },
    { label: '300 Light', value: 300 },
    { label: '400 Regular', value: 400 },
    { label: '500 Medium', value: 500 },
    { label: '600 SemiBold', value: 600 },
    { label: '700 Bold', value: 700 },
    { label: '800 ExtraBold', value: 800 },
    { label: '900 Black', value: 900 },
  ];

  /**
   * SVG `text-anchor` values mapped to icons + tooltips. SVG default is
   * `'start'` (mirrors CSS `text-align: left` in LTR), but Inkscape /
   * Figma users expect a 3-way control — surface the full set.
   */
  protected readonly TEXT_ANCHOR_OPTIONS: readonly {
    readonly value: 'start' | 'middle' | 'end';
    readonly icon: string;
    readonly title: string;
  }[] = [
    { value: 'start', icon: 'format_align_left', title: 'Left (start)' },
    { value: 'middle', icon: 'format_align_center', title: 'Center (middle)' },
    { value: 'end', icon: 'format_align_right', title: 'Right (end)' },
  ];

  /**
   * Returns the `<mat-select>` value for the family field: the matching
   * preset value when `text.fontFamily` equals one of them, `'__custom__'`
   * when set to something else (triggers the custom input), or `''`
   * (the "(default)" option) when undefined.
   */
  protected fontFamilyValue(): string {
    const text = this.textNode();
    if (text === null) return '';
    const ff = text.fontFamily;
    if (ff === undefined || ff === '') return '';
    const preset = this.FONT_FAMILY_PRESETS.find((p) => p.value === ff);
    return preset ? preset.value : '__custom__';
  }

  /** True when the current fontFamily is custom (not a preset, not empty). */
  protected isCustomFontFamily(): boolean {
    return this.fontFamilyValue() === '__custom__';
  }

  /**
   * Apply a preset (or `''` = clear, or `__custom__` = no-op until the
   * user types in the custom input below). Custom values flow through
   * {@link setFontFamilyCustom}.
   */
  protected setFontFamilyPreset(value: string): void {
    if (value === '__custom__') return; // custom input handles it
    this.setTextProperty('fontFamily', value === '' ? undefined : value);
  }

  /** Set fontFamily to a raw string; empty clears. */
  protected setFontFamilyCustom(raw: string): void {
    const trimmed = raw.trim();
    this.setTextProperty('fontFamily', trimmed === '' ? undefined : trimmed);
  }

  /** Set fontSize; empty / non-finite / <= 0 clears (never writes garbage). */
  protected setFontSize(raw: string): void {
    const trimmed = raw.trim();
    if (trimmed === '') {
      this.setTextProperty('fontSize', undefined);
      return;
    }
    const v = Number(trimmed);
    if (!Number.isFinite(v) || v <= 0) return;
    this.setTextProperty('fontSize', v);
  }

  /**
   * Returns the `<mat-select>` value for the font-weight field. Stringified
   * because `mat-select` value matching is type-sensitive — keying on
   * numbers vs strings differs across Material versions. Stringify on
   * both ends for stability.
   */
  protected fontWeightValue(): string {
    const text = this.textNode();
    if (text === null) return '';
    const fw = text.fontWeight;
    if (fw === undefined) return '';
    return String(fw);
  }

  /** Apply a font-weight preset (`''` clears). Parses string from mat-select. */
  protected setFontWeight(value: string): void {
    if (value === '') {
      this.setTextProperty('fontWeight', undefined);
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    this.setTextProperty('fontWeight', n);
  }

  /** Set text-anchor; `'start'` is the SVG default — written explicitly. */
  protected setTextAnchor(value: 'start' | 'middle' | 'end'): void {
    this.setTextProperty('textAnchor', value);
  }

  /**
   * Toggle italic on/off. Writes `'italic'` when activating, `undefined`
   * when deactivating (mirrors textPath: don't persist defaults that
   * have no visual effect). The toggle is based on the CURRENT value,
   * so click-while-italic flips back to normal.
   */
  protected toggleItalic(): void {
    const text = this.textNode();
    if (text === null) return;
    const next: 'italic' | undefined = text.fontStyle === 'italic' ? undefined : 'italic';
    this.setTextProperty('fontStyle', next);
  }

  /**
   * Mutually-exclusive decoration toggle. Re-clicking the active value
   * clears (returns to undefined). SVG `text-decoration` accepts
   * `'underline overline line-through'` combined, but the chip control
   * here is single-value by design — designers wanting layered
   * decoration can author the SVG manually.
   */
  protected toggleDecoration(value: 'underline' | 'line-through'): void {
    const text = this.textNode();
    if (text === null) return;
    const next = text.textDecoration === value ? undefined : value;
    this.setTextProperty('textDecoration', next);
  }

  /**
   * Set lineHeight as a unitless multiplier. Empty clears (renderer
   * falls back to 1.2). Refuses values <= 0 (would collapse multi-line
   * onto the same baseline — almost never intended).
   */
  protected setLineHeight(raw: string): void {
    const trimmed = raw.trim();
    if (trimmed === '') {
      this.setTextProperty('lineHeight', undefined);
      return;
    }
    const v = Number(trimmed);
    if (!Number.isFinite(v) || v <= 0) return;
    this.setTextProperty('lineHeight', v);
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
/**
 * **D-068 — pure helper**. Parse a CSS `font-feature-settings` value
 * into a `Map<tag, enabled>`. Tolerant of both quote styles and both
 * toggle syntaxes the spec allows:
 *
 * - `'liga' on` / `'liga' off`
 * - `'liga' 1` / `'liga' 0` / `'liga' 2` (alt-index, treated as on)
 * - `'liga'` (no value → defaults to on per CSS spec)
 *
 * Returns an empty map for `undefined`, empty string, or unparseable
 * input. The map preserves whatever order the input had, which keeps
 * the round-trip via {@link stringifyFontFeatures} deterministic for
 * the inspector toggle UI.
 *
 * Exported so the inspector spec can verify parse/toggle correctness
 * without going through the component boilerplate.
 */
export function parseFontFeatures(raw: string | undefined): Map<string, boolean> {
  const out = new Map<string, boolean>();
  if (raw === undefined || raw.trim() === '') return out;
  // [tag] then optional whitespace + on/off|0/1+ numeric. Numeric ≥ 1
  // means "on" (alt-index selector); only literal "off" or "0" means off.
  const re = /['"]([a-z0-9]{4})['"]\s*(?:(on|off)|(-?\d+))?/gi;
  for (const m of raw.matchAll(re)) {
    const tag = m[1]!.toLowerCase();
    const onOff = m[2]?.toLowerCase();
    const num = m[3];
    const enabled = !(onOff === 'off' || num === '0');
    out.set(tag, enabled);
  }
  return out;
}

/**
 * **D-068 — pure helper**. Inverse of {@link parseFontFeatures}. Emits
 * only `on` features (off entries are dropped because the CSS default
 * is already "feature off" for non-default features, so a `'tag' off`
 * declaration would be a no-op). Quote style is single-quote (matches
 * the canonical spec examples).
 */
export function stringifyFontFeatures(features: ReadonlyMap<string, boolean>): string {
  const entries: string[] = [];
  for (const [tag, on] of features) {
    if (on) entries.push(`'${tag}'`);
  }
  return entries.join(', ');
}

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
