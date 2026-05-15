import { computed, inject, Injectable, Injector, signal } from '@angular/core';
import {
  type Disposable,
  type EditorPlugin,
  type InstalledPlugin,
  type PluginContext,
  PLUGIN_API_VERSION,
} from './plugin';

interface InstallationRecord {
  readonly plugin: EditorPlugin;
  readonly installedAt: number;
  readonly disposables: Disposable[];
}

/**
 * Central registry for {@link EditorPlugin}s. Owns the install/uninstall
 * lifecycle and tracks every {@link Disposable} contribution made by
 * each plugin so uninstall is deterministic and complete.
 *
 * **Single source of truth**: every plugin in the editor — bootstrap-
 * provided ({@link provideSvgEnginePlugin}) or runtime-installed — is
 * registered here. Capability registries (Tool, Optimizer, Importer, …)
 * do **not** know which plugin contributed what; they just hand out
 * `Disposable`s, which the plugin tracks via `ctx.track()` and the
 * registry collects per-plugin.
 *
 * **Reactive list**: `installed` is a signal — UIs (plugin manager
 * panel, status footer) can subscribe.
 *
 * **Why install errors are exceptions, not Result**: install is a
 * developer/configuration error, not a recoverable runtime path. Bad
 * id, missing dep, version mismatch — these should fail loud at app
 * boot or hot-load attempt. Compare with {@link CommandBus.dispatch}
 * which returns `CommandResult` because user actions can fail
 * recoverably.
 */
@Injectable({ providedIn: 'root' })
export class PluginRegistry {
  private readonly injector = inject(Injector);
  private readonly _installed = signal<readonly InstallationRecord[]>([]);

  /** Reactive snapshot of every installed plugin (insertion order). */
  readonly installed = computed<readonly InstalledPlugin[]>(() =>
    this._installed().map((r) => ({ plugin: r.plugin, installedAt: r.installedAt })),
  );

  /** Quickly check whether a plugin id is installed. */
  has(id: string): boolean {
    return this._installed().some((r) => r.plugin.id === id);
  }

  /** Look up an installed plugin by id, or `null` when missing. */
  get(id: string): InstalledPlugin | null {
    const rec = this._installed().find((r) => r.plugin.id === id);
    return rec === undefined ? null : { plugin: rec.plugin, installedAt: rec.installedAt };
  }

  /** Read-only list of installed plugins (insertion order). */
  list(): readonly InstalledPlugin[] {
    return this.installed();
  }

  /**
   * Install a plugin. Throws on:
   * - empty/duplicate `id`,
   * - major-version mismatch against {@link PLUGIN_API_VERSION},
   * - missing dependency (any id in `plugin.dependencies` not yet installed).
   *
   * After validation, calls `plugin.install(ctx)` and registers the
   * resulting tracked disposables for automatic cleanup on uninstall.
   * Throws (and rolls back) if `install()` itself throws — disposes any
   * disposables tracked before the throw.
   */
  install(plugin: EditorPlugin): InstalledPlugin {
    if (typeof plugin.id !== 'string' || plugin.id.length === 0) {
      throw new Error('PluginRegistry.install: plugin.id must be a non-empty string');
    }
    if (this.has(plugin.id)) {
      throw new Error(`PluginRegistry.install: plugin "${plugin.id}" is already installed`);
    }
    assertCompatibleApiVersion(plugin.apiVersion, plugin.id);
    if (plugin.dependencies) {
      for (const depId of plugin.dependencies) {
        if (!this.has(depId)) {
          throw new Error(
            `PluginRegistry.install: plugin "${plugin.id}" requires "${depId}" which is not installed`,
          );
        }
      }
    }

    const disposables: Disposable[] = [];
    const ctx: PluginContext = {
      pluginId: plugin.id,
      injector: this.injector,
      track: <T extends Disposable>(d: T): T => {
        disposables.push(d);
        return d;
      },
    };

    try {
      plugin.install(ctx);
    } catch (err) {
      // Roll back any disposables tracked before the throw.
      this.disposeAll(disposables);
      throw new Error(
        `PluginRegistry.install: plugin "${plugin.id}" failed during install: ${stringifyError(err)}`,
        { cause: err },
      );
    }

    const record: InstallationRecord = {
      plugin,
      installedAt: Date.now(),
      disposables,
    };
    this._installed.set([...this._installed(), record]);
    return { plugin, installedAt: record.installedAt };
  }

  /**
   * Uninstall by id. Returns `true` on success, `false` when the id was
   * not installed (idempotent — safe to call from cleanup paths without
   * a prior `has` check).
   *
   * Order of operations:
   * 1. Run `plugin.uninstall(ctx)` if defined (errors are caught + logged
   *    but do **not** abort the rest of the cleanup — disposables MUST
   *    run regardless).
   * 2. Dispose every tracked `Disposable` in **reverse insertion order**.
   *    Errors per-disposable are caught + logged so one bad disposable
   *    can't strand the others.
   * 3. Remove the registry entry.
   */
  uninstall(id: string): boolean {
    const list = this._installed();
    const rec = list.find((r) => r.plugin.id === id);
    if (rec === undefined) return false;

    const ctx: PluginContext = {
      pluginId: rec.plugin.id,
      injector: this.injector,
      // During uninstall, additional `track` calls are accepted but their
      // disposables are scheduled for immediate cleanup alongside the rest.
      track: <T extends Disposable>(d: T): T => {
        rec.disposables.push(d);
        return d;
      },
    };
    if (rec.plugin.uninstall) {
      try {
        rec.plugin.uninstall(ctx);
      } catch (err) {
        console.error(
          `PluginRegistry.uninstall: plugin "${id}" uninstall hook threw — continuing with cleanup`,
          err,
        );
      }
    }
    this.disposeAll(rec.disposables);
    this._installed.set(list.filter((r) => r.plugin.id !== id));
    return true;
  }

  private disposeAll(disposables: readonly Disposable[]): void {
    // LIFO: last-registered first. Symmetrical to DI teardown order.
    for (let i = disposables.length - 1; i >= 0; i--) {
      try {
        disposables[i]!.dispose();
      } catch (err) {
        console.error('PluginRegistry: disposable threw during cleanup — continuing', err);
      }
    }
  }
}

function assertCompatibleApiVersion(declared: string, pluginId: string): void {
  const declaredMajor = majorOf(declared);
  const hostMajor = majorOf(PLUGIN_API_VERSION);
  if (declaredMajor === null) {
    throw new Error(
      `PluginRegistry.install: plugin "${pluginId}" has invalid apiVersion "${declared}" (expected semver)`,
    );
  }
  if (declaredMajor !== hostMajor) {
    throw new Error(
      `PluginRegistry.install: plugin "${pluginId}" targets API v${declared} but host is v${PLUGIN_API_VERSION}`,
    );
  }
}

function majorOf(semver: string): number | null {
  const m = /^(\d+)\./.exec(semver);
  if (m === null) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
