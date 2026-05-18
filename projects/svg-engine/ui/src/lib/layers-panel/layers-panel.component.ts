import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import {
  CommandBus,
  EditorStateService,
  findNodeById,
  findParent,
  type GroupNode,
  isGroupNode,
  MoveNodeInTreeCommand,
  type NodeId,
  type SvgNode,
} from 'svg-engine/core';
import { LayersService, SelectionService } from 'svg-engine/edit';

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
        [draggable]="!isLocked()(node.id)"
        [tabindex]="isLocked()(node.id) ? -1 : 0"
        [class.selected]="isSelected()(node.id)"
        [class.locked]="isLocked()(node.id)"
        [class.hidden]="!isVisible()(node.id)"
        [class.dragging]="dragSourceId() === node.id"
        [class.drop-before]="dropTarget()?.id === node.id && dropTarget()?.position === 'before'"
        [class.drop-after]="dropTarget()?.id === node.id && dropTarget()?.position === 'after'"
        [class.drop-inside]="dropTarget()?.id === node.id && dropTarget()?.position === 'inside'"
        [style.padding-left.px]="8 + depth * 16"
        [attr.aria-selected]="isSelected()(node.id)"
        [attr.aria-disabled]="isLocked()(node.id)"
        (click)="onRowClick($event, node.id)"
        (keydown.enter)="onRowKey($any($event), node.id)"
        (keydown.space)="onRowKey($any($event), node.id)"
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
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayersPanel {
  private readonly state = inject(EditorStateService);
  private readonly selection = inject(SelectionService);
  private readonly layers = inject(LayersService);
  private readonly bus = inject(CommandBus);

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
    if (y < h * 0.3) return { id: target.id, position: 'before' };
    if (y > h * 0.7) return { id: target.id, position: 'after' };
    if (isGroupNode(target)) return { id: target.id, position: 'inside' };
    return { id: target.id, position: 'after' };
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
