import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { RenameAutoFocus } from './rename-autofocus.directive';
import { MatIconButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatFormField, MatPrefix, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatMenu, MatMenuTrigger } from '@angular/material/menu';
import {
  CommandBus,
  CreateLayerCommand,
  EditorStateService,
  findNodeById,
  findParent,
  type GroupNode,
  isGroupNode,
  isLayer,
  isPage,
  isSmartObject,
  MakeLayerCommand,
  MoveNodeInTreeCommand,
  type NodeId,
  SetPropertyCommand,
  type SvgMetadata,
  type SvgNode,
  type SvgNodeType,
  UnmakeLayerCommand,
} from 'svg-engine/core';
import { IsolationService, LayersService, SelectionService } from 'svg-engine/edit';

/**
 * Where a dragged row would land relative to the hovered row. Drives
 * both the visual drop indicator and the `MoveNodeInTreeCommand`
 * dispatch on `drop`.
 *
 * - `before` / `after`: become sibling at index ±1 of target inside
 *   target's parent
 * - `inside`: become child of target (only valid when target is a
 *   group), inserted at index 0 (front of children list)
 */
type DropPosition = 'before' | 'after' | 'inside';

interface DropTarget {
  readonly id: NodeId;
  readonly position: DropPosition;
}

const TYPE_ICON: Readonly<Record<SvgNode['type'], string>> = {
  group: 'folder',
  rect: 'rectangle',
  ellipse: 'circle',
  line: 'show_chart',
  polygon: 'pentagon',
  polyline: 'timeline',
  path: 'gesture',
  text: 'text_fields',
  image: 'image',
  // D-059 — symbol instance (renders via <use href="#id">).
  'symbol-use': 'star_outline',
};

/**
 * Layers panel (Fase 4 Bloco 4b). Hierarchical view of the document
 * tree with per-row visibility/lock toggles and selection sync.
 *
 * **Sourcing the tree**: reads `EditorStateService.document().root`
 * automatically. Top-level groups are flattened (the root itself is
 * implicit — its children are the layers shown).
 *
 * **Selection sync**:
 * - Click a row → `SelectionService.select(id)` (single-select).
 * - Ctrl/Cmd-click → `toggle(id)` (add/remove from selection).
 * - Shift-click → `addToSelection(id)` (range fill is a future polish).
 * - Currently-selected ids get the `.selected` class for highlighting.
 *
 * **Visibility / Lock**:
 * - Eye icon toggles `LayersService.toggleVisible(id)`. The actual
 *   hiding of the rendered SVG happens in the `[svgeLayersFilter]`
 *   directive (which the consumer attaches to the renderer).
 * - Padlock icon toggles `LayersService.toggleLocked(id)`. The lock
 *   flag is exposed via `LayersService.isLocked(id)` for consumers
 *   (selection / hit-testing) to consult — this panel only sets the
 *   flag, doesn't enforce read-only-ness elsewhere.
 *
 * **Recursion**: groups expand inline (recursive component reference
 * via `@for` + the same selector). No CDK Tree for now — keep the
 * surface small. CDK Tree can replace the recursion later for
 * keyboard-nav / virtualization without changing the public API.
 *
 * **Drag-drop reorder** (Bloco 4b-DnD ✅): each tree row is a drop
 * target; dragging a row over another fires `MoveNodeInTreeCommand`
 * (atomic reorder + undo) with auto-scroll for long trees and
 * before/after/inside drop-zone discrimination based on cursor Y.
 *
 * Usage:
 * ```html
 * <svge-layers-panel></svge-layers-panel>
 * <!-- or, scoped to a non-default tree -->
 * <svge-layers-panel [root]="customRoot"></svge-layers-panel>
 * ```
 */
