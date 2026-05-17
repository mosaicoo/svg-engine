import { Injectable, signal } from '@angular/core';
import type { Disposable } from '../plugin/plugin';
import { comboMatches, parseCombo, type ParsedCombo, type Shortcut } from './shortcut';

interface InternalEntry {
  readonly shortcut: Shortcut;
  readonly parsed: ParsedCombo;
}

/**
 * Registry of {@link Shortcut}s — categoria 9 parte 2 do D-023.
 * Signal-backed (UIs can render a "keyboard shortcuts" preferences
 * pane reactively), accepts plugin contributions via `register()`,
 * returns `Disposable`.
 *
 * **Conflict policy**: duplicate `id` throws (configuration mistake).
 * **Duplicate `combo` is NOT a registration error** — multiple
 * shortcuts can share a combo as long as their `when` guards keep
 * them mutually exclusive (e.g., `Escape` does different things in
 * the marquee tool vs the rotation tool). The `ShortcutService`
 * dispatches to the FIRST currently-active match (insertion order).
 *
 * **Invalid combos throw at register time** so plugins find typos
 * immediately rather than discovering them when a user presses the
 * key combo months later.
 */
@Injectable({ providedIn: 'root' })
export class ShortcutRegistry {
  private readonly _entries = signal<readonly InternalEntry[]>([]);

  /**
   * Reactive snapshot of all registered shortcuts (insertion order).
   * Returns the public `Shortcut` shape — `ParsedCombo` is internal.
   */
  readonly shortcuts = signal<readonly Shortcut[]>([]);

  /**
   * Register a keyboard shortcut. Returns a `Disposable` to remove
   * the binding later (typically tracked by the plugin via
   * `ctx.track()` for automatic cleanup on plugin uninstall).
   *
   * Throws on empty id, duplicate id, or invalid combo syntax.
   * Duplicate combo is allowed — use `when` to make them mutually
   * exclusive.
   */
  register(shortcut: Shortcut): Disposable {
    if (typeof shortcut.id !== 'string' || shortcut.id.length === 0) {
      throw new Error('ShortcutRegistry.register: shortcut.id must be non-empty');
    }
    if (this._entries().some((e) => e.shortcut.id === shortcut.id)) {
      throw new Error(`ShortcutRegistry.register: shortcut "${shortcut.id}" is already registered`);
    }
    // `parseCombo` throws on syntax errors — propagate so the plugin
    // dev sees the failure immediately.
    const parsed = parseCombo(shortcut.combo);
    const entry: InternalEntry = { shortcut, parsed };
    this._entries.set([...this._entries(), entry]);
    this.shortcuts.set(this._entries().map((e) => e.shortcut));
    return {
      dispose: () => {
        this._entries.set(this._entries().filter((e) => e.shortcut.id !== shortcut.id));
        this.shortcuts.set(this._entries().map((e) => e.shortcut));
      },
    };
  }

  /** Look up a shortcut by id, or `null` if not registered. */
  get(id: string): Shortcut | null {
    return this._entries().find((e) => e.shortcut.id === id)?.shortcut ?? null;
  }

  /**
   * Find the first shortcut whose combo matches `event` AND whose
   * `when` guard is currently `true` (or null/undefined → always
   * active). Returns `null` when no shortcut applies — the caller
   * lets the event propagate normally.
   *
   * **Insertion order tiebreak**: registered earlier wins. Plugins
   * intending to override a default binding should register their
   * shortcut and uninstall the default first (or rely on `when`
   * guards to be more specific).
   */
  tryMatch(event: KeyboardEvent): Shortcut | null {
    for (const entry of this._entries()) {
      if (!comboMatches(entry.parsed, event)) continue;
      const guard = entry.shortcut.when;
      if (guard != null && !guard()) continue;
      return entry.shortcut;
    }
    return null;
  }
}
