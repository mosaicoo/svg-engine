import { inject, Injectable, type Type } from '@angular/core';
import { ToolRegistry } from 'svg-engine/edit';

/**
 * **TOOL-OPT-A1** — registry that maps `toolId → optionsComponent`,
 * letting `svg-engine/ui` ship options UIs for built-in tools defined
 * in `svg-engine/edit` **without** violating D-017 (edit/ must not
 * import @angular/material, and so cannot reference UI components).
 *
 * **Why a registry instead of `tool.optionsComponent`**:
 *
 * Tools that ship their own options component (e.g. the playground
 * Stamp demo plugin) keep declaring `optionsComponent` on the Tool
 * interface. But the 15 built-in tools (Select, Pencil, Pen,
 * Rectangle, Ellipse, Polygon, Text, Symbol Sprayer, Width,
 * Gradient, Eyedropper, Knife, Smooth, etc.) live in
 * `svg-engine/edit` and CAN'T reference Material-bound components —
 * the boundary rule says only `svg-engine/ui` may depend on
 * `@angular/material`.
 *
 * The registry inverts the wiring: UI components register themselves
 * for a given `toolId`, and `<svge-tool-options>` consults BOTH
 * sources — registry first (so built-ins win when registered),
 * tool field second (so per-plugin tools still work).
 *
 * **Scope**: provided at root (`@Injectable({ providedIn: 'root' })`)
 * because Tools themselves are a global registry (`ToolRegistry`).
 * There's no per-editor variant — the option component class is
 * universal; per-editor state lives in the services the component
 * injects (D-042 scope still applies to state, just not to the
 * class reference).
 *
 * **Validation**: `register()` warns (without throwing) when the
 * `toolId` doesn't match a registered Tool. This guards against
 * typos in the wiring without breaking host apps when a plugin
 * happens to load before its Tool's registration is announced.
 */
@Injectable({ providedIn: 'root' })
export class ToolOptionsRegistry {
  private readonly tools = inject(ToolRegistry);
  private readonly entries = new Map<string, Type<unknown>>();

  /**
   * Register an Angular component class for `toolId`. Overrides any
   * previous registration (last write wins) — predictable for hot-
   * reload and for tests that swap implementations.
   */
  register(toolId: string, component: Type<unknown>): void {
    if (this.tools.get(toolId) === null) {
      // Soft-warn: the tool may register later (plugin order) and this
      // would still wire correctly when <svge-tool-options> reads it.
      console.warn(
        `ToolOptionsRegistry: registered options for "${toolId}" but no such tool found in ToolRegistry yet`,
      );
    }
    this.entries.set(toolId, component);
  }

  /** Returns the registered component for `toolId`, or `null`. */
  get(toolId: string): Type<unknown> | null {
    return this.entries.get(toolId) ?? null;
  }

  /** Remove a registration. No-op when absent. */
  unregister(toolId: string): void {
    this.entries.delete(toolId);
  }

  /** Snapshot of registered toolIds — useful for diagnostics. */
  ids(): readonly string[] {
    return Array.from(this.entries.keys());
  }
}
