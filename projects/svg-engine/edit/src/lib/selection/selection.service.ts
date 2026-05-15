import { computed, Injectable, signal } from '@angular/core';
import type { NodeId } from 'svg-engine/core';

/**
 * Editor-side selection state. Tracks which nodes are currently selected,
 * which one has focus (the "primary" of the selection — determines pivot
 * defaults, inspector content, etc.), and which one is being hovered.
 *
 * State is **transient** (not part of `SvgDocument`); it lives only in
 * the editor session and is not serialized.
 *
 * Selection invariants enforced by the service:
 *  - `focusId` is always either `null` or a member of `selectedIds`.
 *  - Calling `select(id)` replaces the selection with just `id` and sets
 *    focus to `id`.
 *  - `clear()` sets selection and focus to empty/null without touching hover.
 *
 * Hover is intentionally orthogonal to selection so an editor can highlight
 * a node under the cursor without altering the active selection.
 */
@Injectable({ providedIn: 'root' })
export class SelectionService {
  private readonly _selectedIds = signal<ReadonlySet<NodeId>>(new Set());
  private readonly _focusId = signal<NodeId | null>(null);
  private readonly _hoverId = signal<NodeId | null>(null);

  /** Set of currently-selected node ids. Readonly. */
  readonly selectedIds = this._selectedIds.asReadonly();

  /** Primary id of the selection (the most recently-added member). */
  readonly focusId = this._focusId.asReadonly();

  /** Node currently under the cursor (orthogonal to selection). */
  readonly hoverId = this._hoverId.asReadonly();

  /** Number of selected nodes. */
  readonly count = computed(() => this._selectedIds().size);

  /** Whether anything is selected. */
  readonly hasSelection = computed(() => this._selectedIds().size > 0);

  /** Whether exactly one node is selected (useful for inspector enabling). */
  readonly isSingleSelection = computed(() => this._selectedIds().size === 1);

  /** Replace the selection with exactly `id`; set focus to `id`. */
  select(id: NodeId): void {
    this._selectedIds.set(new Set([id]));
    this._focusId.set(id);
  }

  /** Replace the selection with the given ids; focus = last in iteration order. */
  selectMany(ids: Iterable<NodeId>): void {
    const next = new Set(ids);
    this._selectedIds.set(next);
    this._focusId.set(next.size === 0 ? null : lastOf(next));
  }

  /** Add `id` to the current selection without removing existing members. */
  addToSelection(id: NodeId): void {
    const current = this._selectedIds();
    if (current.has(id)) {
      this._focusId.set(id);
      return;
    }
    const next = new Set(current);
    next.add(id);
    this._selectedIds.set(next);
    this._focusId.set(id);
  }

  /**
   * Toggle membership of `id` in the selection. When adding, sets focus to
   * `id`. When removing, focus moves to the new last member or `null` if
   * the selection becomes empty.
   */
  toggle(id: NodeId): void {
    const current = this._selectedIds();
    const next = new Set(current);
    if (current.has(id)) {
      next.delete(id);
      this._selectedIds.set(next);
      this._focusId.set(next.size === 0 ? null : lastOf(next));
    } else {
      next.add(id);
      this._selectedIds.set(next);
      this._focusId.set(id);
    }
  }

  /** Remove `id` from the selection if present; updates focus accordingly. */
  deselect(id: NodeId): void {
    const current = this._selectedIds();
    if (!current.has(id)) return;
    const next = new Set(current);
    next.delete(id);
    this._selectedIds.set(next);
    if (this._focusId() === id) {
      this._focusId.set(next.size === 0 ? null : lastOf(next));
    }
  }

  /** Remove every member from the selection. Hover is preserved. */
  clear(): void {
    if (this._selectedIds().size === 0 && this._focusId() === null) return;
    this._selectedIds.set(new Set());
    this._focusId.set(null);
  }

  /** Whether `id` is currently selected. */
  isSelected(id: NodeId): boolean {
    return this._selectedIds().has(id);
  }

  /** Set the hovered node (or `null` to clear). */
  setHover(id: NodeId | null): void {
    this._hoverId.set(id);
  }
}

/**
 * Iterate to the last element of an ordered collection. `Set` preserves
 * insertion order in JavaScript, so this returns the most recently added
 * member — the natural "focus" candidate after a multi-select operation.
 */
function lastOf<T>(set: ReadonlySet<T>): T {
  let last!: T;
  for (const item of set) last = item;
  return last;
}