@Component({
  selector: 'svge-layers-panel',
  standalone: true,
  imports: [
    MatCheckbox,
    MatFormField,
    MatIcon,
    MatIconButton,
    MatInput,
    MatMenu,
    MatMenuTrigger,
    MatPrefix,
    MatSuffix,
    NgTemplateOutlet,
    RenameAutoFocus,
  ],
  template: `
    <!--
      **D-071c** — Batch ops bar for multi-select. Appears only when
      ≥2 layers are selected. Provides one-click Lock-all / Unlock-all
      / Hide-all / Show-all on the current selection — operations the
      user can do row-by-row but tediously. Sits ABOVE the search/filter
      header so it's the first thing visible when multi-select is
      active. Hidden in single-select / no-select to avoid clutter.
    -->
    @if (batchCount() > 1) {
      <div class="batch-bar" role="toolbar" [attr.aria-label]="batchCount() + ' selected'">
        <span class="batch-label">{{ batchCount() }} selected</span>
        <div class="batch-actions">
          <button
            type="button"
            class="batch-btn"
            [title]="batchAllLocked() ? 'Unlock all selected' : 'Lock all selected'"
            [attr.aria-label]="batchAllLocked() ? 'Unlock all selected' : 'Lock all selected'"
            (click)="batchToggleLock()"
          >
            <mat-icon>{{ batchAllLocked() ? 'lock_open' : 'lock' }}</mat-icon>
          </button>
          <button
            type="button"
            class="batch-btn"
            [title]="batchAllHidden() ? 'Show all selected' : 'Hide all selected'"
            [attr.aria-label]="batchAllHidden() ? 'Show all selected' : 'Hide all selected'"
            (click)="batchToggleVisibility()"
          >
            <mat-icon>{{ batchAllHidden() ? 'visibility' : 'visibility_off' }}</mat-icon>
          </button>
        </div>
      </div>
    }

    <!--
      **D-072 — Logical Layers**. Panel-level action bar with a single
      "New Layer" button. Always visible (even when the panel is empty)
      so the user has a discoverable entry point to start populating
      the document — matches the Illustrator / Affinity pattern of
      always-on layer-creation controls. Compact (single button) so it
      doesn't push the search bar / batch bar off-screen.
    -->
    <div class="actions-bar" role="toolbar" aria-label="Layer actions">
      <button
        mat-icon-button
        type="button"
        class="new-layer-btn"
        title="New Layer"
        aria-label="New Layer"
        (click)="createNewLayer()"
      >
        <mat-icon>add</mat-icon>
      </button>
    </div>

    <!--
      Search + filter header (Illustrator convention). Hidden when the
      panel is empty (no document/children) so it doesn't clutter the
      "empty state" message.
    -->
    @if (children().length > 0) {
      <header class="filters-bar" role="search">
        <mat-form-field class="search-field" appearance="outline" subscriptSizing="dynamic">
          <mat-icon matPrefix aria-hidden="true">search</mat-icon>
          <input
            matInput
            type="search"
            placeholder="Search layers"
            aria-label="Search layers"
            [value]="searchText()"
            (input)="onSearchInput($event)"
          />
          @if (searchText().length > 0) {
            <button
              mat-icon-button
              matSuffix
              type="button"
              aria-label="Clear search"
              (click)="clearSearch()"
            >
              <mat-icon>close</mat-icon>
            </button>
          }
        </mat-form-field>
        <button
          mat-icon-button
          type="button"
          class="filter-trigger"
          [attr.aria-label]="
            filterCount() > 0 ? 'Filters (' + filterCount() + ' active)' : 'Filters'
          "
          [class.has-active]="filterCount() > 0"
          [matMenuTriggerFor]="filterMenu"
        >
          <mat-icon>filter_list</mat-icon>
          @if (filterCount() > 0) {
            <span class="badge" aria-hidden="true">{{ filterCount() }}</span>
          }
        </button>
        <!--
          disableClose: menu stays open as the user toggles multiple
          checkboxes (default behaviour would close on every click).
          Replaces the older (click)="$event.stopPropagation()" trick
          and keeps the template lint-clean for a11y rules.
        -->
        <mat-menu
          #filterMenu="matMenu"
          class="layers-filter-menu"
          [overlapTrigger]="false"
          xPosition="before"
        >
          <div class="filter-menu-content">
            <div class="filter-group-title">By object</div>
            @for (opt of typeFilterOptions; track opt.type) {
              <mat-checkbox
                class="filter-row"
                [checked]="typeFilters().has(opt.type)"
                (change)="toggleTypeFilter(opt.type)"
                (click)="$event.stopPropagation()"
              >
                <span class="filter-row-label">
                  <mat-icon class="filter-row-icon" aria-hidden="true">{{ opt.icon }}</mat-icon>
                  {{ opt.label }}
                </span>
              </mat-checkbox>
            }
            <hr class="filter-separator" aria-hidden="true" />
            <div class="filter-group-title">By state</div>
            <mat-checkbox
              class="filter-row"
              [checked]="stateFilters().has('locked')"
              (change)="toggleStateFilter('locked')"
              (click)="$event.stopPropagation()"
            >
              <span class="filter-row-label">
                <mat-icon class="filter-row-icon" aria-hidden="true">lock</mat-icon>
                Locked
              </span>
            </mat-checkbox>
            <mat-checkbox
              class="filter-row"
              [checked]="stateFilters().has('hidden')"
              (change)="toggleStateFilter('hidden')"
              (click)="$event.stopPropagation()"
            >
              <span class="filter-row-label">
                <mat-icon class="filter-row-icon" aria-hidden="true">visibility_off</mat-icon>
                Hidden
              </span>
            </mat-checkbox>
            @if (filterCount() > 0) {
              <hr class="filter-separator" aria-hidden="true" />
              <button type="button" class="filter-clear-all" (click)="clearAllFilters()">
                Clear all filters
              </button>
            }
          </div>
        </mat-menu>
      </header>
    }

    <div class="layers-list" role="tree" [attr.aria-label]="'Layers panel'">
      @if (resultCount() === 0 && (searchText().length > 0 || filterCount() > 0)) {
        <p class="empty">No matching layers</p>
      } @else {
        @for (child of children(); track child.id) {
          <ng-container *ngTemplateOutlet="rowTpl; context: { $implicit: child, depth: 0 }" />
        } @empty {
          <p class="empty">No layers</p>
        }
      }
    </div>

    <ng-template #rowTpl let-node let-depth="depth">
      @if (showsRow()(node.id)) {
        <div
          class="row"
          role="treeitem"
          [draggable]="!isLocked()(node.id)"
          [tabindex]="isLocked()(node.id) ? -1 : 0"
          [class.selected]="isSelected()(node.id)"
          [class.is-layer]="isLayerNode(node)"
          [class.is-smart-object]="isSmartObjectNode(node)"
          [class.locked]="isLocked()(node.id)"
          [class.dim-non-match]="filterCount() > 0 && !isMatch()(node.id)"
          [class.hidden]="!isVisible()(node.id)"
          [class.dragging]="dragSourceId() === node.id"
          [class.drop-before]="dropTarget()?.id === node.id && dropTarget()?.position === 'before'"
          [class.drop-after]="dropTarget()?.id === node.id && dropTarget()?.position === 'after'"
          [class.drop-inside]="dropTarget()?.id === node.id && dropTarget()?.position === 'inside'"
          [style.padding-left.px]="8 + depth * 16"
          [attr.aria-selected]="isSelected()(node.id)"
          [attr.aria-disabled]="isLocked()(node.id)"
          [attr.aria-level]="depth + 1"
          [attr.aria-expanded]="isGroup(node) ? expanded().has(node.id) : null"
          [attr.aria-label]="
            label(node) +
            (isLocked()(node.id) ? ', locked' : '') +
            (!isVisible()(node.id) ? ', hidden' : '')
          "
          (click)="onRowClick($event, node.id)"
          (dblclick)="onRowDoubleClick($event, node)"
          (keydown.enter)="onRowKey($any($event), node.id)"
          (keydown.space)="onRowKey($any($event), node.id)"
          (keydown.f2)="onRowRenameKey($any($event), node.id)"
          (keydown.arrowup)="onRowArrowKey($any($event), 'up')"
          (keydown.arrowdown)="onRowArrowKey($any($event), 'down')"
          (keydown.arrowright)="onRowExpandKey($any($event), node, 'open')"
          (keydown.arrowleft)="onRowExpandKey($any($event), node, 'close')"
          (keydown.home)="onRowArrowKey($any($event), 'home')"
          (keydown.end)="onRowArrowKey($any($event), 'end')"
          (dragstart)="onDragStart($event, node.id)"
          (dragover)="onDragOver($event, node)"
          (dragleave)="onDragLeave($event, node.id)"
          (drop)="onDrop($event, node)"
          (dragend)="onDragEnd()"
        >
          @if (isGroup(node)) {
            <button
              mat-icon-button
              type="button"
              class="expand"
              (click)="toggleExpand($event, node.id)"
              [attr.aria-label]="
                expanded().has(node.id) ? 'Collapse ' + label(node) : 'Expand ' + label(node)
              "
            >
              <mat-icon>{{ expanded().has(node.id) ? 'expand_more' : 'chevron_right' }}</mat-icon>
            </button>
          } @else {
            <span class="expand-spacer" aria-hidden="true"></span>
          }

          <mat-icon class="type-icon" [attr.aria-hidden]="true">{{ iconFor(node) }}</mat-icon>
          @if (renamingId() === node.id) {
            <!--
              Inline rename input — replaces the label span while the
              row is in rename mode. Focused programmatically via
              renameAutoFocus directive (autofocus attribute is rejected
              by a11y lint). Enter commits, Esc cancels; blur also
              commits (matches Affinity: a click elsewhere is "save").
            -->
            <input
              svgeRenameAutoFocus
              class="rename-input"
              type="text"
              [value]="label(node)"
              (click)="$event.stopPropagation()"
              (keydown.enter)="commitRename($event, node)"
              (keydown.escape)="cancelRename()"
              (blur)="commitRename($event, node)"
            />
          } @else {
            <span class="label" (dblclick)="startRename($event, node.id)">{{ label(node) }}</span>
          }

          <span class="actions">
            <button
              mat-icon-button
              type="button"
              class="visibility"
              [attr.aria-label]="
                isVisible()(node.id) ? 'Hide ' + label(node) : 'Show ' + label(node)
              "
              (click)="onToggleVisible($event, node.id)"
            >
              <mat-icon>{{ isVisible()(node.id) ? 'visibility' : 'visibility_off' }}</mat-icon>
            </button>
            <button
              mat-icon-button
              type="button"
              class="lock"
              [attr.aria-label]="
                isLocked()(node.id) ? 'Unlock ' + label(node) : 'Lock ' + label(node)
              "
              (click)="onToggleLocked($event, node.id)"
            >
              <mat-icon>{{ isLocked()(node.id) ? 'lock' : 'lock_open' }}</mat-icon>
            </button>
          </span>
        </div>
      }
      @if (
        (isGroup(node) && expanded().has(node.id)) ||
        (isGroup(node) && autoExpandedIds().has(node.id))
      ) {
        @for (child of node.children; track child.id) {
          <ng-container
            *ngTemplateOutlet="rowTpl; context: { $implicit: child, depth: depth + 1 }"
          />
        }
      }
    </ng-template>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-size: 13px;
      background: var(--mat-sys-surface-container, #fafafa);
    }
    /* D-071c — Batch ops bar (multi-select only). Sits at the very
       top of the panel, above the search/filter header. Uses a tinted
       background to make it visually distinct from the regular header. */
    .batch-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 10px;
      flex: 0 0 auto;
      background: var(--mat-sys-secondary-container, rgba(25, 118, 210, 0.08));
      color: var(--mat-sys-on-secondary-container, inherit);
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      font-size: 12px;
    }
    .batch-label {
      font-weight: 500;
    }
    .batch-actions {
      display: inline-flex;
      gap: 4px;
    }
    .batch-btn {
      width: 28px;
      height: 26px;
      padding: 0;
      border: 1px solid var(--mat-sys-outline-variant, #ccc);
      border-radius: 4px;
      background: var(--mat-sys-surface, #fff);
      color: var(--mat-sys-on-surface, inherit);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 100ms;
    }
    .batch-btn:hover {
      background: var(--mat-sys-surface-container-high, #eee);
    }
    .batch-btn .mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    /* D-072 — Layer-creation action bar. Single "+" button at the top
       of the panel; always visible (even when the layer list is empty)
       so users have a discoverable entry point to start adding layers.
       Right-aligned to mirror Illustrator/Affinity's bottom-bar
       convention while keeping the search field unobstructed. */
    .actions-bar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      padding: 2px 6px;
      flex: 0 0 auto;
      background: var(--mat-sys-surface-container, transparent);
    }
    .new-layer-btn {
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      --mdc-icon-button-state-layer-size: 28px;
      --mat-icon-button-touch-target-display: none;
    }
    .new-layer-btn mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      line-height: 18px;
    }
    /* Header: search field + filter trigger. Stays pinned at the top
       while the layers list below scrolls — common panel UX (Illustrator,
       Affinity, Figma). */
    .filters-bar {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 8px;
      flex: 0 0 auto;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      background: var(--mat-sys-surface-container-low, #f5f5f5);
    }
    .search-field {
      flex: 1 1 auto;
      min-width: 0;
      /* Compress Material outline density so the field fits a small
         panel header without overflowing. */
      --mat-form-field-container-vertical-padding: 4px;
    }
    .search-field .mat-mdc-form-field-flex {
      min-height: 32px;
    }
    .filter-trigger {
      position: relative;
      flex: 0 0 auto;
    }
    .filter-trigger.has-active {
      color: var(--mat-sys-primary, #1976d2);
    }
    .filter-trigger .badge {
      position: absolute;
      top: 2px;
      right: 2px;
      min-width: 14px;
      height: 14px;
      padding: 0 3px;
      border-radius: 7px;
      background: var(--mat-sys-primary, #1976d2);
      color: var(--mat-sys-on-primary, #fff);
      font-size: 9px;
      font-weight: 700;
      line-height: 14px;
      text-align: center;
      pointer-events: none;
    }
    .layers-list {
      display: flex;
      flex-direction: column;
      padding: 4px 0;
      flex: 1 1 auto;
      overflow-y: auto;
      min-height: 0;
    }
    .empty {
      padding: 16px;
      color: var(--mat-sys-on-surface-variant, #777);
      text-align: center;
      font-style: italic;
    }
    .row {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 0 8px 0 0;
      min-height: 32px;
      cursor: pointer;
      user-select: none;
    }
    .row:hover {
      background: var(--mat-sys-surface-container-high, #eee);
    }
    .row.selected {
      background: var(--mat-sys-primary-container, #cce4ff);
      color: var(--mat-sys-on-primary-container, #001a3a);
    }
    .row.hidden .label,
    .row.hidden .type-icon {
      opacity: 0.45;
      font-style: italic;
    }
    /* D-072 — Layer rows get a left accent stripe so the user can
       eye-scan the panel and see "where do my layers begin/end" at a
       glance — matches the Affinity panel's visual treatment. The
       accent uses the primary color and respects the depth padding
       added by the row's [style.padding-left] binding. */
    .row.is-layer {
      box-shadow: inset 3px 0 0 0 var(--mat-sys-primary, #1976d2);
    }
    .row.is-layer .label {
      font-weight: 500;
    }
    .row.is-layer .type-icon {
      color: var(--mat-sys-primary, #1976d2);
      opacity: 1;
    }
    /* D-074 — Smart Object rows get a secondary accent (different
       color from the primary-colored layer stripe) so layers and
       smart objects are visually distinguishable in a mixed tree.
       Uses the tertiary Material role when available, falls back
       to a warm amber. Icon color matches the stripe. */
    .row.is-smart-object {
      box-shadow: inset 3px 0 0 0 var(--mat-sys-tertiary, #d97706);
    }
    .row.is-smart-object .label {
      font-weight: 500;
    }
    .row.is-smart-object .type-icon {
      color: var(--mat-sys-tertiary, #d97706);
      opacity: 1;
    }
    .row.locked {
      cursor: not-allowed;
    }
    .row.locked:hover {
      /* Override the default hover bg — locked rows shouldn't appear interactive */
      background: transparent;
    }
    .row.locked .label {
      color: var(--mat-sys-on-surface-variant, #777);
    }
    /* Material 3 mat-icon-button defaults to 40px with internal
       padding and a 48px hidden touch-target. Overriding width/height
       alone leaves the icon visually off-center because the inner
       padding and touch target keep their original sizing. Flex-
       centering + zero padding + state-layer + touch-target overrides
       line everything up perfectly inside the 28px hover circle.
       (Bloco 4b-DnD polish) */
    .expand,
    .visibility,
    .lock {
      width: 28px;
      height: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      --mdc-icon-button-state-layer-size: 28px;
      --mat-icon-button-touch-target-display: none;
    }
    .expand mat-icon,
    .visibility mat-icon,
    .lock mat-icon,
    .type-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      line-height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin: 0;
    }
    .expand-spacer {
      width: 28px;
      display: inline-block;
    }
    .type-icon {
      flex: 0 0 auto;
      opacity: 0.7;
    }
    .label {
      flex: 1 1 auto;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .actions {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      opacity: 0.5;
      transition: opacity 120ms;
    }
    .row:hover .actions,
    .row.selected .actions,
    .row.hidden .actions,
    .row.locked .actions {
      opacity: 1;
    }
    /* Bloco 4b-DnD: drag-drop reorder visual feedback.
       - .dragging: source row fades while being dragged
       - .drop-before/.drop-after: 2px primary-colored line above/below
       - .drop-inside: primary-colored ring around the row (group reparent) */
    .row.dragging {
      opacity: 0.4;
    }
    .row.drop-before {
      box-shadow: inset 0 2px 0 0 var(--mat-sys-primary, #1976d2);
    }
    .row.drop-after {
      box-shadow: inset 0 -2px 0 0 var(--mat-sys-primary, #1976d2);
    }
    .row.drop-inside {
      box-shadow: inset 0 0 0 2px var(--mat-sys-primary, #1976d2);
      background: var(--mat-sys-primary-container, #cce4ff);
    }
    /* When filters are active, rows that are only visible because they
       contain a match (ancestor groups) are de-emphasized — the match
       itself stays at full opacity. Helps the user scan results. */
    .row.dim-non-match .label,
    .row.dim-non-match .type-icon {
      opacity: 0.55;
    }
    /* Inline rename input — visually replaces the label span while
       editing. Sized to match the row's text metrics so the row
       height doesn't jump when entering/leaving rename mode. */
    .rename-input {
      flex: 1 1 auto;
      min-width: 0;
      padding: 2px 4px;
      margin: 0;
      font: inherit;
      color: inherit;
      background: var(--mat-sys-surface, #fff);
      border: 1px solid var(--mat-sys-primary, #1976d2);
      border-radius: 3px;
      outline: none;
    }
    .rename-input:focus {
      box-shadow: 0 0 0 2px var(--mat-sys-primary, rgba(25, 118, 210, 0.35));
    }
    /* Filter menu styles — mat-menu mounts via overlay (outside this
       component's view encapsulation) so we target it via the global
       \`.layers-filter-menu\` class set on the menu's panelClass. */
    ::ng-deep .layers-filter-menu .mat-mdc-menu-content {
      padding: 4px 0;
      min-width: 220px;
    }
    ::ng-deep .layers-filter-menu .filter-menu-content {
      padding: 4px 8px 8px;
    }
    ::ng-deep .layers-filter-menu .filter-group-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--mat-sys-on-surface-variant, #666);
      text-transform: uppercase;
      letter-spacing: 0.4px;
      padding: 6px 4px 2px;
    }
    ::ng-deep .layers-filter-menu .filter-row {
      display: flex;
      align-items: center;
      padding: 2px 4px;
      cursor: pointer;
      border-radius: 4px;
    }
    ::ng-deep .layers-filter-menu .filter-row:hover {
      background: var(--mat-sys-surface-container-high, #e8e8e8);
    }
    ::ng-deep .layers-filter-menu .filter-row-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    ::ng-deep .layers-filter-menu .filter-row-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--mat-sys-on-surface-variant, #666);
    }
    ::ng-deep .layers-filter-menu .filter-separator {
      border: 0;
      border-top: 1px solid var(--mat-sys-outline-variant, #e0e0e0);
      margin: 6px 0;
    }
    ::ng-deep .layers-filter-menu .filter-clear-all {
      width: 100%;
      padding: 6px 8px;
      background: transparent;
      border: 0;
      border-radius: 4px;
      color: var(--mat-sys-primary, #1976d2);
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    ::ng-deep .layers-filter-menu .filter-clear-all:hover {
      background: var(--mat-sys-surface-container-high, #e8e8e8);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayersPanel {
  private readonly state = inject(EditorStateService);
  private readonly selection = inject(SelectionService);
  private readonly layers = inject(LayersService);
  private readonly bus = inject(CommandBus);
  private readonly isolation = inject(IsolationService);
  private readonly elRef = inject(ElementRef<HTMLElement>);

  /**
   * Bloco 4b-DnD drag-drop reorder state.
   *
   * `dragSourceId`: id of the node currently being dragged (set on
   * `dragstart`, cleared on `dragend`). Drives the `.dragging`
   * opacity class on the source row.
   *
   * `dropTarget`: hovered drop position (set on `dragover`, cleared
   * on `dragleave` / `dragend`). Drives the `.drop-before`,
   * `.drop-after`, `.drop-inside` indicator classes on the target row.
   * `null` when no valid target is hovered (locked row, descendant of
   * source = would create cycle, source itself).
   */
  protected readonly dragSourceId = signal<NodeId | null>(null);
  protected readonly dropTarget = signal<DropTarget | null>(null);

  /**
   * Optional explicit root override. When omitted, the panel uses
   * `EditorStateService.document().root`. Useful for showing a
   * thumbnail / sub-tree inspector for a selected group.
   */
  readonly root = input<SvgNode | null>(null);

  /**
   * Set of group ids currently expanded in the panel. Starts empty
   * (all groups collapsed). Users discover children by clicking the
   * expand chevron.
   */
  protected readonly expanded = signal<ReadonlySet<NodeId>>(new Set());

  // ── Search + filter state (Illustrator-style header) ─────────────

  /** Current search query (case-insensitive substring match on label + id). */
  protected readonly searchText = signal<string>('');

  /**
   * Active "by object" filters. When the set is empty, **no** type
   * restriction is applied (all types pass). When non-empty, a node
   * passes only if its `type` is in the set.
   */
  protected readonly typeFilters = signal<ReadonlySet<SvgNodeType>>(new Set());

  /**
   * Active "by state" filters. Same emptiness semantics as
   * {@link typeFilters} — empty means no state restriction. When
   * non-empty, a node must satisfy EVERY state in the set (AND).
   */
  protected readonly stateFilters = signal<ReadonlySet<'locked' | 'hidden'>>(new Set());

  /**
   * Table of available type filters with display labels + icons (mat
   * icons matching the {@link TYPE_ICON} map). Static — declared as a
   * field so the template can `@for` over it. Order mirrors the
   * Illustrator panel (paths/shapes/text first, then groups, then
   * images).
   */
  protected readonly typeFilterOptions: readonly {
    type: SvgNodeType;
    label: string;
    icon: string;
  }[] = [
    { type: 'path', label: 'Path', icon: 'gesture' },
    { type: 'rect', label: 'Rect', icon: 'rectangle' },
    { type: 'ellipse', label: 'Ellipse', icon: 'circle' },
    { type: 'line', label: 'Line', icon: 'show_chart' },
    { type: 'polygon', label: 'Polygon', icon: 'pentagon' },
    { type: 'polyline', label: 'Polyline', icon: 'timeline' },
    { type: 'text', label: 'Text', icon: 'text_fields' },
    { type: 'image', label: 'Image', icon: 'image' },
    { type: 'group', label: 'Group', icon: 'folder' },
  ];

  /** Total number of distinct active filters (type + state). */
  protected readonly filterCount = computed(
    () => this.typeFilters().size + this.stateFilters().size,
  );

  /**
   * Predicate: does a node match all currently-active filters
   * (search text + type + state)? Pure on `node`; called per row.
   *
   * - Empty search + empty filters → always `true` (no filtering).
   * - Search compares against `label(node)` (lowercased) AND id
   *   (lowercased) — same surface the user sees / can copy from
   *   the inspector.
   * - Type filter passes when `typeFilters` is empty OR contains
   *   the node's type.
   * - State filters AND together: `locked` requires the node to be
   *   in `lockedIds`; `hidden` requires it to be in `hiddenIds`.
   */
  private matches(node: SvgNode): boolean {
    const q = this.searchText().trim().toLowerCase();
    if (q.length > 0) {
      const label = this.label(node).toLowerCase();
      const id = node.id.toLowerCase();
      if (!label.includes(q) && !id.includes(q)) return false;
    }
    const types = this.typeFilters();
    if (types.size > 0 && !types.has(node.type)) return false;
    const states = this.stateFilters();
    if (states.has('locked') && !this.layers.isLocked(node.id)) return false;
    if (states.has('hidden') && !this.layers.hiddenIds().has(node.id)) return false;
    return true;
  }

  /**
   * Set of node ids that themselves match the current filters. Drives
   * the `dim-non-match` class — ancestor groups are kept visible (so
   * the user can navigate into them) but visually de-emphasized.
   */
  protected readonly matchedIds = computed<ReadonlySet<NodeId>>(() => {
    // Touch reactive deps explicitly so the computed re-runs on any
    // filter change. (TS reads of `this.matches` don't capture deps;
    // we have to read the signals here.)
    this.searchText();
    this.typeFilters();
    this.stateFilters();
    this.layers.lockedIds();
    this.layers.hiddenIds();
    this.state.document();
    if (this.searchText().trim().length === 0 && this.filterCount() === 0) {
      return new Set();
    }
    const root = this.root() ?? this.state.document().root;
    const out = new Set<NodeId>();
    walkTree(root, (n) => {
      if (this.matches(n)) out.add(n.id);
    });
    return out;
  });

  /**
   * Set of group ids that must be force-expanded because they contain
   * at least one matching descendant. Without this, a match deep in a
   * collapsed group would never appear in the rendered list.
   */
  protected readonly autoExpandedIds = computed<ReadonlySet<NodeId>>(() => {
    const matched = this.matchedIds();
    if (matched.size === 0) return new Set();
    const root = this.root() ?? this.state.document().root;
    const ancestors = new Set<NodeId>();
    for (const id of matched) {
      let current = findParent(root as GroupNode, id);
      while (current !== null) {
        ancestors.add(current.id);
        const next = findParent(root as GroupNode, current.id);
        current = next;
      }
    }
    return ancestors;
  });

  /**
   * Set of node ids that should be **rendered** (the row is present in
   * the DOM). When filters are inactive this is "everything" — we
   * express that as a closure factory rather than materializing the
   * full id set every render.
   */
  protected readonly visibleIds = computed<ReadonlySet<NodeId> | null>(() => {
    if (this.searchText().trim().length === 0 && this.filterCount() === 0) return null;
    const matched = this.matchedIds();
    const ancestors = this.autoExpandedIds();
    const out = new Set<NodeId>(matched);
    for (const a of ancestors) out.add(a);
    return out;
  });

  /** Template helper: closure that says "should this id render?". */
  protected readonly showsRow = computed(() => {
    const visible = this.visibleIds();
    if (visible === null) return (): boolean => true;
    return (id: NodeId): boolean => visible.has(id);
  });

  /** Template helper: closure that says "is this id a direct match (not just an ancestor)?". */
  protected readonly isMatch = computed(() => {
    const matched = this.matchedIds();
    return (id: NodeId): boolean => matched.has(id);
  });

  /** Number of direct matches — drives the "No matching layers" empty state. */
  protected readonly resultCount = computed(() => this.matchedIds().size);

  // ── Search + filter event handlers ───────────────────────────────

  protected onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value ?? '';
    this.searchText.set(value);
  }

  protected clearSearch(): void {
    this.searchText.set('');
  }

  protected toggleTypeFilter(type: SvgNodeType): void {
    const next = new Set(this.typeFilters());
    if (next.has(type)) next.delete(type);
    else next.add(type);
    this.typeFilters.set(next);
  }

  protected toggleStateFilter(state: 'locked' | 'hidden'): void {
    const next = new Set(this.stateFilters());
    if (next.has(state)) next.delete(state);
    else next.add(state);
    this.stateFilters.set(next);
  }

  // ── D-071c — Batch lock/hide bar (multi-select only) ────────────

  /**
   * Number of currently-selected layers. Drives the visibility of the
   * batch-ops bar at the top of the panel. Hidden when 0 or 1 — at
   * that point per-row eye/lock icons are enough.
   */
  protected readonly batchCount = this.selection.count;

  /**
   * True when EVERY selected layer is already locked — flips the
   * Lock-all button label/icon to "Unlock all" so the user can revert.
   * Empty selection → false (button isn't shown anyway).
   */
  protected readonly batchAllLocked = computed(() => {
    const ids = Array.from(this.selection.selectedIds());
    if (ids.length === 0) return false;
    return ids.every((id) => this.layers.isLocked(id));
  });

  /**
   * True when EVERY selected layer is already hidden. Symmetric to
   * {@link batchAllLocked}.
   */
  protected readonly batchAllHidden = computed(() => {
    const ids = Array.from(this.selection.selectedIds());
    if (ids.length === 0) return false;
    return ids.every((id) => !this.layers.isVisible(id));
  });

  /**
   * Lock or unlock every selected layer in one shot. Smart toggle:
   * if all are locked, unlock all; otherwise lock all. Matches what
   * users expect from the Photoshop/Affinity "lock all selected"
   * conveniences.
   *
   * **Important**: locking the focused node causes `SelectionService`
   * to prune it (locked nodes can't stay selected per Bloco 4b-Lock).
   * We snapshot the id list BEFORE mutating so we don't lose anyone
   * mid-iteration when the locked side flips.
   */
  protected batchToggleLock(): void {
    const ids = Array.from(this.selection.selectedIds());
    if (ids.length === 0) return;
    const targetLocked = !this.batchAllLocked();
    for (const id of ids) {
      this.layers.setLocked(id, targetLocked);
    }
  }

  /**
   * Show or hide every selected layer in one shot. Same smart-toggle
   * semantics as {@link batchToggleLock}.
   */
  protected batchToggleVisibility(): void {
    const ids = Array.from(this.selection.selectedIds());
    if (ids.length === 0) return;
    const targetHidden = !this.batchAllHidden();
    for (const id of ids) {
      this.layers.setVisible(id, !targetHidden);
    }
  }

  protected clearAllFilters(): void {
    this.typeFilters.set(new Set());
    this.stateFilters.set(new Set());
  }

  /** Children of the resolved root (the panel doesn't show the root itself). */
  protected readonly children = computed<readonly SvgNode[]>(() => {
    const r = this.root() ?? this.state.document().root;
    if (!this.isGroup(r)) return [r];
    return r.children;
  });

  /**
   * Closure factories that the template uses inside `@for`. These
   * indirect through computeds so the inner `[class.selected]` etc.
   * re-evaluate when the underlying signal changes.
   */
  protected readonly isSelected = computed(() => {
    const ids = this.selection.selectedIds();
    return (id: NodeId): boolean => ids.has(id);
  });

  protected readonly isVisible = computed(() => {
    const hidden = this.layers.hiddenIds();
    return (id: NodeId): boolean => !hidden.has(id);
  });

  protected readonly isLocked = computed(() => {
    const locked = this.layers.lockedIds();
    return (id: NodeId): boolean => locked.has(id);
  });

  protected isGroup(node: SvgNode): node is GroupNode {
    return node.type === 'group';
  }

  protected iconFor(node: SvgNode): string {
    // **D-072 — Logical Layers**. Layer groups (groups carrying the
    // `metadata.customData.svgeKind === 'layer'` flag) get a distinct
    // `folder_special` icon so the user can visually distinguish them
    // from plain groups at a glance — Affinity convention. Plain
    // groups still render as `folder`. Non-group nodes fall through
    // to the type-based default.
    if (isLayer(node)) return 'folder_special';
    // **D-074 — Smart Objects**. Distinct icon (`inventory_2`)
    // signals "this is a self-contained imported/composed asset",
    // matching the Photoshop smart-object glyph convention. Like
    // layers, the icon is the panel's primary visual signal for
    // recognizing the kind at a glance.
    if (isSmartObject(node)) return 'inventory_2';
    return TYPE_ICON[node.type] ?? 'crop_square';
  }

  /**
   * **D-072** — Type-guard wrapper for the template so `@if (isLayer(...))`
   * compiles without importing the type-guard at template scope. Same
   * `isLayer` from core under the hood.
   */
  protected isLayerNode(node: SvgNode): node is GroupNode {
    return isLayer(node);
  }

  /**
   * **D-074** — Type-guard wrapper for the template so it can bind
   * `[class.is-smart-object]` without importing the type-guard.
   */
  protected isSmartObjectNode(node: SvgNode): node is GroupNode {
    return isSmartObject(node);
  }

  protected label(node: SvgNode): string {
    // Authored name (set via inline rename) wins. Falls back to a
    // type-based default — matches the inspector convention so the
    // user can recognize an "unnamed" node by its shape type.
    const authored = node.metadata?.name;
    if (typeof authored === 'string' && authored.length > 0) return authored;
    return `${node.type} ${node.id.slice(0, 6)}`;
  }

  // ── Inline rename (Affinity/Illustrator F2 + double-click on label) ──

  /**
   * Id of the row currently in rename mode (input replaces the span).
   * `null` when no rename in progress.
   */
  protected readonly renamingId = signal<NodeId | null>(null);

  /**
   * Enter rename mode for a row. Triggered by:
   *   - dblclick on the label span (event.stopPropagation prevents the
   *     row's own dblclick from also entering Isolation Mode)
   *   - F2 on the focused row
   *
   * Locked rows reject the rename — same policy as other mutations.
   * Once entered, the template renders an `<input autofocus>` in place
   * of the label; commit/cancel handlers manage the lifecycle.
   */
  protected startRename(event: Event, id: NodeId): void {
    event.stopPropagation();
    if (this.layers.isLocked(id)) return;
    this.renamingId.set(id);
  }

  /** Commit the rename input's value via SetPropertyCommand on the node's metadata. */
  protected commitRename(event: Event, node: SvgNode): void {
    if (this.renamingId() !== node.id) return;
    const input = event.target as HTMLInputElement | null;
    const raw = input?.value ?? '';
    const next = raw.trim();
    this.renamingId.set(null);
    const current = this.label(node);
    if (next === current) return; // no-op (no command on the bus → no undo entry)
    const previousMetadata: SvgMetadata = node.metadata ?? {};
    const nextMetadata: SvgMetadata =
      next.length === 0
        ? // Empty name: drop the property so the type-based fallback
          // takes over again. Built by shallow-cloning + delete; using
          // destructuring rest would leave an unused-var lint error.
          dropMetadataName(previousMetadata)
        : { ...previousMetadata, name: next };
    this.bus.dispatch(
      new SetPropertyCommand<SvgNode, 'metadata'>(node.id, 'metadata', nextMetadata),
    );
  }

  /** Cancel rename without dispatching (Esc, click-outside on blur is committed instead). */
  protected cancelRename(): void {
    this.renamingId.set(null);
  }

  /**
   * F2 / Enter on a focused row enters rename. F2 is the Windows
   * convention (also accepted by Affinity); Enter is the Mac
   * convention. Both supported.
   */
  protected onRowRenameKey(event: KeyboardEvent, id: NodeId): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.layers.isLocked(id)) return;
    this.renamingId.set(id);
  }

  /**
   * Arrow-key navigation between rows. ↑/↓ focus prev/next visible
   * row; Home/End jump to first/last. Selection follows focus (single-
   * selects on each step) — same UX as Affinity layer panel. Locked
   * rows are skipped via the natural `tabindex=-1` on them.
   *
   * "Visible" here means present in the DOM after search/filter — we
   * query rendered `.row` elements rather than walking the model, so
   * the navigation respects exactly what the user sees.
   */
  protected onRowArrowKey(event: KeyboardEvent, direction: 'up' | 'down' | 'home' | 'end'): void {
    event.preventDefault();
    event.stopPropagation();
    const rows = Array.from(
      this.elRef.nativeElement.querySelectorAll('.row[tabindex="0"]'),
    ) as HTMLElement[];
    if (rows.length === 0) return;
    const active = rows.indexOf(document.activeElement as HTMLElement);
    let nextIdx: number;
    switch (direction) {
      case 'up':
        nextIdx = active <= 0 ? 0 : active - 1;
        break;
      case 'down':
        nextIdx = active < 0 ? 0 : Math.min(rows.length - 1, active + 1);
        break;
      case 'home':
        nextIdx = 0;
        break;
      case 'end':
        nextIdx = rows.length - 1;
        break;
    }
    const next = rows[nextIdx];
    if (next === undefined) return;
    next.focus();
    // Selection-follows-focus: extract the id from the row's nearest
    // [data-id] / inferred mapping. Simplest: parse from the row's
    // label/render. Since the row's [click] handler already calls
    // onRowClick which dispatches selection, we synthesize a no-modifier
    // click on the focused row.
    next.click();
  }

  protected onRowClick(event: MouseEvent, id: NodeId): void {
    // Locked rows are completely off-limits to selection. Only the
    // eye/lock buttons (which stop propagation) remain interactive.
    // Defense in depth — `SelectionService.select/toggle/addToSelection`
    // already skip locked ids; this short-circuit just avoids
    // unnecessary signal reads + makes intent explicit.
    if (this.layers.isLocked(id)) return;
    if (event.shiftKey) {
      this.selection.addToSelection(id);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      this.selection.toggle(id);
      return;
    }
    this.selection.select(id);
  }

  /**
   * Keyboard equivalent of `onRowClick` (Enter / Space). Same modifier
   * semantics + same lock skip. `preventDefault` so Space doesn't
   * scroll the panel.
   */
  protected onRowKey(event: KeyboardEvent, id: NodeId): void {
    event.preventDefault();
    if (this.layers.isLocked(id)) return;
    if (event.shiftKey) {
      this.selection.addToSelection(id);
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      this.selection.toggle(id);
      return;
    }
    this.selection.select(id);
  }

  /**
   * Double-click on a row enters Isolation Mode on it (only when the
   * node is a group). Matches the canvas dblclick gesture so the panel
   * is a redundant entry point — convenient for users who prefer the
   * panel for navigation. No-op for non-group rows (no semantic
   * "inside" to isolate).
   */
  protected onRowDoubleClick(event: MouseEvent, node: SvgNode): void {
    event.stopPropagation();
    if (this.layers.isLocked(node.id)) return;
    if (node.type !== 'group') return;
    // Don't isolate the document root itself — there's nothing "above"
    // to drill out to, so the gesture would be a no-op anyway.
    if (node.id === this.state.document().root.id) return;
    this.isolation.enter(node.id);
    this.selection.select(node.id);
  }

  protected onToggleVisible(event: MouseEvent, id: NodeId): void {
    event.stopPropagation();
    this.layers.toggleVisible(id);
  }

  protected onToggleLocked(event: MouseEvent, id: NodeId): void {
    event.stopPropagation();
    this.layers.toggleLocked(id);
  }

  protected toggleExpand(event: MouseEvent, id: NodeId): void {
    event.stopPropagation();
    const set = new Set(this.expanded());
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.expanded.set(set);
  }

  /**
   * Tree-convention keyboard handler (Fase 6c a11y audit): ArrowRight
   * expands a group row; ArrowLeft collapses. Required to satisfy the
   * `role="tree"` ARIA pattern (WAI-ARIA Authoring Practices §3.16),
   * which screen readers honor for navigation. No-op on non-group rows
   * (a leaf can't expand) and on already-correct state (closed +
   * ArrowLeft = no-op, open + ArrowRight = no-op).
   */
  protected onRowExpandKey(event: KeyboardEvent, node: SvgNode, direction: 'open' | 'close'): void {
    if (!isGroupNode(node)) return;
    const set = new Set(this.expanded());
    const isOpen = set.has(node.id);
    if (direction === 'open' && !isOpen) {
      event.preventDefault();
      set.add(node.id);
      this.expanded.set(set);
    } else if (direction === 'close' && isOpen) {
      event.preventDefault();
      set.delete(node.id);
      this.expanded.set(set);
    }
  }

  // ── D-072 — Layer creation / conversion handlers ────────────────

  /**
   * Dispatch {@link CreateLayerCommand} and select the freshly-created
   * layer so the user can immediately rename it / start drawing into
   * it. Bound to the "+" button in the panel header.
   */
  protected createNewLayer(): void {
    // Insert into the panel's display root. With the Pages model the panel
    // is rooted at the active page ([root] input), so the new layer must
    // land inside that page — otherwise it would be created at doc.root
    // (sibling of the pages) and never appear here ("+ does nothing").
    const cmd = new CreateLayerCommand(this.root()?.id ?? null);
    this.bus.dispatch(cmd);
    const newId = cmd.getCreatedLayerId();
    if (newId !== null) this.selection.select(newId);
  }

  /**
   * Convert a top-level group into a Layer (D-072). Surfaced via the
   * "Object ▸ Convert to Layer" menu entry and via this method for
   * panel-driven UX (right-click context menu / future row button).
   *
   * Defensive predicates mirror what `MakeLayerCommand` enforces: only
   * a top-level group can become a layer. Returns `false` (no
   * dispatch) when the gesture is rejected so callers can show a hint.
   */
  protected convertToLayer(id: NodeId): boolean {
    const root = this.state.document().root;
    const node = findNodeById(root, id);
    if (node === null || node.type !== 'group') return false;
    if (isLayer(node)) return false;
    if (isPage(node)) return false; // a page is not a convertible group
    const parent = findParent(root, id);
    // Top-level = direct child of a layer container: the document root OR a
    // page (D-079). The old root-only check left this broken under Pages,
    // where a top-level group is a child of the active page.
    if (parent === null || (parent.id !== root.id && !isPage(parent))) return false;
    this.bus.dispatch(new MakeLayerCommand(id));
    return true;
  }

  /**
   * Convert a Layer back into a plain group (D-072). Inverse of
   * {@link convertToLayer}. No-op when the node is not actually a
   * layer (returns `false`). A **single-child** layer dissolves (the
   * child is promoted, no pointless 1-element group) — so we re-select
   * the surviving node, since the layer id no longer exists afterwards.
   */
  protected convertToGroup(id: NodeId): boolean {
    const root = this.state.document().root;
    const node = findNodeById(root, id);
    if (node === null || !isLayer(node)) return false;
    const cmd = new UnmakeLayerCommand(id);
    this.bus.dispatch(cmd);
    const result = cmd.getResultNodeId();
    if (result !== null) this.selection.select(result);
    return true;
  }

  // ── Drag-drop reorder (Bloco 4b-DnD) ────────────────────────────

  /**
   * Begin dragging a row. Locked rows have `draggable="false"` in the
   * template so this won't fire for them — defensive check kept.
   * Sets `dataTransfer.effectAllowed` so the cursor reflects "move"
   * intent (matches Figma/Affinity convention for layer reorder).
   */
  protected onDragStart(event: DragEvent, id: NodeId): void {
    if (this.layers.isLocked(id)) {
      event.preventDefault();
      return;
    }
    this.dragSourceId.set(id);
    // dataTransfer is null in jsdom (and undefined when the test fires a
    // bare MouseEvent) — guard with `!= null` (catches both).
    if (event.dataTransfer != null) {
      // The actual `MoveNodeInTreeCommand` reads `dragSourceId()`, but
      // we still set the dataTransfer text so OS-level drag UI works
      // (some browsers won't initiate a drag without a payload).
      event.dataTransfer.setData('text/plain', id);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  /**
   * Continuous drag-over a row. Computes the drop position based on
   * the cursor's Y position within the row (top third = before, bottom
   * third = after, middle third = inside-if-group). Sets `dropTarget`
   * to drive the visual indicator and calls `preventDefault` so the
   * browser accepts the drop.
   */
  protected onDragOver(event: DragEvent, target: SvgNode): void {
    const source = this.dragSourceId();
    if (source === null) return;
    const candidate = this.computeDropPosition(event, target);
    if (candidate === null) {
      this.dropTarget.set(null);
      return;
    }
    // Browsers default to NOT accepting drops. preventDefault enables
    // the drop event to fire when the user releases.
    event.preventDefault();
    if (event.dataTransfer != null) event.dataTransfer.dropEffect = 'move';
    this.dropTarget.set(candidate);
  }

  /** Clear the drop indicator when the cursor leaves a row. */
  protected onDragLeave(event: DragEvent, id: NodeId): void {
    // dragleave fires even for child element transitions inside the
    // same row (mat-icon, button) — only clear when we actually leave
    // the row that's the current drop target.
    if (this.dropTarget()?.id !== id) return;
    // Heuristic: relatedTarget is null/outside the row means we left.
    const related = event.relatedTarget as HTMLElement | null;
    const row = event.currentTarget as HTMLElement;
    if (related !== null && row.contains(related)) return;
    this.dropTarget.set(null);
  }

  /**
   * Commit the drop: dispatch `MoveNodeInTreeCommand`. The command
   * itself validates cycles + parent + index — we use the same
   * checks at indicator time to never show a green light for an
   * invalid drop, so this dispatch should always succeed.
   */
  protected onDrop(event: DragEvent, target: SvgNode): void {
    event.preventDefault();
    const source = this.dragSourceId();
    const dt = this.dropTarget();
    this.dragSourceId.set(null);
    this.dropTarget.set(null);
    if (source === null || dt === null || dt.id !== target.id) return;

    const move = this.resolveTargetParentAndIndex(source, target, dt.position);
    if (move === null) return;
    this.bus.dispatch(new MoveNodeInTreeCommand(source, move.parentId, move.index));
    // Keep the user's selection on the moved node (Figma/Affinity UX).
    this.selection.select(source);
  }

  /** Reset state if the drag ends without dropping on a valid target. */
  protected onDragEnd(): void {
    this.dragSourceId.set(null);
    this.dropTarget.set(null);
  }

  /**
   * Decide where the drop would land given the pointer Y inside the
   * row. Returns `null` for invalid combinations (source dragged onto
   * itself / a descendant / a locked row).
   *
   * **D-072 — Layer placement rules**:
   *
   * - A **Layer** can only live as a top-level child of the document
   *   root (no nested layers, no layer-inside-group). When the source
   *   is a layer, every position that would land it under a non-root
   *   parent is rejected:
   *   - `inside` of any group/layer → reject
   *   - `before`/`after` a node whose parent isn't the root → reject
   * - A **non-layer** (plain group, leaf shape) MAY be dropped
   *   *inside* a layer (layers exist precisely to hold content) but
   *   not before/after a layer at a position that would land it under
   *   a non-root parent — same rule as for plain groups.
   *
   * Rejecting here (in addition to the command's runtime validation)
   * gives the user immediate visual feedback (the drop indicator
   * never lights up for an illegal placement) instead of a silent
   * no-op on release. Matches Affinity / Photoshop convention.
   */
  private computeDropPosition(event: DragEvent, target: SvgNode): DropTarget | null {
    const source = this.dragSourceId();
    if (source === null) return null;
    // Skip locked targets — can't drop there.
    if (this.layers.isLocked(target.id)) return null;
    // Skip self.
    if (source === target.id) return null;
    // Skip descendants (would create a cycle — the command would also
    // reject, but UI feedback should match).
    if (isGroupNode(target) && this.sourceContainsTarget(source, target.id)) return null;

    const row = event.currentTarget as HTMLElement;
    const rect = row.getBoundingClientRect();
    const y = event.clientY - rect.top;
    const h = rect.height;
    // top 30% = before, bottom 30% = after, middle 40% = inside (only
    // when target is a group — otherwise treat as `after`, the natural
    // "drop below this leaf" intent).
    let candidate: DropPosition;
    if (y < h * 0.3) candidate = 'before';
    else if (y > h * 0.7) candidate = 'after';
    else if (isGroupNode(target)) candidate = 'inside';
    else candidate = 'after';

    // **D-072 invariant gate** — apply the layer placement rules
    // before returning. `null` here means "no valid landing spot"
    // and the panel suppresses the drop indicator entirely.
    if (!this.isDropAllowed(source, target, candidate)) return null;

    return { id: target.id, position: candidate };
  }

  /**
   * **D-072 — Layer placement gate**. Returns `true` when dropping
   * `sourceId` at `(target, position)` would land it in a slot the
   * data model permits. Two rules:
   *
   * 1. **Layers stay top-level**: when source is a layer, the
   *    resolved parent of the drop MUST be a **layer container** — the
   *    document root or a page (D-079).
   * 2. **Layer's slot is the front of itself or the root**: any
   *    drop is allowed `inside` a layer (layers hold content); but
   *    a layer itself cannot be dropped `inside` anything.
   *
   * Non-layer sources keep their pre-D-072 behavior (any group is a
   * valid container, before/after of any sibling is allowed).
   */
  private isDropAllowed(sourceId: NodeId, target: SvgNode, position: DropPosition): boolean {
    const root = this.state.document().root;
    const source = findNodeById(root, sourceId);
    if (source === null) return false;
    // Resolve the parent the drop would produce.
    let resolvedParentId: NodeId;
    if (position === 'inside') {
      if (!isGroupNode(target)) return false;
      resolvedParentId = target.id;
    } else {
      const targetParent = findParent(root, target.id);
      if (targetParent === null) return false;
      resolvedParentId = targetParent.id;
    }
    // Rule 1: layers can only live in a "layer container" — the document
    // root OR a page (D-079). Pre-Pages this required the root; under Pages
    // a layer lives directly under a page, so a layer drop must resolve to
    // a root- or page-parented slot (otherwise reordering a layer within a
    // page would be rejected outright).
    if (isLayer(source)) {
      const resolvedParent = findNodeById(root, resolvedParentId);
      const isContainer =
        resolvedParentId === root.id || (resolvedParent !== null && isPage(resolvedParent));
      if (!isContainer) return false;
    }
    return true;
  }

  /**
   * Translate a `(target, position)` pair into the
   * `(parentId, finalIndex)` tuple expected by `MoveNodeInTreeCommand`.
   * `MoveNodeInTreeCommand` uses "final-state index" semantic — the
   * index where the source should END UP in the post-move children
   * array. Returns `null` for invalid configurations.
   *
   * **Same-parent shift**: when source is currently BEFORE target,
   * removing source shifts target's index down by 1. The desired
   * final position of source must compensate. Captured here as
   * `shift` and subtracted from the naive `tgtIdx ± 1`.
   */
  private resolveTargetParentAndIndex(
    sourceId: NodeId,
    target: SvgNode,
    position: DropPosition,
  ): { parentId: NodeId; index: number } | null {
    const root = this.state.document().root;
    if (position === 'inside') {
      if (!isGroupNode(target)) return null;
      // Drop at front of group's children (most-recent on top).
      return { parentId: target.id, index: 0 };
    }
    const targetParent = findParent(root, target.id);
    if (targetParent === null) return null;
    const tgtIdx = targetParent.children.findIndex((c) => c.id === target.id);
    if (tgtIdx < 0) return null;
    const sourceParent = findParent(root, sourceId);
    const sameParent = sourceParent !== null && sourceParent.id === targetParent.id;
    let shift = 0;
    if (sameParent) {
      const srcIdx = sourceParent!.children.findIndex((c) => c.id === sourceId);
      if (srcIdx >= 0 && srcIdx < tgtIdx) shift = 1;
    }
    return {
      parentId: targetParent.id,
      index: position === 'before' ? tgtIdx - shift : tgtIdx + 1 - shift,
    };
  }

  /**
   * True when `sourceId` is `targetId` or contains `targetId` in its
   * sub-tree. Used to prevent dragging a group INTO its own
   * descendant (would create a cycle).
   */
  private sourceContainsTarget(sourceId: NodeId, targetId: NodeId): boolean {
    if (sourceId === targetId) return true;
    const source = findNodeById(this.state.document().root, sourceId);
    if (source === null || !isGroupNode(source)) return false;
    return descendantHas(source, targetId);
  }
}

function descendantHas(group: GroupNode, id: NodeId): boolean {
  for (const child of group.children) {
    if (child.id === id) return true;
    if (isGroupNode(child) && descendantHas(child, id)) return true;
  }
  return false;
}

/**
 * Visit every node in the tree (depth-first, root included). Used by
 * the search/filter computeds to build the matched-ids set without
 * repeated `findNodeById` calls.
 */
function walkTree(node: SvgNode, visit: (n: SvgNode) => void): void {
  visit(node);
  if (isGroupNode(node)) {
    for (const child of node.children) walkTree(child, visit);
  }
}

/**
 * Shallow-clone metadata without the `name` field. Used by the rename
 * commit when the user submits an empty string — equivalent to "reset
 * to default" so the type-based label fallback kicks back in.
 */
function dropMetadataName(metadata: SvgMetadata): SvgMetadata {
  const clone: Record<string, unknown> = { ...metadata };
  delete clone['name'];
  return clone as SvgMetadata;
}
