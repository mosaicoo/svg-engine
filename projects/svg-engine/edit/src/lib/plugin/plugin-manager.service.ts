import { computed, inject, Injectable, signal } from '@angular/core';
import type { EditorPlugin, PluginCategory, PluginManifest } from './plugin';
import { PluginCatalog, type CatalogEntry } from './plugin-catalog.service';
import { PluginRegistry } from './plugin-registry.service';
import { PluginStateStore } from './plugin-state-store.service';

/** Outcome of an enable/disable/uninstall action — `error` set on failure. */
export interface PluginActionResult {
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * **The product-facing façade for plugin management (Fase 1).**
 *
 * Sits on top of three lower-level pieces and never duplicates their
 * jobs:
 * - {@link PluginCatalog} — the universe of known plugins (installed or
 *   not), with each plugin's `source` (internal/external).
 * - {@link PluginRegistry} — the install/uninstall engine. **Left
 *   intact** (D-020); the manager only *calls* `install`/`uninstall`,
 *   it does not add enabled/disabled state to the registry.
 * - {@link PluginStateStore} — persists the user's disable preference.
 *
 * The manager flattens all three into a single reactive
 * {@link plugins} signal of {@link PluginManifest}s — exactly what the
 * `<svge-plugin-manager>` UI renders — and exposes the verbs the UI
 * needs: {@link enable}, {@link disable}, {@link uninstall}.
 *
 * **Enable/disable = install/uninstall + remember** (the agreed model):
 * disabling uninstalls and records the preference; enabling re-installs.
 * A disabled plugin therefore never runs `install()` — at boot
 * ({@link provideSvgEnginePlugin} skips it) or at runtime.
 *
 * **Resilient at runtime** (unlike boot, which stays fail-fast per
 * D-020): if a runtime `enable` install throws (e.g., a dependency is
 * disabled), the manager catches it and surfaces the message via the
 * manifest's `error` field instead of crashing.
 */
@Injectable({ providedIn: 'root' })
export class PluginManagerService {
  private readonly registry = inject(PluginRegistry);
  private readonly catalog = inject(PluginCatalog);
  private readonly stateStore = inject(PluginStateStore);

  /** id → last runtime install error (cleared on a successful enable). */
  private readonly _errors = signal<ReadonlyMap<string, string>>(new Map());

  /** Every known plugin as a display-ready manifest (catalog order). */
  readonly plugins = computed<readonly PluginManifest[]>(() => {
    const installed = new Set(this.registry.installed().map((i) => i.plugin.id));
    const disabled = this.stateStore.disabled();
    const errors = this._errors();
    return this.catalog.entries().map((entry) => toManifest(entry, installed, disabled, errors));
  });

  /** Internal (bundled) plugins — can be disabled, never uninstalled. */
  readonly internalPlugins = computed<readonly PluginManifest[]>(() =>
    this.plugins().filter((p) => p.source === 'internal'),
  );

  /** External (third-party) plugins — can be disabled and uninstalled. */
  readonly externalPlugins = computed<readonly PluginManifest[]>(() =>
    this.plugins().filter((p) => p.source === 'external'),
  );

  /** Whether a plugin can be uninstalled (external only). */
  canUninstall(id: string): boolean {
    return this.catalog.get(id)?.source === 'external';
  }

  /**
   * Ids of currently-enabled plugins that declare `id` as a dependency.
   * Disabling/uninstalling `id` while these exist would strand them, so
   * the manager blocks the action and the UI can pre-disable the toggle.
   */
  enabledDependentsOf(id: string): readonly string[] {
    return this.catalog
      .entries()
      .filter(
        (e) =>
          !this.stateStore.isDisabled(e.plugin.id) && (e.plugin.dependencies ?? []).includes(id),
      )
      .map((e) => e.plugin.id);
  }

  /**
   * Enable a plugin: clear the disable preference and install it if it
   * isn't already live. Idempotent (re-enabling an installed plugin is a
   * no-op). On install failure the preference stays enabled and the
   * error surfaces via the manifest.
   */
  enable(id: string): PluginActionResult {
    const entry = this.catalog.get(id);
    if (entry === null) return { ok: false, error: `Unknown plugin "${id}"` };

    this.stateStore.setDisabled(id, false);
    if (this.registry.has(id)) {
      this.clearError(id);
      return { ok: true };
    }
    try {
      this.registry.install(entry.plugin);
      this.clearError(id);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setError(id, message);
      return { ok: false, error: message };
    }
  }

  /**
   * Disable a plugin: uninstall it (if live) and remember the
   * preference. Blocked when enabled plugins depend on it — returns
   * `{ ok: false }` with the blocking ids, leaving everything untouched.
   */
  disable(id: string): PluginActionResult {
    const dependents = this.enabledDependentsOf(id);
    if (dependents.length > 0) {
      return { ok: false, error: `In use by: ${dependents.join(', ')}` };
    }
    this.stateStore.setDisabled(id, true);
    if (this.registry.has(id)) {
      this.registry.uninstall(id);
    }
    this.clearError(id);
    return { ok: true };
  }

  /**
   * Uninstall an **external** plugin entirely: remove it from the
   * registry, the catalog and the state store. Internal plugins can't be
   * uninstalled (their code ships in the bundle) — use {@link disable}.
   * Blocked by enabled dependents, same as {@link disable}.
   */
  uninstall(id: string): PluginActionResult {
    const entry = this.catalog.get(id);
    if (entry === null) return { ok: false, error: `Unknown plugin "${id}"` };
    if (entry.source !== 'external') {
      return { ok: false, error: 'Internal plugins cannot be uninstalled — disable instead.' };
    }
    const dependents = this.enabledDependentsOf(id);
    if (dependents.length > 0) {
      return { ok: false, error: `In use by: ${dependents.join(', ')}` };
    }
    if (this.registry.has(id)) {
      this.registry.uninstall(id);
    }
    this.catalog.unregister(id);
    this.stateStore.forget(id);
    this.clearError(id);
    return { ok: true };
  }

  /**
   * Register and enable an **external** plugin at runtime. The entry
   * point used by a future loader (Fase 2) once the plugin's code is in
   * memory — Phase 1 ships it for completeness. Fails if the id already
   * exists in the catalog (no silent shadowing).
   */
  installExternal(plugin: EditorPlugin): PluginActionResult {
    if (!this.catalog.register(plugin, 'external')) {
      return { ok: false, error: `Plugin "${plugin.id}" already exists` };
    }
    return this.enable(plugin.id);
  }

  // ── Internals ────────────────────────────────────────────────────

  private setError(id: string, message: string): void {
    const next = new Map(this._errors());
    next.set(id, message);
    this._errors.set(next);
  }

  private clearError(id: string): void {
    if (!this._errors().has(id)) return;
    const next = new Map(this._errors());
    next.delete(id);
    this._errors.set(next);
  }
}

function toManifest(
  entry: CatalogEntry,
  installed: ReadonlySet<string>,
  disabled: ReadonlySet<string>,
  errors: ReadonlyMap<string, string>,
): PluginManifest {
  const p = entry.plugin;
  const category: PluginCategory = p.category ?? 'other';
  return {
    id: p.id,
    name: p.name,
    version: p.version,
    apiVersion: p.apiVersion,
    description: p.description,
    author: p.author,
    icon: p.icon,
    category,
    dependencies: p.dependencies ?? [],
    source: entry.source,
    enabled: !disabled.has(p.id),
    installed: installed.has(p.id),
    error: errors.get(p.id) ?? null,
  };
}
