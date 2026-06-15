import { Injectable, signal } from '@angular/core';

/**
 * **D-106** — how `File ▸ Import ▸ SVG` positions the imported art.
 *
 * - `'centered'` — insert at the file's **natural 1:1 size**, centered on
 *   the active page. Fast, no interaction. The default.
 * - `'place'` — **interactive**: the user drags a placement rectangle on the
 *   canvas (Illustrator's *Place*) and the art is fit into it. (D-107.)
 */
export type ImportPlacementMode = 'centered' | 'place';

/** localStorage slot for the persisted {@link ImportPlacementMode}. */
const STORAGE_KEY = 'svge:import:placement-mode';

/**
 * **D-106** — persistent, app-wide preference for the SVG import placement
 * mode. **Root-scoped** (not per-editor): it's a user preference like the
 * theme, shared across every editor instance and remembered across reloads
 * via `localStorage`. The `File ▸ Import ▸ SVG` handler reads it to decide
 * between an immediate centered insert and the interactive drag-to-place
 * flow; the Workspace Settings dialog writes it.
 */
@Injectable({ providedIn: 'root' })
export class ImportSettingsService {
  private readonly _placementMode = signal<ImportPlacementMode>(readPersisted());

  /** Current import placement mode (reactive). */
  readonly placementMode = this._placementMode.asReadonly();

  /** Set + persist the placement mode. */
  setPlacementMode(mode: ImportPlacementMode): void {
    if (mode === this._placementMode()) return;
    this._placementMode.set(mode);
    writePersisted(mode);
  }
}

/** Restore the persisted mode, defaulting to `'centered'`. */
function readPersisted(): ImportPlacementMode {
  if (typeof localStorage === 'undefined') return 'centered';
  try {
    return localStorage.getItem(STORAGE_KEY) === 'place' ? 'place' : 'centered';
  } catch {
    return 'centered';
  }
}

/** Persist the mode. Fails silently (quota / private mode / SSR). */
function writePersisted(mode: ImportPlacementMode): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage unavailable — the in-memory signal still drives this session.
  }
}
