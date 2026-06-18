import { DOCUMENT } from '@angular/common';
import { computed, inject, Injectable, signal } from '@angular/core';

import { RECENT_FILES_STORAGE_KEY } from './recent-files.config';

/** Maximum number of files kept in the MRU list. */
const MAX_RECENT = 10;
/**
 * Per-entry size cap. A browser app must store the file's CONTENT to be able to
 * re-open it (no silent disk access), so a single huge SVG could blow the
 * ~5 MB localStorage quota on its own. Files larger than this are still opened
 * normally — they just don't join the recent list (better than evicting the
 * whole MRU or throwing QuotaExceededError).
 */
const MAX_ENTRY_BYTES = 256 * 1024; // 256 KB

/**
 * One entry in the "Open Recent" list.
 *
 * **Why store `svg` (the full content), not a path**: a web app cannot reopen a
 * file from a disk path without the File System Access API + a re-granted
 * permission. To actually reopen, the content must be kept — so each entry
 * carries the SVG text captured when the file was opened.
 */
export interface RecentFile {
  /** File name as chosen in the OS picker (e.g. `logo.svg`). */
  readonly name: string;
  /** The file's SVG source at open time — replayed to reopen. */
  readonly svg: string;
  /** ISO-8601 timestamp of the most recent open. */
  readonly openedAt: string;
}

/**
 * **D-136 — Recent files (MRU) for `File ▸ Open Recent`.**
 *
 * Tracks the files opened via `File ▸ Open…`, newest first, persisted to
 * `localStorage` so the list survives reloads / browser restarts — the whole
 * point of "recent". The built-in menu plugin renders the list as a dynamic
 * submenu and reopens an entry by replaying its stored {@link RecentFile.svg}.
 *
 * **Scope**: `providedIn: 'root'` and **shared app-wide** (NOT in
 * `provideSvgEngineEditorScope()`), mirroring the color history — a single MRU
 * is the expected behaviour even with multiple editors. The reopen always lands
 * in the editor that fired the menu item (the menu handler resolves services
 * from `runCtx.injector`).
 *
 * **Storage shape**: a JSON array under {@link RECENT_FILES_STORAGE_KEY}. Bad /
 * legacy / oversized payloads are dropped silently (best-effort recovery).
 *
 * **No-op in non-browser env** (SSR / Node): guarded like `AutoSaveService`.
 */
@Injectable({ providedIn: 'root' })
export class RecentFilesService {
  private readonly document = inject(DOCUMENT);
  private readonly storageKey = inject(RECENT_FILES_STORAGE_KEY);

  private readonly _files = signal<readonly RecentFile[]>(this.load());

  /** The MRU list, newest first. Drives the `File ▸ Open Recent` submenu. */
  readonly files = this._files.asReadonly();
  /** `true` when there are no recent files (menu shows an empty state). */
  readonly isEmpty = computed(() => this._files().length === 0);

  /**
   * Plain (non-signal) change listeners. The built-in menu plugin rebuilds the
   * dynamic `Open Recent` submenu through this, NOT through an Angular `effect`:
   * the rebuild mutates the `MenuContributionRegistry` signal, and doing that
   * from inside an effect couples a signal write to change detection (which can
   * loop). A synchronous observer fired only from explicit mutations
   * (`record`/`clear`) keeps the registry writes out of the reactive graph.
   */
  private readonly listeners = new Set<() => void>();

  /** Subscribe to MRU changes. Returns an unsubscribe function. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /**
   * Record a freshly-opened file at the top of the MRU. De-dupes by name
   * (case-insensitive) so reopening a file moves it to the top instead of
   * duplicating it, caps the list at {@link MAX_RECENT}, and skips files larger
   * than {@link MAX_ENTRY_BYTES} (they still open — just aren't remembered).
   */
  record(name: string, svg: string): void {
    const cleanName = name.trim() === '' ? 'Untitled.svg' : name.trim();
    if (svg.length > MAX_ENTRY_BYTES) {
      if (typeof console !== 'undefined') {
        console.warn(
          `RecentFilesService: "${cleanName}" (${svg.length} B) exceeds the ${MAX_ENTRY_BYTES} B per-entry cap — not added to recent files.`,
        );
      }
      return;
    }
    const entry: RecentFile = { name: cleanName, svg, openedAt: new Date().toISOString() };
    const key = cleanName.toLowerCase();
    const next = [entry, ...this._files().filter((f) => f.name.toLowerCase() !== key)].slice(
      0,
      MAX_RECENT,
    );
    this._files.set(next);
    this.persist(next);
    this.notify();
  }

  /** Empty the MRU (the menu's "Clear Recent Files" action). */
  clear(): void {
    if (this._files().length === 0) return;
    this._files.set([]);
    this.persist([]);
    this.notify();
  }

  // ── Internals ────────────────────────────────────────────────────

  private load(): readonly RecentFile[] {
    const win = this.window();
    const key = this.key();
    if (win === null || key === null) return [];
    let raw: string | null;
    try {
      raw = win.localStorage.getItem(key);
    } catch {
      return [];
    }
    if (raw === null || raw.length === 0) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (e): e is RecentFile =>
            typeof e === 'object' &&
            e !== null &&
            typeof (e as RecentFile).name === 'string' &&
            typeof (e as RecentFile).svg === 'string' &&
            typeof (e as RecentFile).openedAt === 'string',
        )
        .slice(0, MAX_RECENT);
    } catch {
      return [];
    }
  }

  /**
   * Persist `files`, shedding the oldest entries on `QuotaExceededError` so a
   * near-full quota degrades gracefully (keep the most-recent few) instead of
   * throwing. A truly un-writable storage (private mode) just warns.
   */
  private persist(files: readonly RecentFile[]): void {
    const win = this.window();
    const key = this.key();
    if (win === null || key === null) return;
    if (files.length === 0) {
      try {
        win.localStorage.removeItem(key);
      } catch {
        // ignore — nothing to recover from on a removal failure.
      }
      return;
    }
    let attempt = [...files];
    while (attempt.length > 0) {
      try {
        win.localStorage.setItem(key, JSON.stringify(attempt));
        return;
      } catch {
        attempt = attempt.slice(0, attempt.length - 1); // drop the oldest, retry
      }
    }
    if (typeof console !== 'undefined') {
      console.warn('RecentFilesService: localStorage write failed (quota / private mode).');
    }
  }

  private key(): string | null {
    const base = this.storageKey;
    return base === null || base.length === 0 ? null : base;
  }

  /** Cross-env window accessor — falls back to null in SSR / tests. */
  private window(): (Window & typeof globalThis) | null {
    const docWindow = this.document.defaultView;
    if (docWindow !== null) return docWindow as Window & typeof globalThis;
    if (typeof window !== 'undefined') return window;
    return null;
  }
}
