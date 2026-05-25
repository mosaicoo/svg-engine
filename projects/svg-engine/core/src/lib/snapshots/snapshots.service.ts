import { computed, Injectable, signal } from '@angular/core';
import type { SvgDocument } from '../document/svg-document';
import { generateNodeId } from '../types/node-id';
import {
  DEFAULT_SNAPSHOT_LIMITS,
  type Snapshot,
  type SnapshotsLimits,
  type SnapshotSource,
} from './snapshot';

/**
 * **D-073 — SnapshotsService**. Per-editor service managing the
 * collection of {@link Snapshot}s (named, restorable document
 * checkpoints).
 *
 * **NOT `providedIn: 'root'`** — the snapshot collection IS
 * per-editor state. A multi-editor app (D-042) must isolate them:
 * editor A's "Before Pathfinder" is meaningless to editor B. Listed
 * in `provideSvgEngineEditorScope()` next to `HistoryService`,
 * `SelectionService`, etc. — same reasoning, same lifetime.
 *
 * **Why a service and not a Command**: snapshot creation is metadata
 * about history, NOT a tree mutation. Taking a snapshot doesn't
 * change the document; it just captures a reference. Putting it on
 * the undo stack would let `Ctrl+Z` undo "Take Snapshot", which is
 * confusing UX (Photoshop also doesn't undo snapshot-take). The
 * INVERSE — `RestoreSnapshotCommand` — IS a command: restoring
 * mutates the document, and undoing it returns the user to where
 * they were before the restore.
 *
 * **Order**: snapshots are stored newest-first (most recent
 * `createdAt` at index 0), mirroring Photoshop's panel display and
 * the natural "the one I just took is at top".
 */
@Injectable()
export class SnapshotsService {
  private readonly _snapshots = signal<readonly Snapshot[]>([]);
  private readonly _limits = signal<SnapshotsLimits>(DEFAULT_SNAPSHOT_LIMITS);
  /**
   * Id of the snapshot the user is currently "viewing" — set when
   * `restore(id)` succeeds, cleared on the next `take()` (current
   * state diverges from any snapshot). Lets the panel highlight
   * which snapshot the canvas currently matches.
   */
  private readonly _currentId = signal<string | null>(null);

  /** Reactive snapshots collection — UI binds via `snapshots()`. */
  readonly snapshots = this._snapshots.asReadonly();
  /** Number of snapshots — convenient for "Snapshots (N)" headers. */
  readonly count = computed(() => this._snapshots().length);
  /** Tuning knobs (limit, auto-on-open, auto-on-destructive). */
  readonly limits = this._limits.asReadonly();
  /** Id of the snapshot currently restored, or null if doc diverged. */
  readonly currentSnapshotId = this._currentId.asReadonly();

