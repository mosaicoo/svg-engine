import { InjectionToken } from '@angular/core';

/**
 * **D-077 follow-up** — `localStorage` base key under which
 * {@link AssetExportPersistenceService} round-trips the
 * {@link AssetExportRegistry.slots} collection, so the user's batch
 * export recipes survive a page reload.
 *
 * Default `'svge:assetExport'`. The value stored at this key is a
 * JSON object whose shape is defined in `asset-export-persistence.service.ts`
 * (`AssetExportStoragePayload`) — bump the schema version field
 * inside that file when changing the wire format.
 *
 * **Why a token** (not a hard-coded constant): mirrors
 * {@link AUTOSAVE_STORAGE_KEY} (D-073), {@link ACTIVE_PAGE_STORAGE_KEY}
 * (PAGES-REFACTOR Fase 7), and {@link SNAPSHOTS_STORAGE_KEY} (D-073)
 * patterns. Multi-editor hosts (D-042) need disjoint storage slots so
 * an editor B doesn't clobber editor A's export recipes.
 *
 * **How to override**:
 *
 * ```ts
 * @Component({
 *   providers: [
 *     provideSvgEngineEditorScope({
 *       assetExportStorageKey: 'svge:assetExport:editor-a',
 *     }),
 *   ],
 * })
 * export class EditorARoute {}
 * ```
 *
 * Or directly via `{ provide: ASSET_EXPORT_STORAGE_KEY, useValue: '...' }`
 * in any injector that hosts the per-editor `AssetExportRegistry`.
 *
 * **No persistence at all**: pass `null` to disable storage entirely
 * (the panel still works, but the slot list is in-memory only and
 * resets on every page load). Useful for ephemeral preview surfaces
 * or embed contexts where mixing persisted state across embed hosts
 * would be confusing.
 *
 * **Why a separate key** (vs piggy-backing on `AUTOSAVE_STORAGE_KEY`):
 * the autosave payload is the document itself (heavy, multi-MB,
 * debounced 2s). Export slots are tiny (a handful of strings + a
 * numeric scale per slot) and shouldn't compete for the autosave
 * payload budget. Decoupling also lets one feature be disabled
 * without affecting the other.
 */
export const ASSET_EXPORT_STORAGE_KEY = new InjectionToken<string | null>(
  'ASSET_EXPORT_STORAGE_KEY',
  {
    providedIn: 'root',
    factory: () => 'svge:assetExport',
  },
);
