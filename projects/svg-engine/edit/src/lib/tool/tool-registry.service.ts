import { Injectable, signal } from '@angular/core';
import type { Disposable } from '../plugin/plugin';
import type { Tool } from './tool';

/**
 * Registry of installed {@link Tool}s. The first capability registry
 * built **on top of** the plugin scaffolding (Bloco 5a) — every entry
 * comes from a plugin's `install(ctx)` calling `ctx.track(reg.register(tool))`.
 *
 * **Reactive `tools` signal**: toolbars / pickers can subscribe and
 * automatically reflect installs/uninstalls.
 *
 * **`register` returns `Disposable`**: standard plugin pattern — caller
 * tracks via `ctx.track()` so uninstall removes the tool automatically.
 *
 * **Duplicate id is a hard error** at register time (configuration
 * mistake — no recovery makes sense).
 */
@Injectable({ providedIn: 'root' })
export class ToolRegistry {
  private readonly _tools = signal<readonly Tool[]>([]);

  /** Reactive snapshot of all registered tools (insertion order). */
  readonly tools = this._tools.asReadonly();

  /**
   * Register a tool. Returns a `Disposable` to remove the tool later
   * (typically tracked by the plugin via `ctx.track()` for automatic
   * cleanup on plugin uninstall).
   *
   * Throws if `tool.id` is empty or already registered.
   */
  register(tool: Tool): Disposable {
    if (typeof tool.id !== 'string' || tool.id.length === 0) {
      throw new Error('ToolRegistry.register: tool.id must be a non-empty string');
    }
    if (this._tools().some((t) => t.id === tool.id)) {
      throw new Error(`ToolRegistry.register: tool "${tool.id}" is already registered`);
    }
    this._tools.set([...this._tools(), tool]);
    return {
      dispose: () => {
        this._tools.set(this._tools().filter((t) => t.id !== tool.id));
      },
    };
  }

  /** Look up a tool by id, or `null` if not registered. */
  get(id: string): Tool | null {
    return this._tools().find((t) => t.id === id) ?? null;
  }

  /** Look up a tool by its single-key shortcut, or `null` if no match. */
  getByShortcut(key: string): Tool | null {
    return this._tools().find((t) => t.shortcut === key) ?? null;
  }
}