  /**
   * Create a snapshot of `document` with the given options. Newly
   * created snapshots have `thumbnail: null` — the panel populates
   * thumbnails async via {@link attachThumbnail}.
   *
   * Enforces `limits.maxCount` by dropping the OLDEST non-`auto-open`
   * snapshot when the buffer is full. Returns the freshly created
   * snapshot so the caller can wire it up (e.g., the
   * `<svge-snapshots-panel>` schedules a thumbnail render right
   * after take).
   */
  take(
    document: SvgDocument,
    opts: { readonly name?: string; readonly source?: SnapshotSource } = {},
  ): Snapshot {
    const source: SnapshotSource = opts.source ?? 'manual';
    const name = opts.name ?? this.defaultName(source);
    const snap: Snapshot = {
      id: generateNodeId(),
      name,
      createdAt: Date.now(),
      document,
      thumbnail: null,
      source,
    };
    const current = this._snapshots();
    const limit = this._limits().maxCount;
    let next = [snap, ...current];
    if (next.length > limit) {
      // Drop oldest non-baseline snapshot (auto-open is sticky — it's
      // the document's origin point and must always be reachable).
      // Walk from the END (oldest) and remove first non-baseline.
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i]!.source !== 'auto-open') {
          next = [...next.slice(0, i), ...next.slice(i + 1)];
          break;
        }
      }
      // Edge case: all snapshots are auto-open baselines (only
      // happens if user manually creates many baselines somehow).
      // Drop the literal oldest as last resort.
      if (next.length > limit) next = next.slice(0, limit);
    }
    this._snapshots.set(next);
    // Taking a snapshot does NOT update currentSnapshotId — the
    // snapshot captures the CURRENT state, and the current state
    // doesn't suddenly become "synced" to it for UI display
    // purposes. Photoshop highlights the snapshot as "this is what
    // your canvas currently looks like"; we don't (yet — small
    // future polish).
    return snap;
  }

  /**
   * Replace the snapshot at `id` with one carrying the given thumbnail
   * data URL. Used by the UI panel after async PNG rasterization
   * completes. No-op when `id` not found (snapshot was deleted before
   * the render finished).
   */
  attachThumbnail(id: string, dataUrl: string): boolean {
    const list = this._snapshots();
    const idx = list.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    const updated: Snapshot = { ...list[idx]!, thumbnail: dataUrl };
    this._snapshots.set([...list.slice(0, idx), updated, ...list.slice(idx + 1)]);
    return true;
  }

  /**
   * Update a snapshot's name. Returns `false` when `id` not found OR
   * `name` would become empty (Photoshop also rejects empty rename —
   * the panel reverts to the previous name).
   */
  rename(id: string, name: string): boolean {
    const trimmed = name.trim();
    if (trimmed.length === 0) return false;
    const list = this._snapshots();
    const idx = list.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    const updated: Snapshot = { ...list[idx]!, name: trimmed };
    this._snapshots.set([...list.slice(0, idx), updated, ...list.slice(idx + 1)]);
    return true;
  }

  /** Drop a snapshot by id. Returns `false` when not found. */
  delete(id: string): boolean {
    const list = this._snapshots();
    const next = list.filter((s) => s.id !== id);
    if (next.length === list.length) return false;
    this._snapshots.set(next);
    if (this._currentId() === id) this._currentId.set(null);
    return true;
  }

  /** Drop every snapshot. Used at "New Document" / hard reset. */
  clear(): void {
    if (this._snapshots().length === 0) return;
    this._snapshots.set([]);
    this._currentId.set(null);
  }

  /**
   * Mark `id` as the currently-viewed snapshot. Called by
   * `RestoreSnapshotCommand.execute()` after `setDocument(snap.document)`.
   * Cleared automatically by subsequent {@link take} calls (which
   * imply the user took a new path).
   */
  setCurrent(id: string | null): void {
    this._currentId.set(id);
  }

  /** Look up by id — used by `RestoreSnapshotCommand` to fetch the doc. */
  getById(id: string): Snapshot | null {
    return this._snapshots().find((s) => s.id === id) ?? null;
  }

  /** Replace the limits config. Only writes when values actually change. */
  setLimits(patch: Partial<SnapshotsLimits>): void {
    const current = this._limits();
    const next: SnapshotsLimits = { ...current, ...patch };
    if (
      next.maxCount === current.maxCount &&
      next.autoOnOpen === current.autoOnOpen &&
      next.autoOnDestructive === current.autoOnDestructive
    ) {
      return;
    }
    this._limits.set(next);
    // If maxCount shrank below current size, trim the tail (oldest
    // non-baseline first, baselines last — same priority as take()).
    const list = this._snapshots();
    if (list.length > next.maxCount) {
      const baselines = list.filter((s) => s.source === 'auto-open');
      const rest = list.filter((s) => s.source !== 'auto-open');
      const keepRest = rest.slice(0, Math.max(0, next.maxCount - baselines.length));
      this._snapshots.set([...keepRest, ...baselines.slice(0, next.maxCount - keepRest.length)]);
    }
  }

  /**
   * Seed the service with previously-persisted snapshots — used by
   * the autosave restore flow. Bypasses the limit enforcement (caller
   * is responsible for not feeding more than `limits.maxCount`).
   */
  hydrate(snapshots: readonly Snapshot[]): void {
    this._snapshots.set(snapshots);
    this._currentId.set(null);
  }

  /**
   * Called by the editor bootstrap right after the initial document
   * loads. When `limits.autoOnOpen` is true (default), records an
   * `auto-open` snapshot named `"Opened"` so the user always has a
   * way back to where they started.
   */
  bootstrap(document: SvgDocument): void {
    if (!this._limits().autoOnOpen) return;
    // Avoid duplicate baselines if bootstrap accidentally fires twice
    // (e.g., recovery flow → resetDocument → effect re-fire).
    if (this._snapshots().some((s) => s.source === 'auto-open')) return;
    this.take(document, { name: 'Opened', source: 'auto-open' });
  }

  // ── Internals ────────────────────────────────────────────────────

  private defaultName(source: SnapshotSource): string {
    switch (source) {
      case 'auto-open':
        return 'Opened';
      case 'auto-destructive':
        return 'Before edit';
      case 'auto-restore':
        return 'Before restore';
      case 'manual':
      default: {
        // "Snapshot N" using current count + 1, mirroring Photoshop.
        const n = this._snapshots().filter((s) => s.source === 'manual').length + 1;
        return `Snapshot ${n}`;
      }
    }
  }
}
