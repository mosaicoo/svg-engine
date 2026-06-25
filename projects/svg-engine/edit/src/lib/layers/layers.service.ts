import { computed, Injectable, signal } from '@angular/core';
import type { NodeId } from '@mosaicoo/svg-engine/core';

/**
 * Editor-side per-node visibility + lock state. **Editor presentation
 * only** — not serialized into the SVG document. Same separation
 * principle as `WorkspaceService` (D-021): `SvgDocument` stays pure
 * SVG-spec, editor sessions get their own state.
 *
 * **Scope split** vs the `SvgDocument`:
 * - **Visibility** here = "hide from the editor canvas right now". Not
 *   the same as exporting the node with `visibility="hidden"` (that's
 *   a content concern; user adds it to `metadata` if desired). The
 *   layers panel uses this to let the user temporarily hide layers
 *   while editing without changing the document.
 * - **Lock** = "make the node un-editable" — selection, drag, resize,
 *   and rotate all consult this and skip locked ids. The layers panel
 *   shows a padlock icon and disables the row's interactive controls.
 *
 * **Visibility application**: this service exposes `hiddenIds` as a
 * signal; the `[svgeLayersFilter]` directive (also in `svg-engine/edit`)
 * is the canonical applier — attach it to a host element wrapping the
 * rendered SVG and it walks `[data-node-id]` descendants on each
 * render, applying `display: none` to hidden ones. Other consumers can
 * subscribe to the signal directly if they prefer custom logic.
 *
 * **Persistence**: not handled here. Consumers that want visibility/
 * lock to survive across sessions persist the snapshot themselves
 * (project file, localStorage).
 */
@Injectable({ providedIn: 'root' })
export class LayersService {
  private readonly _hiddenIds = signal<ReadonlySet<NodeId>>(new Set());
  private readonly _lockedIds = signal<ReadonlySet<NodeId>>(new Set());

  /** Reactive set of node ids currently hidden. */
  readonly hiddenIds = this._hiddenIds.asReadonly();

  /** Reactive set of node ids currently locked. */
  readonly lockedIds = this._lockedIds.asReadonly();

  /** Convenience computed — true when any node has been hidden. */
  readonly hasHidden = computed(() => this._hiddenIds().size > 0);

  /** Convenience computed — true when any node has been locked. */
  readonly hasLocked = computed(() => this._lockedIds().size > 0);

  isVisible(id: NodeId): boolean {
    return !this._hiddenIds().has(id);
  }

  isLocked(id: NodeId): boolean {
    return this._lockedIds().has(id);
  }

  /**
   * Set the visibility of a single node. Idempotent — calling with the
   * current value is a no-op (signal doesn't fire, no spurious CD).
   */
  setVisible(id: NodeId, visible: boolean): void {
    const current = this._hiddenIds();
    const isHidden = current.has(id);
    if (visible && !isHidden) return;
    if (!visible && isHidden) return;
    const next = new Set(current);
    if (visible) next.delete(id);
    else next.add(id);
    this._hiddenIds.set(next);
  }

  toggleVisible(id: NodeId): void {
    this.setVisible(id, !this.isVisible(id));
  }

  /**
   * Set the lock state of a single node. Idempotent. Consumers (like
   * `SelectionService.select`) can call `isLocked(id)` first to skip
   * actions on locked ids.
   */
  setLocked(id: NodeId, locked: boolean): void {
    const current = this._lockedIds();
    const isCurrentlyLocked = current.has(id);
    if (locked && isCurrentlyLocked) return;
    if (!locked && !isCurrentlyLocked) return;
    const next = new Set(current);
    if (locked) next.add(id);
    else next.delete(id);
    this._lockedIds.set(next);
  }

  toggleLocked(id: NodeId): void {
    this.setLocked(id, !this.isLocked(id));
  }

  /** Reveal everything (clear `hiddenIds`). */
  showAll(): void {
    if (this._hiddenIds().size === 0) return;
    this._hiddenIds.set(new Set());
  }

  /** Unlock everything (clear `lockedIds`). */
  unlockAll(): void {
    if (this._lockedIds().size === 0) return;
    this._lockedIds.set(new Set());
  }
}
