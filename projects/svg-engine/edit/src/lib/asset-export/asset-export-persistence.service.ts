import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable } from '@angular/core';
import { ASSET_EXPORT_STORAGE_KEY } from './asset-export.config';
import { AssetExportRegistry } from './asset-export-registry.service';
import type { ExportSlot } from './asset-export.types';

/**
 * **D-077 follow-up — Asset Export persistence layer.** Round-trips
 * {@link AssetExportRegistry.slots} through `localStorage` so the
 * user's batch export recipes (logo @1x.png + @2x.png + .svg, etc.)
 * survive a page reload. Mirrors {@link SnapshotsPersistenceService}
 * (D-073) for snapshots and `AutoSaveService` (D-020) for documents,
 * decoupled from both so a feature toggle on one doesn't ripple to
 * the others.
 *
 * **Why per-editor scope (not `providedIn: 'root'`)**: the registry it
 * persists is per-editor (D-077 explicit), so the persistence must
 * follow. A multi-editor app should NOT serialize editor A's slots
 * into editor B's storage slot. Listed in
 * {@link provideSvgEngineEditorScope} alongside `AssetExportRegistry`.
 *
 * **Storage format** under {@link ASSET_EXPORT_STORAGE_KEY}:
 *
 * ```json
 * {
 *   "v": 1,
 *   "slots": [
 *     { "id": "slot-...", "target": "document", "exporterId": "svge.builtin.exporter.svg",
 *       "scale": 1, "filename": "logo" },
 *     ...
 *   ]
 * }
 * ```
 *
 * Slots are small (~100 bytes each) so quota concerns are negligible —
 * a user with 100 slots would be ~10KB, well under the localStorage
 * budget. No thumbnail / heavy payload like Snapshots, so no need for
 * the "drop heavy fields then retry" fallback that Snapshots uses.
 *
 * **Debounce**: writes are debounced 500ms after the last `slots()`
 * change. Add/remove/rename are user actions with seconds of natural
 * spacing — no need to thrash storage on every signal tick. The
 * shorter window (vs 1500ms for Snapshots) is because the payload is
 * tiny and the user expects "the slot I just added is saved if I
 * refresh now".
 *
 * **Hydrate timing**: invoke {@link hydrate} at app bootstrap BEFORE
 * the user opens the Asset Export panel — usually as part of the
 * editor scope's APP_INITIALIZER or in the host route's `constructor`
 * via `inject(AssetExportPersistenceService).hydrate()`. Skipping
 * hydrate doesn't break the persistence (saves still run); it just
 * means the user sees a blank list on first paint before the saved
 * recipes appear later.
 *
 * **Graceful degradation**:
 * - `localStorage` unavailable (SSR, privacy mode) → all methods are
 *   silent no-ops; the registry behaves as ephemeral in-memory.
 * - Malformed JSON in storage → logged + ignored; the user sees an
 *   empty list rather than a crash.
 * - Unknown schema version → logged + ignored (no auto-migration in
 *   v1; bump SCHEMA_VERSION when changing the wire format).
 */
const SCHEMA_VERSION = 1;
const SAVE_DEBOUNCE_MS = 500;

interface AssetExportStoragePayload {
  readonly v: number;
  readonly slots: readonly ExportSlot[];
}

