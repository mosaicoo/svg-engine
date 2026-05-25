import type { SvgDocument } from '../document/svg-document';

/**
 * **D-073 — History Snapshot.**
 *
 * A named, restorable point-in-time clone of the document. Distinct
 * from the linear undo/redo stack (`HistoryService` + `CommandBus`)
 * which records every command incrementally: snapshots are
 * **deliberate checkpoints** the user (or an auto-snapshot rule)
 * creates to mark important states.
 *
 * Mirrors the Photoshop "Snapshots" panel + Affinity "Snapshots"
 * studio + Figma "Version history" panel. Each major editor has the
 * same essentials: name, timestamp, thumbnail, restore-on-click.
 *
 * **Why a separate concept (not just deep undo)**:
 *
 * - **Non-linear navigation**: jumping to "Version A" of a logo
 *   doesn't require Ctrl+Z 47 times.
 * - **Survives history pruning**: when the undo stack reaches its
 *   max size (50 entries default), old commands get dropped. A
 *   snapshot taken before then survives until the user deletes it.
 * - **Identity**: snapshots have human-readable names, undo entries
 *   only have a programmatic label like "Translate".
 * - **Safe experimentation**: take snapshot → try something risky →
 *   `restoreSnapshot()` returns to the marker exactly.
 *
 * **Persisted vs in-memory**: SnapshotsService keeps snapshots in
 * memory; a companion persistence layer (this project's
 * AutoSaveService is the analogue) is responsible for round-tripping
 * snapshots to `localStorage`/IndexedDB.
 */
export interface Snapshot {
  /** Stable identifier (UUID) — survives renames; used for restore/delete dispatch. */
  readonly id: string;
  /**
   * Human-readable label shown in the panel. Defaults to a time-based
   * stamp on auto-snapshots and to `"Snapshot N"` on manual takes.
   * Renamed inline by the user.
   */
  readonly name: string;
  /** ms since epoch — drives the relative-time display in the panel. */
  readonly createdAt: number;
  /**
   * Deep clone of the document at take time. SvgDocument is an
   * immutable tree, so structural sharing means storing the reference
   * is enough — every command produces a new root, so the snapshot's
   * reference is frozen against further edits.
   */
  readonly document: SvgDocument;
  /**
   * Optional rasterized preview (data URL: `data:image/png;base64,...`).
   * Generated async by the UI panel via `pngExporter`; null until
   * ready. The service exposes `attachThumbnail(id, dataUrl)` so the
   * panel can fill it in without going through a command.
   */
  readonly thumbnail: string | null;
  /**
   * What triggered the snapshot — drives the panel's visual
   * differentiation (an icon for `auto-destructive` vs a user marker
   * for `manual`):
   *
   * - `manual`: user clicked "+ New Snapshot" or hit Ctrl+Shift+S
   * - `auto-open`: SnapshotsService.bootstrap on document load
   * - `auto-destructive`: command marked `isDestructive: true`
   *   dispatched (Pathfinder, Optimize, BatchConvertToPath...)
   * - `auto-restore`: a `RestoreSnapshotCommand` saved the pre-restore
   *   state so it can be undone via Ctrl+Z (not shown in the panel)
   */
  readonly source: SnapshotSource;
}

/** Categories of snapshot origin — see {@link Snapshot.source}. */
export type SnapshotSource = 'manual' | 'auto-open' | 'auto-destructive' | 'auto-restore';

/**
 * Tunable bounds for `SnapshotsService`. Mirrors Photoshop's
 * "Performance ▸ History & Cache" settings.
 */
export interface SnapshotsLimits {
  /**
   * Maximum snapshots kept in the ring buffer. Once exceeded, the
   * OLDEST `manual`/`auto-destructive` snapshot is dropped (the
   * `auto-open` baseline is sticky — it always survives, mirroring
   * Photoshop's "always keep first snapshot" rule).
   *
   * Default 50 (Photoshop's default for history states; reasonable
   * for vector-only payloads in localStorage's ~5MB quota).
   */
  readonly maxCount: number;
  /**
   * Take an "Opened" snapshot automatically on `bootstrap(doc)`. The
   * baseline lets the user roll back to the initial state at any
   * point in the session. Default `true` (Photoshop default).
   */
  readonly autoOnOpen: boolean;
  /**
   * Take a "Before {label}" snapshot automatically before any
   * `dispatch(cmd)` where `cmd.isDestructive === true`. Default
   * `false` (Photoshop has this as opt-in too — useful for cautious
   * users; noisy for everyone else).
   */
  readonly autoOnDestructive: boolean;
}

/** Conservative defaults matching Photoshop's out-of-box behavior. */
export const DEFAULT_SNAPSHOT_LIMITS: SnapshotsLimits = Object.freeze({
  maxCount: 50,
  autoOnOpen: true,
  autoOnDestructive: false,
});
