import { DOCUMENT } from '@angular/common';
import { inject, Injectable, Injector, OnDestroy } from '@angular/core';
import { isEditableTarget } from '../pointer/is-editable-target';
import type { ShortcutContext } from './shortcut';
import { ShortcutRegistry } from './shortcut-registry.service';

/**
 * Global keyboard listener that routes events to {@link ShortcutRegistry}.
 * Hooks `keydown` on `document` and, for each event:
 *
 * 1. Skips events from editable targets (input/textarea/contenteditable)
 *    so typing inside the inspector or any text field doesn't trigger
 *    `Delete` or letter shortcuts.
 * 2. Asks the registry for the first matching active shortcut.
 * 3. Calls the shortcut's `run(event, ctx)` if found — `ctx` carries the
 *    `Injector` of THIS `ShortcutService` instance so handlers can
 *    resolve services from the active editor scope (D-042).
 *
 * **`preventDefault` is the shortcut's responsibility**: the service
 * doesn't auto-prevent so non-destructive shortcuts (e.g., "focus
 * search") can let the event continue. Most shortcuts will want to
 * `event.preventDefault()` inside `run()`.
 *
 * **Bootstrap**: the service is `providedIn: 'root'` by default
 * (single-editor convenience). For multi-editor apps, include it via
 * {@link provideSvgEngineEditorScope} so each editor gets its own
 * listener + injector. Calling `ShortcutService.start()` activates the
 * listener; `stop()` removes it (auto on destroy too).
 *
 * Why not always-on by construction: an opt-in `start()` lets app
 * shells decide when to enable global shortcuts (e.g., disable while
 * a modal eats keystrokes, re-enable after).
 */
@Injectable({ providedIn: 'root' })
export class ShortcutService implements OnDestroy {
  private readonly registry = inject(ShortcutRegistry);
  private readonly document = inject(DOCUMENT);
  /**
   * The injector of this service instance — root in single-editor apps,
   * the route/component injector in multi-editor apps using
   * `provideSvgEngineEditorScope()`. Passed to each handler so it can
   * resolve services from the active editor scope (D-042).
   */
  private readonly injector = inject(Injector);

  private listening = false;
  private readonly handler = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) return;
    const match = this.registry.tryMatch(event);
    if (match === null) return;
    const ctx: ShortcutContext = { injector: this.injector };
    match.run(event, ctx);
  };

  /** Start dispatching keyboard events to the registry. Idempotent. */
  start(): void {
    if (this.listening) return;
    this.document.addEventListener('keydown', this.handler);
    this.listening = true;
  }

  /** Stop dispatching. Idempotent. */
  stop(): void {
    if (!this.listening) return;
    this.document.removeEventListener('keydown', this.handler);
    this.listening = false;
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
