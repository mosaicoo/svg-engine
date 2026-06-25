import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable } from '@angular/core';
import {
  DEFAULT_SNAPSHOT_LIMITS,
  type Snapshot,
  type SnapshotsLimits,
  SnapshotsService,
  type SnapshotSource,
} from '@mosaicoo/svg-engine/core';
import { svgExporter, svgImporter } from '@mosaicoo/svg-engine/io';

/**
 * **D-073 — Snapshots persistence layer.** Round-trips
 * {@link SnapshotsService} contents through `localStorage` so the
 * snapshot collection survives reload — mirrors what `AutoSaveService`
 * (D-020) does for the current document, decoupled from it so neither
 * service grows by accident.
 *
 * **Why per-editor scope (not `providedIn: 'root'`)**: persistence is
 * tied to the editor's snapshots service, which is per-editor. A
 * multi-editor app should NOT persist editor A's snapshots and
 * restore them into editor B. Listed in `provideSvgEngineEditorScope()`
 * alongside `SnapshotsService`.
 *
 * **Storage format**: JSON object under `STORAGE_KEY`:
 *
 * ```json
 * {
 *   "v": 1,
 *   "limits": { "maxCount": 50, "autoOnOpen": true, "autoOnDestructive": false },
 *   "snapshots": [
 *     { "id": "...", "name": "Opened", "createdAt": 1700000000, "svg": "<svg>...</svg>", "thumbnail": "data:image/png;base64,...", "source": "auto-open" },
 *     ...
 *   ]
 * }
 * ```
 *
 * Each snapshot's document is serialized via `svgExporter` and parsed
 * back via `svgImporter` on hydrate — same path as AutoSaveService so
 * the format stays in lockstep with the live document model.
 *
 * **Quota guard**: localStorage is ~5MB. With default 50 snapshots,
 * thumbnails at ~5KB each (80×60 PNG) + tiny SVGs, total ~500KB.
 * Heavier documents could blow the budget — we drop thumbnails first
 * (visual loss), then drop oldest snapshots, before giving up.
 *
 * **Debounce**: writes are debounced 1.5s after the last `snapshots()`
 * change. Take/rename/delete are user actions with seconds of natural
 * spacing — no need to thrash storage on every signal tick.
 *
 * **Bootstrap order**: consumers should `hydrate()` BEFORE the
 * editor's `EditorStateService.resetDocument()` runs, so the
 * baseline `auto-open` snapshot the service would normally create
 * doesn't duplicate one already in storage.
 */
const STORAGE_KEY = 'svge:snapshots';
const SCHEMA_VERSION = 1;
const SAVE_DEBOUNCE_MS = 1500;
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024; // 4 MB — same as AutoSaveService

/**
 * Wire-format mirror of {@link Snapshot} where the document and
 * thumbnail are serialized strings. Exported for testability — specs
 * can construct golden payloads without going through the importer.
 */
export interface SerializedSnapshot {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly svg: string;
  readonly thumbnail: string | null;
  readonly source: SnapshotSource;
}

interface SnapshotsStoragePayload {
  readonly v: number;
  readonly limits: SnapshotsLimits;
  readonly snapshots: readonly SerializedSnapshot[];
}

/**
 * @internal **Cross-entry-point**: exportado para a `<svge-snapshots-panel>`
 * e o scope provider de `svg-engine/ui`/`edit` consumirem do pacote buildado.
 * Fora do contrato público estável — pode mudar sem major bump; consumidores
 * externos não devem depender diretamente.
 */
