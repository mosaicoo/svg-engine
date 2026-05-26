import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable } from '@angular/core';
import { EditorStateService } from 'svg-engine/core';
import { svgExporter } from 'svg-engine/io';
import { AUTOSAVE_STORAGE_KEY } from './autosave.config';

/** Debounce delay between document changes and a save commit (ms). */
const SAVE_DEBOUNCE_MS = 2000;
/** Hard upper bound on the serialized payload — guards against quota errors. */
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024; // 4 MB

/**
 * Auto-save service — observes `EditorStateService.document()` and
 * persists the latest serialized SVG into `localStorage` after a short
 * idle period, so the user can recover work after an accidental tab
 * close or reload.
 *
 * **Why localStorage** (vs IndexedDB): a single SVG document fits in
 * the 5-10 MB localStorage quota for any realistic project size, and
 * the synchronous API makes recovery trivial at bootstrap. IndexedDB
 * would be needed only when we add a multi-document tabs workflow.
 *
 * **Why debounce** (vs every keystroke): writing on every signal
 * change would block the main thread on text-heavy ops (rename burst,
 * marquee select). 2s feels responsive without thrashing.
 *
 * **Quota guard**: payloads over {@link MAX_PAYLOAD_BYTES} are dropped
 * with a warn — better than throwing `QuotaExceededError` on a paint
 * with thousands of paths. Future improvement: gzip via CompressionStream.
 *
 * **Consumer wiring**:
 * 1. Inject this service somewhere in the bootstrap chain (a
 *    `provideAutoSave()` helper could be added later — for now an
 *    `inject(AutoSaveService)` in a top-level component is enough).
 * 2. On app start, call {@link readRecovery} BEFORE setting the
 *    document — it returns the last saved SVG string (or null) so
 *    you can prompt the user "Restore unsaved work?".
 * 3. After the user decides, call {@link clearRecovery} to drop the
 *    saved payload (or {@link snapshotNow} to commit immediately).
 *
 * **No-op in non-browser env** (SSR / Node): both
 * `typeof window === 'undefined'` and `localStorage === undefined`
 * are checked. The service is safe to instantiate everywhere.
 */
@Injectable({ providedIn: 'root' })
export class AutoSaveService {
  private readonly state = inject(EditorStateService);
  private readonly document = inject(DOCUMENT);
  /**
   * **AUDIT-FIX P8**: base localStorage slot for this instance. Pulled
   * from {@link AUTOSAVE_STORAGE_KEY} so multi-editor hosts can scope
   * per-editor (see token doc). `null` disables storage writes entirely.
   *
   * The companion timestamp slot is derived as `${storageKey}:ts`.
   */
  private readonly storageKey = inject(AUTOSAVE_STORAGE_KEY);
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // React to every document mutation. The effect runs synchronously
    // (microtask) after each signal change; we schedule a real save
    // via debounce.
    effect(() => {
      // Touch the signal so this effect re-fires on changes. The
      // document value itself is read inside `snapshotNow` to keep
      // the effect closure cheap.
      this.state.document();
      this.scheduleSave();
    });
  }

  /** Force-save right now, bypassing the debounce. */
  snapshotNow(): void {
    if (!this.hasStorage()) return;
    const keys = this.keys();
    if (keys === null) return;
    const doc = this.state.document();
    let payload: string;
    try {
      const out = svgExporter.export(doc);
      // svgExporter is sync for SVG — returns string, not Promise.
      payload = typeof out === 'string' ? out : '';
    } catch (e) {
      console.warn('AutoSaveService: serialization failed —', e);
      return;
    }
    if (payload.length === 0) return;
    if (payload.length > MAX_PAYLOAD_BYTES) {
      console.warn(
        `AutoSaveService: payload (${payload.length} B) exceeds limit (${MAX_PAYLOAD_BYTES} B) — skipping save.`,
      );
      return;
    }
    try {
      const win = this.window();
      if (win === null) return;
      win.localStorage.setItem(keys.storage, payload);
      win.localStorage.setItem(keys.timestamp, new Date().toISOString());
    } catch (e) {
      console.warn('AutoSaveService: localStorage write failed —', e);
    }
  }

  /**
   * Return the last auto-saved SVG (and its timestamp) or `null` when
   * nothing is stored. Call at bootstrap, BEFORE seeding the document,
   * to decide whether to prompt for recovery.
   */
  readRecovery(): { readonly svg: string; readonly savedAt: Date } | null {
    if (!this.hasStorage()) return null;
    const keys = this.keys();
    if (keys === null) return null;
    const win = this.window();
    if (win === null) return null;
    const svg = win.localStorage.getItem(keys.storage);
    if (svg === null || svg.length === 0) return null;
    const ts = win.localStorage.getItem(keys.timestamp);
    const savedAt = ts !== null ? new Date(ts) : new Date(0);
    if (!Number.isFinite(savedAt.getTime())) return { svg, savedAt: new Date(0) };
    return { svg, savedAt };
  }

  /** Drop the saved payload (user declined recovery, or just confirmed it). */
  clearRecovery(): void {
    if (!this.hasStorage()) return;
    const keys = this.keys();
    if (keys === null) return;
    const win = this.window();
    if (win === null) return;
    win.localStorage.removeItem(keys.storage);
    win.localStorage.removeItem(keys.timestamp);
  }

  // ── Internals ────────────────────────────────────────────────────

  private scheduleSave(): void {
    if (!this.hasStorage()) return;
    if (this.keys() === null) return;
    if (this.debounceHandle !== null) clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => {
      this.debounceHandle = null;
      this.snapshotNow();
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Resolve the configured storage slot pair (data + timestamp) or
   * `null` when persistence is explicitly disabled (token bound to
   * `null`). Centralizing this here keeps every read/write path
   * honoring the same opt-out switch.
   */
  private keys(): { readonly storage: string; readonly timestamp: string } | null {
    const base = this.storageKey;
    if (base === null || base.length === 0) return null;
    return { storage: base, timestamp: `${base}:ts` };
  }

  /** Cross-env window accessor — falls back to null in SSR / tests. */
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
      // Some browser privacy modes throw on `.localStorage` access.
      return false;
    }
  }
}
