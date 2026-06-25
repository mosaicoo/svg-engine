import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { NodeId } from '@mosaicoo/svg-engine/core';
import { LayersService } from '../layers/layers.service';

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
 *
 * **Lock enforcement (Bloco 4b-Lock v2)**: locked nodes (per
 * {@link LayersService.isLocked}) are **completely off-limits** to
 * selection. The user explicitly clarified: a locked node cannot be
 * selected via canvas click, marquee, layers panel row, or programmatic
 * `select()` — only the eye/lock buttons in the layers panel remain
 * interactive. Two-layer enforcement:
 *
 * 1. **Write-time filter**: every `select`/`selectMany`/`addToSelection`/
 *    `toggle`/`setHover` skips locked ids. Programmatic callers cannot
 *    bypass — the no-op happens silently (consistent with other defensive
 *    patterns; the alternative of throwing would break call-sites that
 *    don't know about lock state).
 * 2. **Reactive auto-deselect**: when `LayersService.lockedIds` changes,
 *    an effect prunes any newly-locked id from the current selection
 *    (and from focus + hover). This keeps state consistent regardless of
 *    who called `setLocked` and from where.
 */
@Injectable({ providedIn: 'root' })
export class SelectionService {
  private readonly layers = inject(LayersService);

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

  constructor() {
    // Reactive auto-deselect when the lock state grows. Reads
    // `lockedIds` to register the dependency; uses `untracked` for the
    // selection mutations so changes to `selectedIds`/`focusId`/`hoverId`
    // don't re-trigger this effect (would loop).
    effect(() => {
      const locked = this.layers.lockedIds();
      if (locked.size === 0) return;
      untracked(() => {
        // Prune `_selectedIds`
        const current = this._selectedIds();
        let nextSet: Set<NodeId> | null = null;
        for (const id of current) {
          if (locked.has(id)) {
            if (nextSet === null) nextSet = new Set(current);
            nextSet.delete(id);
          }
        }
        if (nextSet !== null) {
          this._selectedIds.set(nextSet);
          // Fix focus if it was the locked one
          const focus = this._focusId();
          if (focus !== null && locked.has(focus)) {
            this._focusId.set(nextSet.size === 0 ? null : lastOf(nextSet));
          }
        }
        // Clear hover if it became locked
        const hover = this._hoverId();
        if (hover !== null && locked.has(hover)) {
          this._hoverId.set(null);
        }
      });
    });
  }

  /**
   * Replace the selection with exactly `id`; set focus to `id`.
   * **No-op** when `id` is locked.
   */
  select(id: NodeId): void {
    if (this.layers.isLocked(id)) return;
    this._selectedIds.set(new Set([id]));
    this._focusId.set(id);
  }

  /**
   * Replace the selection with the given ids; focus = last in iteration order.
   * **Locked ids are filtered out** before applying.
   */
  selectMany(ids: Iterable<NodeId>): void {
    const lockedSet = this.layers.lockedIds();
    const next = new Set<NodeId>();
    for (const id of ids) {
      if (!lockedSet.has(id)) next.add(id);
    }
    this._selectedIds.set(next);
    this._focusId.set(next.size === 0 ? null : lastOf(next));
  }

  /**
   * Add `id` to the current selection without removing existing members.
   * **No-op** when `id` is locked.
   */
  addToSelection(id: NodeId): void {
    if (this.layers.isLocked(id)) return;
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
   *
   * **No-op** when `id` is locked (locked ids must never enter selection).
   */
  toggle(id: NodeId): void {
    if (this.layers.isLocked(id)) return;
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

  /**
   * Set the hovered node (or `null` to clear). **Locked ids are silently
   * dropped to `null`** — hover highlight should not appear on a node
   * the user can't interact with.
   */
  setHover(id: NodeId | null): void {
    if (id !== null && this.layers.isLocked(id)) {
      this._hoverId.set(null);
      return;
    }
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
