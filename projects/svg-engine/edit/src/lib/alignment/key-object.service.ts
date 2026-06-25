import { computed, effect, inject, Injectable, signal } from '@angular/core';
import type { NodeId } from '@mosaicoo/svg-engine/core';

import { SelectionService } from '../selection/selection.service';

/**
 * **D-094** — per-editor "key object" state for **Object ▸ Align ▸ Align
 * to Key Object** (Illustrator convention).
 *
 * A *key object* is one designated member of a multi-selection that the 6
 * align operations align everything else **to** (it stays put), instead
 * of aligning to the selection's union bbox. The reference-resolution
 * helper (`resolveAlignReference`) reads {@link keyObjectId} and, when
 * set, uses that object's bbox as the alignment reference.
 *
 * **Transient UI state, not document state**: designating a key object
 * doesn't mutate the document, so it is NOT undoable and NOT persisted —
 * it lives only for the current editing session, exactly like the
 * selection itself.
 *
 * **Auto-invalidation without effects**: {@link keyObjectId} is a
 * `computed` that returns `null` the moment the designated id leaves the
 * selection (deselected, deleted, isolation change, etc.). The raw id is
 * kept internally but never surfaces once it's out of selection — so a
 * stale key can never drive alignment or the overlay highlight, and there
 * is no `effect()`/teardown to manage.
 *
 * **Scope**: `providedIn: 'root'` for a single-editor / test fallback,
 * but `provideSvgEngineEditorScope()` overrides it per-editor so two
 * editors mounted side-by-side keep independent key objects (same
 * root-fallback + scope-override pattern as `SelectionService`).
 */
@Injectable({ providedIn: 'root' })
export class KeyObjectService {
  private readonly selection = inject(SelectionService);

  /** Raw designated id (may be stale — never read directly; use the computed). */
  private readonly _raw = signal<NodeId | null>(null);

  /**
   * The current key object id, or `null`. Returns `null` immediately when
   * the designated object is no longer selected (the `computed` guarantees
   * a stale id is never *read*), while the constructor `effect` below
   * garbage-collects the raw id so a later re-selection of the same node
   * doesn't resurrect a key the user had effectively abandoned.
   */
  readonly keyObjectId = computed<NodeId | null>(() => {
    const id = this._raw();
    if (id === null) return null;
    return this.selection.selectedIds().has(id) ? id : null;
  });

  constructor() {
    // Clear the raw id the moment the key object drops out of the
    // selection (deselected / deleted / isolation change). Pairs with the
    // validating computed: the computed keeps reads correct synchronously,
    // the effect prevents a stale id from re-surfacing on re-select
    // (Illustrator clears the key when you deselect it).
    effect(() => {
      const id = this._raw();
      if (id !== null && !this.selection.selectedIds().has(id)) {
        this._raw.set(null);
      }
    });
  }

  /** `true` when a (still-selected) key object is designated. */
  readonly hasKeyObject = computed(() => this.keyObjectId() !== null);

  /** Designate `id` as the key object (caller ensures it's selected). */
  setKeyObject(id: NodeId): void {
    this._raw.set(id);
  }

  /** Clear the key object (back to "align to selection / page"). */
  clear(): void {
    this._raw.set(null);
  }
}
