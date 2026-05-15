import { computed, inject, Injectable, Injector, signal } from '@angular/core';
import type { Tool, ToolContext, ToolPointerEvent } from './tool';
import { ToolRegistry } from './tool-registry.service';

/**
 * Active-tool state and event router.
 *
 * **Two responsibilities**:
 * 1. **Active tool** (`activeId` signal): which tool is currently in
 *    charge of canvas interaction. Switching fires `onDeactivate` on
 *    the outgoing tool and `onActivate` on the incoming one.
 * 2. **Event routing**: consumers (the playground / a custom canvas
 *    component) call `routePointerDown/Move/Up/Cancel` and `routeKeyDown`
 *    with the relevant data. The host forwards to the active tool's
 *    matching hook (or no-ops when there's no active tool / no hook).
 *
 * **Why the consumer routes (not a global listener)**: the host can't
 * know which DOM element is "the canvas" — that's the consumer's
 * responsibility. The consumer also knows how to convert screen→doc
 * coords (it owns the `<svg>` ref), so it builds the
 * {@link ToolPointerEvent} and hands it over.
 *
 * **Resilience to uninstall**: if the active tool's plugin uninstalls
 * mid-session, `activeTool` becomes `null` (the registry no longer
 * resolves the id) and all routing becomes a no-op until another tool
 * is activated. No crash, no zombie state.
 */
@Injectable({ providedIn: 'root' })
export class ToolHostService {
  private readonly registry = inject(ToolRegistry);
  private readonly injector = inject(Injector);
  private readonly _activeId = signal<string | null>(null);

  /** Id of the currently active tool, or `null`. */
  readonly activeId = this._activeId.asReadonly();

  /**
   * The currently active {@link Tool}, or `null` when nothing is active
   * — including the case where the active id refers to a tool that was
   * uninstalled (reactive: re-evaluates whenever the registry changes).
   */
  readonly activeTool = computed<Tool | null>(() => {
    const id = this._activeId();
    if (id === null) return null;
    return this.registry.get(id);
  });

  /**
   * Switch to the tool with `id`. Fires `onDeactivate` on the previous
   * tool (if any) and `onActivate` on the new one. No-op when `id` is
   * already active.
   *
   * Throws if `id` is not registered.
   */
  activate(id: string): void {
    const next = this.registry.get(id);
    if (next === null) {
      throw new Error(`ToolHostService.activate: no tool registered with id "${id}"`);
    }
    if (this._activeId() === id) return;

    const ctx = this.makeContext();
    const current = this.activeTool();
    if (current?.onDeactivate) current.onDeactivate(ctx);
    this._activeId.set(id);
    if (next.onActivate) next.onActivate(ctx);
  }

  /**
   * Deactivate the current tool without activating a new one. Fires
   * `onDeactivate` if defined. No-op when nothing is active.
   */
  deactivate(): void {
    const current = this.activeTool();
    if (current === null) return;
    if (current.onDeactivate) current.onDeactivate(this.makeContext());
    this._activeId.set(null);
  }

  routePointerDown(event: ToolPointerEvent): void {
    const tool = this.activeTool();
    if (tool?.onPointerDown) tool.onPointerDown(event, this.makeContext());
  }

  routePointerMove(event: ToolPointerEvent): void {
    const tool = this.activeTool();
    if (tool?.onPointerMove) tool.onPointerMove(event, this.makeContext());
  }

  routePointerUp(event: ToolPointerEvent): void {
    const tool = this.activeTool();
    if (tool?.onPointerUp) tool.onPointerUp(event, this.makeContext());
  }

  routePointerCancel(event: ToolPointerEvent): void {
    const tool = this.activeTool();
    if (tool?.onPointerCancel) tool.onPointerCancel(event, this.makeContext());
  }

  routeKeyDown(event: KeyboardEvent): void {
    const tool = this.activeTool();
    if (tool?.onKeyDown) tool.onKeyDown(event, this.makeContext());
  }

  private makeContext(): ToolContext {
    return { injector: this.injector };
  }
}
