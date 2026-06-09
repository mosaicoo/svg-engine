import { Injectable, signal } from '@angular/core';
import { parseHex } from './color-conversions';

/** localStorage key — namespaced to avoid collision with consumer apps. */
const STORAGE_KEY = 'svge.color-history';
/** Max number of colours kept in the recent strip. Matches Figma (16). */
const MAX_HISTORY = 16;

/**
 * Tracks the most-recently-used colours in a small ring buffer, persisted
 * across sessions in `localStorage`. Surfaced as a signal so the picker
 * can render a "Recent" strip and update it live when the user picks a
 * new colour.
 *
 * **Design notes**:
 *
 * - **De-dup with MRU semantics**: re-picking a colour that's already in
 *   the list moves it to the front instead of duplicating. Same trick
 *   Photoshop/Affinity use.
 * - **Single source of truth**: only `add` mutates state. The signal
 *   provides reactive reads; consumers never write directly.
 * - **Hex normalisation**: every entry is normalised to `#rrggbb`
 *   lowercase before storage. `#ABC`, `#aabbcc`, `#AABBCC` all coalesce
 *   to the same entry.
 * - **Safe in SSR / locked-down environments**: `localStorage` access is
 *   guarded by `typeof` checks; quota exceptions are swallowed (the
 *   history is a UX nicety, not critical state).
 *
 * @internal **Wiring interno** do color-picker — não faz parte do contrato
 * público estável do svg-engine. Pode mudar sem major bump; consumidores
 * externos não devem depender diretamente.
 */
@Injectable({ providedIn: 'root' })
export class ColorHistoryService {
  private readonly _history = signal<readonly string[]>(this.loadFromStorage());

  /** Reactive read of the recent-colour list. Most-recent first. */
  readonly history = this._history.asReadonly();

  /**
   * Add a colour to the front of the history. If it's already present
   * (case-insensitive, expanded form), it gets moved to the front
   * instead of duplicated. Invalid hex strings are silently ignored —
   * the picker is the source of valid colours, but defensive guarding
   * means programmatic callers don't crash on bad input.
   */
  add(hex: string): void {
    const normalised = this.normalise(hex);
    if (normalised === null) return;
    const current = this._history();
    const filtered = current.filter((c) => c !== normalised);
    const next = [normalised, ...filtered].slice(0, MAX_HISTORY);
    this._history.set(next);
    this.saveToStorage(next);
  }

  /** Wipe history. Used by the picker's "Clear recent" affordance. */
  clear(): void {
    this._history.set([]);
    this.saveToStorage([]);
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Validate + normalise a hex string. `#abc` → `#aabbcc`, casing
   * lowercased. Returns `null` for anything that fails parsing — never
   * throws.
   */
  private normalise(hex: string): string | null {
    const rgb = parseHex(hex);
    if (rgb === null) return null;
    const hexChar = (n: number): string => n.toString(16).padStart(2, '0').toLowerCase();
    return `#${hexChar(rgb.r)}${hexChar(rgb.g)}${hexChar(rgb.b)}`;
  }

  private loadFromStorage(): readonly string[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      // Re-normalise on load — if a future version changes the format,
      // legacy entries are silently dropped (we're not breaking the
      // user's app over a missing recent colour).
      return parsed
        .filter((x): x is string => typeof x === 'string')
        .map((s) => this.normalise(s))
        .filter((s): s is string => s !== null)
        .slice(0, MAX_HISTORY);
    } catch {
      // Corrupt JSON or storage exception (quota / disabled) — start fresh.
      return [];
    }
  }

  private saveToStorage(value: readonly string[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Quota exceeded / disabled storage — the history is best-effort.
    }
  }
}
