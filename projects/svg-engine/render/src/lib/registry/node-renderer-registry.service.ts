import { Injectable, type Type } from '@angular/core';

/**
 * Renderer component class. The dispatcher (`<svge-node>`) mounts these
 * via `*ngComponentOutlet` and binds `inputs: { node: <SvgNode> }`. The
 * concrete shape of the component is not enforced statically (Angular's
 * `input.required<T>()` returns an `InputSignal<T>`, which does not match
 * a plain `T` field) — the runtime contract is:
 *
 *  - The component declares `node` as an Angular `input()` (preferred)
 *    or a plain settable property accepting an `SvgNode`.
 *  - The component is `standalone: true`.
 */
export type SvgNodeRendererComponent = Type<unknown>;

/**
 * Registry of **custom** renderer components, keyed by `SvgNode['type']`.
 *
 * Built-in node types (`rect`, `ellipse`, `line`, `polygon`, `polyline`,
 * `path`, `text`, `image`, `group`) are dispatched by the dispatcher's own
 * `@switch` and do **not** go through this registry. The registry is the
 * extension point for plugins (D-020) that introduce new `type`
 * discriminators (e.g., `'star'`, `'chart-bar'`).
 *
 * Plugin install code:
 * ```ts
 * inject(NodeRendererRegistry).register('star', SvgeStarRenderer);
 * ```
 *
 * The dispatcher resolves the registry's component for unknown types,
 * mounts it via `*ngComponentOutlet` and binds `[node]` automatically.
 */
@Injectable({ providedIn: 'root' })
export class NodeRendererRegistry {
  private readonly entries = new Map<string, SvgNodeRendererComponent>();

  /**
   * Register a renderer component for a custom node type. Throws when the
   * `type` is already registered (use {@link unregister} first to override).
   */
  register(type: string, component: SvgNodeRendererComponent): void {
    if (this.entries.has(type)) {
      throw new Error(
        `NodeRendererRegistry: type "${type}" is already registered. ` +
          `Call unregister("${type}") first if you intend to override.`,
      );
    }
    this.entries.set(type, component);
  }

  /** Remove a previously registered renderer. No-op when absent. */
  unregister(type: string): void {
    this.entries.delete(type);
  }

  /** Resolve the renderer for the given type, or `null` if unregistered. */
  resolve(type: string): SvgNodeRendererComponent | null {
    return this.entries.get(type) ?? null;
  }

  /** All currently registered type discriminators (for inspection/tooling). */
  registeredTypes(): readonly string[] {
    return Array.from(this.entries.keys());
  }
}
