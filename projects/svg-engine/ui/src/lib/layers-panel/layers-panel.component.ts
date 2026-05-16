import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { EditorStateService, type GroupNode, type NodeId, type SvgNode } from 'svg-engine/core';
import { LayersService, SelectionService } from 'svg-engine/edit';

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
 * **Drag-drop reorder**: deferred to a sub-block (4b-DnD) — needs a
 * new `MoveNodeInTreeCommand` in core for atomic reorder + undo.
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
  imports: [MatIcon, MatIconButton, NgTemplateOutlet],
  template: `
    <div class="layers-list" role="tree" [attr.aria-label]="'Layers panel'">
      @for (child of children(); track child.id) {
        <ng-container *ngTemplateOutlet="rowTpl; context: { $implicit: child, depth: 0 }" />
      } @empty {
        <p class="empty">No layers</p>
      }
    </div>

    <ng-template #rowTpl let-node let-depth="depth">
      <div
        class="row"
        role="treeitem"
        tabindex="0"
        [class.selected]="isSelected()(node.id)"
        [class.locked]="isLocked()(node.id)"
        [class.hidden]="!isVisible()(node.id)"
        [style.padding-left.px]="8 + depth * 16"
        [attr.aria-selected]="isSelected()(node.id)"
        (click)="onRowClick($event, node.id)"
        (keydown.enter)="onRowKey($any($event), node.id)"
        (keydown.space)="onRowKey($any($event), node.id)"
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
        <span class="label">{{ label(node) }}</span>

        <span class="actions">
          <button
            mat-icon-button
            type="button"
            class="visibility"
            [attr.aria-label]="isVisible()(node.id) ? 'Hide ' + label(node) : 'Show ' + label(node)"
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

      @if (isGroup(node) && expanded().has(node.id)) {
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
      display: block;
      width: 100%;
      height: 100%;
      overflow-y: auto;
      font-size: 13px;
      background: var(--mat-sys-surface-container, #fafafa);
    }
    .layers-list {
      display: flex;
      flex-direction: column;
      padding: 4px 0;
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
    .row.locked .label {
      color: var(--mat-sys-on-surface-variant, #777);
    }
    .expand,
    .visibility,
    .lock {
      width: 28px;
      height: 28px;
      line-height: 28px;
      --mdc-icon-button-state-layer-size: 28px;
    }
    .expand mat-icon,
    .visibility mat-icon,
    .lock mat-icon,
    .type-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      line-height: 18px;
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayersPanel {
  private readonly state = inject(EditorStateService);
  private readonly selection = inject(SelectionService);
  private readonly layers = inject(LayersService);

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
    return TYPE_ICON[node.type] ?? 'crop_square';
  }

  protected label(node: SvgNode): string {
    return `${node.type} ${node.id.slice(0, 6)}`;
  }

  protected onRowClick(event: MouseEvent, id: NodeId): void {
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
   * semantics. `preventDefault` so Space doesn't scroll the panel.
   */
  protected onRowKey(event: KeyboardEvent, id: NodeId): void {
    event.preventDefault();
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
}
