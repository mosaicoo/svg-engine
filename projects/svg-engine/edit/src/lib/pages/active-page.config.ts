import { InjectionToken } from '@angular/core';

/**
 * **PAGES-REFACTOR Fase 7** — `localStorage` base key under which
 * {@link ActivePageService} persists the currently-active page id, so
 * that reopening / reloading the editor restores the same page the
 * user was working on (not always the first one).
 *
 * Default `'svge:activePage'`. The value stored at this key is the
 * raw `NodeId` (UUID string) of the active page.
 *
 * **Why a token** (not a hard-coded constant): mirrors the
 * {@link AUTOSAVE_STORAGE_KEY} pattern from AUDIT-FIX P8. Multi-editor
 * hosts (D-042) need disjoint storage slots so an editor B doesn't
 * clobber editor A's active-page memory.
 *
 * **How to override**:
 *
 * ```ts
 * @Component({
 *   providers: [
 *     provideSvgEngineEditorScope({
 *       activePageStorageKey: 'svge:activePage:editor-a',
 *     }),
 *   ],
 * })
 * export class EditorARoute {}
 * ```
 *
 * Or directly via `{ provide: ACTIVE_PAGE_STORAGE_KEY, useValue: '...' }`
 * in any injector that hosts the per-editor `ActivePageService`.
 *
 * **No persistence at all**: pass `null` to disable storage entirely
 * (the service falls back to auto-pick-first-page behavior on every
 * mount). Useful for embedded preview surfaces.
 *
 * **Why a separate key** (vs piggy-backing on `AUTOSAVE_STORAGE_KEY`):
 * the autosave payload is the document itself (heavy, multi-MB,
 * debounced 2s). The active-page id is a 36-char UUID written
 * synchronously on every `setActive` call (~rare event). Decoupling
 * lets one feature be disabled without affecting the other.
 */
export const ACTIVE_PAGE_STORAGE_KEY = new InjectionToken<string | null>(
  'ACTIVE_PAGE_STORAGE_KEY',
  {
    providedIn: 'root',
    factory: () => 'svge:activePage',
  },
);
