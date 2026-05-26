import { InjectionToken } from '@angular/core';

/**
 * **D-074-fix (AUDIT-FIX P8)** — `localStorage` base key under which
 * {@link AutoSaveService} writes the auto-saved document.
 *
 * Default `'svge:autosave'`. The companion timestamp slot is derived
 * by appending `':ts'` (e.g., `'svge:autosave:ts'`) — consumers don't
 * need to provide both; one base key suffices.
 *
 * **Why a token (not a hard-coded constant)**: in **multi-editor** hosts
 * (D-042 — two or more `<svge-editor>` instances mounted in the same
 * Angular app), every editor instance would otherwise share the same
 * localStorage slot. Closing/reopening the page would surface only the
 * last editor's content, regardless of which one the user was actually
 * working on. Worse, an autosave from editor B mid-tick would overwrite
 * editor A's pending recovery payload — silent data loss.
 *
 * **How to override**:
 *
 * ```ts
 * @Component({
 *   selector: 'editor-a-route',
 *   providers: [
 *     provideSvgEngineEditorScope({ autoSaveKey: 'svge:autosave:editor-a' }),
 *   ],
 * })
 * export class EditorARoute {}
 * ```
 *
 * Or directly via `{ provide: AUTOSAVE_STORAGE_KEY, useValue: '...' }`
 * in any injector that hosts the per-editor `AutoSaveService`.
 *
 * **Single-editor apps** (the common case): leave the default. The
 * pre-existing `'svge:autosave'` slot is preserved verbatim so existing
 * recovery payloads continue to be readable across this change.
 *
 * **No persistence at all**: pass `null` to disable storage writes
 * entirely (the service no-ops). Useful for embedded preview surfaces
 * where stale recovery would be confusing.
 */
export const AUTOSAVE_STORAGE_KEY = new InjectionToken<string | null>('AUTOSAVE_STORAGE_KEY', {
  providedIn: 'root',
  factory: () => 'svge:autosave',
});
