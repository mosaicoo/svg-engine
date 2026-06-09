import { computed, Injectable, signal } from '@angular/core';
import type { AnchorRef } from 'svg-engine/core';

/**
 * Composite key for storing AnchorRefs in a Set. AnchorRef objects
 * compared by reference fail because every render rebuilds them; we
 * key on the stable `nodeId|subpathIndex|anchorIndex` triple instead.
 */
type AnchorKey = string;

function keyOf(ref: AnchorRef): AnchorKey {
  return `${ref.nodeId}|${ref.subpathIndex}|${ref.anchorIndex}`;
}

/**
 * Editor-side selection of individual ANCHOR POINTS inside a focused
 * path. Distinct from `SelectionService.selectedIds` (which tracks
 * whole SvgNodes); coexists with it — the node IS still
 * "selected" at the SelectionService level while individual anchors
 * are independently focused here.
 *
 * **Lifecycle**:
 * - User picks Direct Select (A) and clicks a path → SelectionService
 *   selects the path; AnchorOverlay starts rendering points.
 * - User clicks an anchor point → `selectOne(ref)` (replaces selection).
 * - Shift-click → `toggle(ref)` for multi-anchor edits.
 * - Switching tools, deselecting the node, or deleting the path
 *   should clear this selection (consumer's responsibility — call
 *   `clear()` on those events).
 *
 * **Why a separate service** (vs adding `selectedAnchors` to
 * SelectionService): anchors are SCOPED to a single path; the
 * selection has no meaning across nodes. Keeping it separate keeps
 * SelectionService focused on node-level state.
 *
 * @internal **Cross-entry-point**: exportado para os overlays/painéis de
 * `svg-engine/ui` consumirem do pacote buildado. Fora do contrato público
 * estável — pode mudar sem major bump; consumidores externos não devem
 * depender diretamente.
 */
@Injectable({ providedIn: 'root' })
export class AnchorSelectionService {
  private readonly _selected = signal<ReadonlySet<AnchorKey>>(new Set());
  private readonly _refs = signal<readonly AnchorRef[]>([]);

  /** Reactive snapshot of the selected anchor refs (ordered as added). */
  readonly selected = this._refs.asReadonly();

  /** Count of selected anchors. Cheap derived signal. */
  readonly count = computed(() => this._refs().length);

  /** True when no anchor is selected. */
  readonly isEmpty = computed(() => this._refs().length === 0);

  /** True when exactly one anchor is selected (drives single-anchor UI). */
  readonly isSingle = computed(() => this._refs().length === 1);

  /** Replace selection with a single anchor. */
  selectOne(ref: AnchorRef): void {
    const key = keyOf(ref);
    this._selected.set(new Set([key]));
    this._refs.set([ref]);
  }

  /** Add to / remove from selection (Shift-click semantics). */
  toggle(ref: AnchorRef): void {
    const key = keyOf(ref);
    const current = this._selected();
    if (current.has(key)) {
      const next = new Set(current);
      next.delete(key);
      this._selected.set(next);
      this._refs.set(this._refs().filter((r) => keyOf(r) !== key));
    } else {
      this._selected.set(new Set([...current, key]));
      this._refs.set([...this._refs(), ref]);
    }
  }

  /** Check selection membership. */
  isSelected(ref: AnchorRef): boolean {
    return this._selected().has(keyOf(ref));
  }

  /** Clear all anchor selection (e.g., on tool change / node deselect). */
  clear(): void {
    if (this._selected().size === 0) return;
    this._selected.set(new Set());
    this._refs.set([]);
  }

  /**
   * Drop any anchor selection that no longer belongs to `nodeId`.
   * Use when the focused node changes — anchors of the old path
   * should no longer be selected.
   */
  clearForOtherNodes(nodeId: string): void {
    const next = this._refs().filter((r) => r.nodeId === nodeId);
    if (next.length === this._refs().length) return;
    this._refs.set(next);
    this._selected.set(new Set(next.map(keyOf)));
  }
}
