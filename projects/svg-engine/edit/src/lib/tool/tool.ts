import type { Injector } from '@angular/core';
import type { Point } from 'svg-engine/core';

/**
 * Pointer event handed to {@link Tool} pointer handlers. Wraps the raw
 * DOM event with derived data the host already had to compute (doc-space
 * point, modifier flags) so each tool doesn't repeat the boilerplate.
 *
 * `raw` is exposed for tools that need browser-specific data (pointer
 * pressure, tilt, pointerType for stylus-vs-mouse branching).
 */
export interface ToolPointerEvent {
  readonly raw: PointerEvent;
  /** Pointer position in document coordinates (already CTM-inverted). */
  readonly docPoint: Point;
  /** Pointer position in CSS pixel coordinates (`event.clientX/Y`). */
  readonly screenX: number;
  readonly screenY: number;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

/**
 * Context handed to every {@link Tool} hook. Provides DI access — tools
 * resolve services they need (`SelectionService`, `CommandBus`,
 * `ViewportService`, etc.) via `ctx.injector.get(...)`.
 *
 * **Why injector instead of named shortcuts**: a tool can need any
 * editor service (now or in future fases). A façade with named fields
 * would force editing this interface every time a new service ships.
 * `injector.get()` keeps the surface stable and lets tools depend on
 * exactly what they use (better tree-shake, clearer intent).
 */
export interface ToolContext {
  readonly injector: Injector;
}

/**
 * Editor tool — a single named interaction mode (Select, Pencil, Shape,
 * Eyedropper, Hand, ...). Tools are registered by plugins via
 * {@link ToolRegistry.register} and activated through
 * {@link ToolHostService.activate}.
 *
 * **Lifecycle**:
 * - `onActivate(ctx)`: called when this tool becomes active (transition
 *   from another tool or initial selection). Use it to set up cursors,
 *   show panels, prime state.
 * - `onDeactivate(ctx)`: called when another tool is selected. Use it
 *   to commit/discard in-progress work and clean up listeners.
 *
 * **Pointer handlers** (all optional): called by the host when a
 * pointer event hits the canvas while this tool is active. Tools own
 * their own per-gesture state (just put fields on a class instance —
 * the registry holds a single instance until the plugin is uninstalled).
 *
 * **`onKeyDown`**: receives keydowns while this tool is active. Tool
 * can intercept to handle shortcuts (Esc to cancel a draft, etc.).
 *
 * **Identity**:
 * - `id`: unique across all installed tools. Reverse-DNS recommended.
 * - `label`: shown in toolbars / pickers.
 * - `icon` / `cursor`: optional UI hints.
 * - `shortcut`: optional single-key shortcut to activate from anywhere
 *   (host wires this; tools shouldn't try to listen globally themselves).
 */
export interface Tool {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly cursor?: string;
  readonly shortcut?: string;

  onActivate?(ctx: ToolContext): void;
  onDeactivate?(ctx: ToolContext): void;

  onPointerDown?(event: ToolPointerEvent, ctx: ToolContext): void;
  onPointerMove?(event: ToolPointerEvent, ctx: ToolContext): void;
  onPointerUp?(event: ToolPointerEvent, ctx: ToolContext): void;
  /** Optional: pointer cancel (browser revoked the gesture, e.g., touch interrupted). */
  onPointerCancel?(event: ToolPointerEvent, ctx: ToolContext): void;

  onKeyDown?(event: KeyboardEvent, ctx: ToolContext): void;
}
