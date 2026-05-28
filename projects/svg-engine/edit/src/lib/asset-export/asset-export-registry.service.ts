import { computed, Injectable, signal } from '@angular/core';
import type { ExportSlot, ExportSlotInput } from './asset-export.types';

/**
 * **D-077 — Asset Export registry.**
 *
 * In-memory store of {@link ExportSlot}s plus a name-resolver that
 * disambiguates colliding filenames at export time (so two slots both
 * named `logo` produce `logo.svg` and `logo (1).svg`, not silently
 * overwriting one file).
 *
 * **Scope**: per-editor via `provideSvgEngineEditorScope()` (D-042).
 * Each editor instance keeps its own slot list — two `<svge-shell-pro>`
 * mounted side-by-side won't see each other's recipes.
 *
 * **Why a service over a feature on `WorkspaceService`**: export is a
 * distinct concern (consumes the document but doesn't configure
 * canvas chrome). Keeping it separate avoids inflating WorkspaceService
 * with batch-export state and makes the registry trivially mockable
 * in specs.
 *
 * **Persistence**: provided by {@link AssetExportPersistenceService}
 * (D-077 follow-up). The persistence service round-trips
 * {@link slots} through `localStorage` so the user's batch recipes
 * survive page reloads — same pattern as `SnapshotsPersistenceService`
 * (D-073). The registry itself stays pure / in-memory; the
 * persistence layer is wired in `provideSvgEngineEditorScope()` and
 * registers an `effect()` that auto-saves on every signal change.
 * Key configurable via {@link ASSET_EXPORT_STORAGE_KEY}.
 */
@Injectable({ providedIn: 'root' })
export class AssetExportRegistry {
  private readonly _slots = signal<readonly ExportSlot[]>([]);

  /** Reactive snapshot of the slot list (insertion order). */
  readonly slots = this._slots.asReadonly();

  /** Number of registered slots — for `Export All (N)` button labels. */
  readonly count = computed(() => this._slots().length);

  /**
   * Append a slot. Generates an id if the caller didn't provide one.
   * Rejects (returns null) when `exporterId` is empty — defensive
   * against UI that forgets to gate on "choose format first".
   *
   * Returns the inserted slot (with its final id) so the caller can
   * focus / scroll-to it in the UI.
   */
  add(input: ExportSlotInput): ExportSlot | null {
    if (typeof input.exporterId !== 'string' || input.exporterId.length === 0) return null;
    const slot: ExportSlot = {
      id: input.id ?? generateSlotId(),
      target: input.target,
      exporterId: input.exporterId,
      scale: Number.isFinite(input.scale) && input.scale > 0 ? input.scale : 1,
      filename: input.filename,
    };
    this._slots.set([...this._slots(), slot]);
    return slot;
  }

  /**
   * Patch fields of an existing slot. Returns true on success, false
   * when the id isn't found (defensive — no-op rather than throw so
   * race conditions during rapid UI edits don't crash the panel).
   */
  update(id: string, patch: Partial<Omit<ExportSlot, 'id'>>): boolean {
    const current = this._slots();
    const idx = current.findIndex((s) => s.id === id);
    if (idx < 0) return false;
    const next = current.slice();
    next[idx] = { ...current[idx]!, ...patch };
    this._slots.set(next);
    return true;
  }

  /** Remove a slot by id. No-op when id missing (idempotent). */
  remove(id: string): void {
    const next = this._slots().filter((s) => s.id !== id);
    if (next.length === this._slots().length) return;
    this._slots.set(next);
  }

  /** Drop all slots. Same semantics as `clearAll` in similar registries. */
  clear(): void {
    if (this._slots().length === 0) return;
    this._slots.set([]);
  }

  /**
   * Bulk-replace the slot list. Used by persistence layers at
   * bootstrap. Validates that ids are unique — invalid input is
   * silently rejected (caller should check `count()` to detect).
   */
  setAll(slots: readonly ExportSlot[]): void {
    const seenIds = new Set<string>();
    for (const slot of slots) {
      if (seenIds.has(slot.id)) return;
      seenIds.add(slot.id);
    }
    this._slots.set(slots.slice());
  }

  /**
   * Build the final filename for a slot, accounting for collisions
   * with previously-resolved names. The contract:
   *
   * - Empty / whitespace filenames map to `'untitled'`.
   * - Append the extension verbatim.
   * - When the base name (case-insensitively) already exists in
   *   `usedNames`, append ` (N)` before the extension — `logo.svg`,
   *   `logo (1).svg`, `logo (2).svg`, etc. Mirrors how Finder /
   *   Windows Explorer disambiguate "duplicate file" downloads.
   *
   * **Why a method (not pure util)**: keeps the resolver next to the
   * registry so future additions (sanitizing path separators,
   * stripping illegal chars per-OS) live in one place.
   */
  resolveUniqueName(
    rawFilename: string,
    extension: string,
    usedNames: ReadonlySet<string>,
  ): string {
    const base = sanitizeBase(rawFilename);
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    const first = `${base}${ext}`;
    if (!hasName(usedNames, first)) return first;
    for (let n = 1; n < 1000; n++) {
      const candidate = `${base} (${n})${ext}`;
      if (!hasName(usedNames, candidate)) return candidate;
    }
    // Defensive fallback — 1000 collisions on the same name is
    // unrealistic but let's never spin forever.
    return `${base}-${Date.now()}${ext}`;
  }
}

/** Random-ish slot id — collision odds are negligible for v1 use. */
function generateSlotId(): string {
  return `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeBase(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (trimmed.length === 0) return 'untitled';
  return trimmed;
}

/** Case-insensitive lookup so `Logo.svg` and `logo.svg` count as a collision. */
function hasName(used: ReadonlySet<string>, name: string): boolean {
  const lower = name.toLowerCase();
  for (const u of used) {
    if (u.toLowerCase() === lower) return true;
  }
  return false;
}