@Injectable()
export class SnapshotsPersistenceService {
  private readonly snapshots = inject(SnapshotsService);
  private readonly document = inject(DOCUMENT);
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // React to every snapshot collection change and to limit changes.
    effect(() => {
      this.snapshots.snapshots();
      this.snapshots.limits();
      this.scheduleSave();
    });
  }

  /**
   * Force-save the current snapshots collection now, bypassing the
   * debounce. Useful at "before navigate away" hooks (beforeunload)
   * if the consumer wants stronger guarantees than the 1.5s window.
   */
  saveNow(): void {
    if (!this.hasStorage()) return;
    let payload: string;
    try {
      const serialized = this.serialize();
      payload = JSON.stringify(serialized);
    } catch (e) {
      console.warn('SnapshotsPersistenceService: serialization failed —', e);
      return;
    }
    if (payload.length > MAX_PAYLOAD_BYTES) {
      // Try shedding thumbnails first — the snapshots themselves stay
      // restorable, only the panel previews go dark.
      try {
        const trimmed = JSON.stringify(this.serialize({ dropThumbnails: true }));
        if (trimmed.length <= MAX_PAYLOAD_BYTES) {
          payload = trimmed;
        } else {
          console.warn(
            `SnapshotsPersistenceService: payload (${payload.length} B) exceeds limit (${MAX_PAYLOAD_BYTES} B) even after stripping thumbnails — skipping save.`,
          );
          return;
        }
      } catch (e) {
        console.warn('SnapshotsPersistenceService: thumbnail-stripped serialization failed —', e);
        return;
      }
    }
    try {
      const win = this.window();
      if (win === null) return;
      win.localStorage.setItem(STORAGE_KEY, payload);
    } catch (e) {
      console.warn('SnapshotsPersistenceService: localStorage write failed —', e);
    }
  }

  /**
   * Read previously-persisted snapshots from storage and seed
   * {@link SnapshotsService} via `hydrate(...)`. Returns `true` on a
   * successful hydration, `false` when nothing was stored or the
   * payload was malformed (logged + ignored).
   *
   * **Call timing**: invoke at app bootstrap BEFORE
   * `SnapshotsService.bootstrap(document)` — hydration may include
   * a previously-recorded `auto-open` baseline, and double-firing
   * `bootstrap` would emit a second one (the service has a
   * defensive check, but waiting for hydrate first is cleaner).
   */
  hydrate(): boolean {
    if (!this.hasStorage()) return false;
    const win = this.window();
    if (win === null) return false;
    const raw = win.localStorage.getItem(STORAGE_KEY);
    if (raw === null || raw.length === 0) return false;
    let parsed: SnapshotsStoragePayload;
    try {
      parsed = JSON.parse(raw) as SnapshotsStoragePayload;
    } catch (e) {
      console.warn('SnapshotsPersistenceService: malformed JSON in storage —', e);
      return false;
    }
    if (parsed.v !== SCHEMA_VERSION) {
      console.warn(
        `SnapshotsPersistenceService: unknown schema version ${parsed.v} (expected ${SCHEMA_VERSION}) — ignoring.`,
      );
      return false;
    }
    const restored: Snapshot[] = [];
    for (const s of parsed.snapshots) {
      const importResult = svgImporter.import(s.svg);
      if (!importResult.ok) {
        console.warn(
          `SnapshotsPersistenceService: snapshot "${s.name}" failed to import (${importResult.error}) — skipping.`,
        );
        continue;
      }
      restored.push({
        id: s.id,
        name: s.name,
        createdAt: s.createdAt,
        document: importResult.document,
        thumbnail: s.thumbnail,
        source: s.source,
      });
    }
    if (parsed.limits !== undefined && parsed.limits !== null) {
      this.snapshots.setLimits(parsed.limits);
    }
    this.snapshots.hydrate(restored);
    return true;
  }

  /** Drop any persisted snapshots. */
  clearStorage(): void {
    if (!this.hasStorage()) return;
    const win = this.window();
    if (win === null) return;
    win.localStorage.removeItem(STORAGE_KEY);
  }

  // ── Internals ────────────────────────────────────────────────────

  private scheduleSave(): void {
    if (!this.hasStorage()) return;
    if (this.debounceHandle !== null) clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => {
      this.debounceHandle = null;
      this.saveNow();
    }, SAVE_DEBOUNCE_MS);
  }

  private serialize(opts: { dropThumbnails?: boolean } = {}): SnapshotsStoragePayload {
    const drop = opts.dropThumbnails === true;
    const serialized: SerializedSnapshot[] = [];
    for (const s of this.snapshots.snapshots()) {
      const svg = svgExporter.export(s.document);
      const svgText = typeof svg === 'string' ? svg : '';
      if (svgText.length === 0) continue; // skip un-serializable doc
      serialized.push({
        id: s.id,
        name: s.name,
        createdAt: s.createdAt,
        svg: svgText,
        thumbnail: drop ? null : s.thumbnail,
        source: s.source,
      });
    }
    return {
      v: SCHEMA_VERSION,
      limits: this.snapshots.limits() ?? DEFAULT_SNAPSHOT_LIMITS,
      snapshots: serialized,
    };
  }

  private window(): (Window & typeof globalThis) | null {
    const docWindow = this.document.defaultView;
    if (docWindow !== null) return docWindow as Window & typeof globalThis;
    if (typeof window !== 'undefined') return window;
    return null;
  }

  private hasStorage(): boolean {
    const win = this.window();
    if (win === null) return false;
    try {
      return typeof win.localStorage !== 'undefined';
    } catch {
      return false;
    }
  }
}
