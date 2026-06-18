import { InjectionToken } from '@angular/core';

/**
 * **D-136** — `localStorage` base key under which {@link RecentFilesService}
 * persists the "Open Recent" list (the MRU of files opened via `File ▸ Open…`).
 *
 * Default `'svge:recent-files'`.
 *
 * **Why a token (not a hard-coded constant)**: parity with
 * `AUTOSAVE_STORAGE_KEY` / `ACTIVE_PAGE_STORAGE_KEY` — a host can point the
 * list at a custom slot, or **disable persistence entirely** by binding the
 * token to `null` (e.g. an embedded preview surface where a recent-files menu
 * would be confusing). Unlike auto-save, the recent list is intentionally
 * **app-wide / shared** (like the color history): the service stays
 * `providedIn: 'root'` and is NOT part of `provideSvgEngineEditorScope()`, so
 * every editor instance shares one MRU. Re-point the token in the root
 * injector if you want a different slot.
 *
 * ```ts
 * // disable the recent-files persistence app-wide:
 * { provide: RECENT_FILES_STORAGE_KEY, useValue: null }
 * ```
 */
export const RECENT_FILES_STORAGE_KEY = new InjectionToken<string | null>(
  'RECENT_FILES_STORAGE_KEY',
  {
    providedIn: 'root',
    factory: () => 'svge:recent-files',
  },
);