@Injectable()
export class AssetExportPersistenceService {
  private readonly registry = inject(AssetExportRegistry);
  private readonly document = inject(DOCUMENT);
  private readonly storageKey = inject(ASSET_EXPORT_STORAGE_KEY);
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Auto-hydrate from storage so the user sees their saved slots on
    // first paint without the host having to remember `.hydrate()`.
    // Safe because the registry starts empty — there's no "merge vs
    // replace" race; whatever was in storage simply becomes the
    // initial slot list. Different from SnapshotsPersistenceService
    // which defers hydrate to avoid double-emitting the auto-open
    // snapshot baseline; we have no such baseline emission so the
    // simpler ergonomics win.
    //
    // Note: the auto-save effect below will fire one extra time
    // immediately after hydrate (because we mutated slots()), writing
    // back the same payload we just read. Negligible cost (one
    // localStorage.setItem on a tiny string) and the dedup of the
    // round-trip would add complexity disproportional to the savings.
    this.hydrate();
    // Auto-save on every slot list change. Wraps in an effect so the
    // service stays passive — consumers don't need to subscribe or
    // wire anything beyond provisioning the service.
    effect(() => {
      this.registry.slots();
      this.scheduleSave();
    });
  }

  /**
   * Force-save the current slot list now, bypassing the debounce.
   * Useful at `beforeunload` hooks if the consumer wants stronger
   * guarantees than the 500ms window. Idempotent — safe to call
   * arbitrarily often.
   */
  saveNow(): void {
    if (!this.hasStorage()) return;
    const win = this.window();
    if (win === null) return;
    const key = this.storageKey;
    if (key === null || key.length === 0) return;
    let payload: string;
    try {
      const serialized: AssetExportStoragePayload = {
        v: SCHEMA_VERSION,
        slots: this.registry.slots(),
      };
      payload = JSON.stringify(serialized);
    } catch (e) {
      console.warn('AssetExportPersistenceService: serialization failed —', e);
      return;
    }
    try {
      win.localStorage.setItem(key, payload);
    } catch (e) {
      console.warn('AssetExportPersistenceService: localStorage write failed —', e);
    }
  }

  /**
   * Read previously-persisted slots from storage and seed the registry
   * via {@link AssetExportRegistry.setAll}. Returns `true` on
   * successful hydration, `false` when nothing was stored OR the
   * payload was malformed (logged + ignored).
   *
   * **Idempotency**: calling hydrate twice is safe — the second call
   * just re-seeds with the same (or updated) storage contents. Use
   * sparingly; typically only at bootstrap.
   */
  hydrate(): boolean {
    if (!this.hasStorage()) return false;
    const win = this.window();
    if (win === null) return false;
    const key = this.storageKey;
    if (key === null || key.length === 0) return false;
    const raw = win.localStorage.getItem(key);
    if (raw === null || raw.length === 0) return false;
    let parsed: AssetExportStoragePayload;
    try {
      parsed = JSON.parse(raw) as AssetExportStoragePayload;
    } catch (e) {
      console.warn('AssetExportPersistenceService: malformed JSON in storage —', e);
      return false;
    }
    if (parsed.v !== SCHEMA_VERSION) {
      console.warn(
        `AssetExportPersistenceService: unknown schema version ${parsed.v} (expected ${SCHEMA_VERSION}) — ignoring.`,
      );
      return false;
    }
    if (!Array.isArray(parsed.slots)) {
      console.warn('AssetExportPersistenceService: payload.slots is not an array — ignoring.');
      return false;
    }
    // Filter out any malformed slots defensively — we'd rather lose
    // one bad slot than reject the whole payload.
    const valid: ExportSlot[] = [];
    for (const s of parsed.slots) {
      if (
        typeof s.id === 'string' &&
        s.id.length > 0 &&
        typeof s.exporterId === 'string' &&
        s.exporterId.length > 0 &&
        typeof s.scale === 'number' &&
        Number.isFinite(s.scale) &&
        s.scale > 0 &&
        typeof s.filename === 'string' &&
        (s.target === 'document' ||
          (typeof s.target === 'object' && s.target !== null && 'nodeId' in s.target))
      ) {
        valid.push(s);
      }
    }
    this.registry.setAll(valid);
    return true;
  }

  /** Drop any persisted slots. */
  clearStorage(): void {
    if (!this.hasStorage()) return;
    const win = this.window();
    if (win === null) return;
    const key = this.storageKey;
    if (key === null || key.length === 0) return;
    win.localStorage.removeItem(key);
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
