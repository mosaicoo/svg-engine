import type { Injector } from '@angular/core';
// `Disposable` lives in `/core` now (foundational shape shared by every
// capability registry across all entry points — Tool, Importer,
// Optimizer, Palette, ...). The re-export here keeps existing imports
// `from 'svg-engine/edit'` working without changes (backward-compat).
import { type Disposable } from 'svg-engine/core';
export { type Disposable };

/**
 * Current version of the plugin API surface. Bumped (semver) when
 * {@link EditorPlugin} or {@link PluginContext} change in incompatible
 * ways. Plugins declare the API version they target via
 * {@link EditorPlugin.apiVersion}; {@link PluginRegistry.install}
 * compares major versions and rejects mismatches.
 */
export const PLUGIN_API_VERSION = '1.0.0';

/**
 * Installation context handed to a plugin's {@link EditorPlugin.install}
 * (and {@link EditorPlugin.uninstall}) hook. Provides the plugin's own
 * id (so contributions can be self-tagged), DI access for capability
 * registries, and a `track()` helper for automatic disposable cleanup.
 *
 * **What plugins do**:
 * 1. Pull a registry from DI: `const tools = ctx.injector.get(ToolRegistry)`.
 * 2. Register a contribution: `const d = tools.register(myTool)`.
 * 3. Track it for cleanup: `ctx.track(d)` (or in one call:
 *    `ctx.track(tools.register(myTool))`).
 *
 * **Why DI access (not a curated façade)**: capability registries grow
 * over time (Tool, Optimizer, Importer, Exporter, Inspector, Effect,
 * Palette, Menu, Shortcut, ...). Forcing a façade method per capability
 * would mean editing the core every time a new registry is added.
 * `injector.get(...)` keeps the surface stable; specific safety
 * boundaries (e.g., script sandboxes) are layered ON TOP via custom
 * runtimes that build their own restricted API on the side.
 */
export interface PluginContext {
  /** The id of the plugin currently installing (matches `plugin.id`). */
  readonly pluginId: string;
  /** Standard Angular DI injector — plugins resolve registries / services from here. */
  readonly injector: Injector;
  /**
   * Register a {@link Disposable} for automatic disposal during
   * {@link PluginRegistry.uninstall}. Returns `d` unchanged so calls
   * can be chained: `ctx.track(reg.register(x))`.
   *
   * Disposables are disposed in **reverse insertion order** during
   * uninstall (LIFO) — symmetrical with how DI containers tear down,
   * and what most consumers expect for resource cleanup.
   */
  track<T extends Disposable>(d: T): T;
}

/**
 * Top-level plugin interface. Implement this and pass an instance to
 * {@link provideSvgEnginePlugin} at app bootstrap, **or** to
 * {@link PluginRegistry.install} at runtime for hot-loading scenarios.
 *
 * **`id` recommendation**: reverse-DNS (`com.acme.tools.pencil`) — keeps
 * uniqueness deterministic across a plugin ecosystem.
 *
 * **`apiVersion` semantics**: declares which version of the plugin API
 * surface the plugin was built against. The registry checks the major
 * component against {@link PLUGIN_API_VERSION} and refuses to install
 * mismatches with a clear error. Minor/patch differences are accepted.
 *
 * **`dependencies`**: an array of plugin ids that must be installed
 * first. Missing-dep is a hard install error — each declared dep is
 * checked via `has()` at install time. Circular deps are prevented
 * indirectly (sequential install order means a cycle can never both
 * have its prerequisite installed) rather than detected with an
 * explicit cycle-walk.
 *
 * **Lifecycle**:
 * - `install(ctx)`: register contributions; called exactly once per
 *   `PluginRegistry.install(this)`.
 * - `uninstall(ctx)`: optional; runs BEFORE auto-disposal of tracked
 *   disposables, in case the plugin needs to do work that requires
 *   contributions to still be live.
 */
export interface EditorPlugin {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly apiVersion: string;
  readonly dependencies?: readonly string[];
  install(ctx: PluginContext): void;
  uninstall?(ctx: PluginContext): void;
}

/**
 * Snapshot of an installed plugin returned by {@link PluginRegistry.list}
 * and {@link PluginRegistry.get}. Read-only view — to remove a plugin,
 * call `PluginRegistry.uninstall(id)`.
 */
export interface InstalledPlugin {
  readonly plugin: EditorPlugin;
  readonly installedAt: number;
}
