import { Injectable, signal } from '@angular/core';
import type { EditorPlugin, PluginSource } from './plugin';

/**
 * One known plugin in the {@link PluginCatalog}: the plugin object plus
 * where it came from. Note this is the *universe* of plugins — a
 * catalog entry exists whether or not the plugin is currently installed
 * (a disabled plugin is in the catalog but not in `PluginRegistry`).
 */
export interface CatalogEntry {
  readonly plugin: EditorPlugin;
  readonly source: PluginSource;
}

/**
 * **Catalog of every plugin the app knows about** — installed or not.
 *
 * Why a separate service from {@link PluginRegistry}: the registry only
 * knows what's *installed right now*. To show a disabled plugin in the
 * manager (and to re-install it when re-enabled) we need to remember it
 * even while it's not installed. The catalog is that memory.
 *
 * Populated at build time by {@link provideSvgEnginePlugin} (every
 * provided plugin self-registers as `'internal'`), and at runtime by the
 * `PluginManagerService` when an `'external'` plugin is installed.
 *
 * `providedIn: 'root'` — the catalog is app-wide, matching where plugins
 * are provided (`app.config`).
 */
@Injectable({ providedIn: 'root' })
export class PluginCatalog {
  private readonly _entries = signal<readonly CatalogEntry[]>([]);

  /** Reactive list of every known plugin (registration order). */
  readonly entries = this._entries.asReadonly();

  /** Whether a plugin id is known to the catalog. */
  has(id: string): boolean {
    return this._entries().some((e) => e.plugin.id === id);
  }

  /** Look up a catalog entry by id, or `null` when unknown. */
  get(id: string): CatalogEntry | null {
    return this._entries().find((e) => e.plugin.id === id) ?? null;
  }

  /**
   * Add a plugin to the catalog. **Idempotent / first-wins**: if the id
   * is already known the call is ignored (keeps the original entry and
   * its source), so a double-bootstrap or an `'external'` plugin trying
   * to shadow an `'internal'` id can't silently override. Returns `true`
   * when the entry was added, `false` when it already existed.
   */
  register(plugin: EditorPlugin, source: PluginSource): boolean {
    if (this.has(plugin.id)) return false;
    this._entries.set([...this._entries(), { plugin, source }]);
    return true;
  }

  /**
   * Remove a plugin from the catalog (used when an external plugin is
   * uninstalled). No-op for unknown ids. Returns `true` when removed.
   */
  unregister(id: string): boolean {
    if (!this.has(id)) return false;
    this._entries.set(this._entries().filter((e) => e.plugin.id !== id));
    return true;
  }
}
