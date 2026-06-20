import { Injectable, signal } from '@angular/core';

/**
 * **D-143** — named size presets for the selection-box handles (the 8
 * resize squares + the rotation knob). Values are **CSS pixels**; the
 * overlay divides by the current zoom so the on-screen size stays
 * constant regardless of pan/zoom (see
 * `selection-overlay.component.ts`'s `handleSize` computed).
 *
 * The three buckets mirror the size affordance found in professional
 * editors (Illustrator's *Selection & Anchor Display* offers three anchor
 * sizes; Inkscape/Affinity expose a comparable handle-size preference).
 * `medium` is the historical default (the former `HANDLE_PX = 8`).
 */
export type HandleSizePreset = 'small' | 'medium' | 'large';

/** Canonical pixel size for each {@link HandleSizePreset}. */
export const HANDLE_SIZE_PRESETS: Readonly<Record<HandleSizePreset, number>> = {
  small: 6,
  medium: 8,
  large: 11,
};

/** Smallest accepted handle size (CSS px). Below this handles get hard to grab. */
export const HANDLE_SIZE_MIN = 4;
/** Largest accepted handle size (CSS px). Above this handles start to occlude small shapes. */
export const HANDLE_SIZE_MAX = 24;
/** Default handle size (CSS px) — the historical `HANDLE_PX = 8` (== `medium`). */
export const HANDLE_SIZE_DEFAULT = HANDLE_SIZE_PRESETS.medium;

/** localStorage slot for the persisted handle size. */
const STORAGE_KEY = 'svge:selection:handle-size';

/**
 * **D-143** — persistent, app-wide preference for the **size** of the
 * selection-box handles. **Root-scoped** (not per-editor): like the theme
 * or the SVG-import placement mode, it's a user-interface preference shared
 * across every editor instance and remembered across reloads via
 * `localStorage`.
 *
 * The {@link SelectionOverlay} reads {@link handleSizePx} to size both the
 * 8 resize squares and the rotation knob; the Workspace Settings dialog
 * writes it (presets + a free slider).
 *
 * **Why only size (no colour) in v1**: handle SIZE is the affordance pro
 * tools actually expose. Handle COLOUR is rare and usually derives from
 * the UI theme / selection colour, so it's intentionally left to a future
 * iteration (and to host theming via CSS custom properties).
 */
@Injectable({ providedIn: 'root' })
export class SelectionAppearanceService {
  private readonly _handleSizePx = signal<number>(readPersisted());

  /** Current handle size in CSS pixels (reactive). */
  readonly handleSizePx = this._handleSizePx.asReadonly();

  /**
   * Set + persist the handle size. The value is clamped to
   * `[HANDLE_SIZE_MIN, HANDLE_SIZE_MAX]` and rounded to an integer so
   * the slider and free input can't push the overlay into a degenerate
   * (sub-pixel / huge) state.
   */
  setHandleSize(px: number): void {
    const clamped = clampHandleSize(px);
    if (clamped === this._handleSizePx()) return;
    this._handleSizePx.set(clamped);
    writePersisted(clamped);
  }

  /** Convenience: set the size from one of the named presets. */
  setPreset(preset: HandleSizePreset): void {
    this.setHandleSize(HANDLE_SIZE_PRESETS[preset]);
  }

  /** Restore the default size ({@link HANDLE_SIZE_DEFAULT}). */
  reset(): void {
    this.setHandleSize(HANDLE_SIZE_DEFAULT);
  }
}

/**
 * Clamp + round an arbitrary number to a valid handle size. Non-finite
 * input (NaN / Infinity) falls back to {@link HANDLE_SIZE_DEFAULT} rather
 * than throwing — the UI controls can briefly emit `''`/`NaN` mid-edit.
 */
export function clampHandleSize(px: number): number {
  if (!Number.isFinite(px)) return HANDLE_SIZE_DEFAULT;
  return Math.min(HANDLE_SIZE_MAX, Math.max(HANDLE_SIZE_MIN, Math.round(px)));
}

/** Restore the persisted size, defaulting to {@link HANDLE_SIZE_DEFAULT}. */
function readPersisted(): number {
  if (typeof localStorage === 'undefined') return HANDLE_SIZE_DEFAULT;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return HANDLE_SIZE_DEFAULT;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? clampHandleSize(n) : HANDLE_SIZE_DEFAULT;
  } catch {
    return HANDLE_SIZE_DEFAULT;
  }
}

/** Persist the size. Fails silently (quota / private mode / SSR). */
function writePersisted(px: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, String(px));
  } catch {
    // Storage unavailable — the in-memory signal still drives this session.
  }
}
