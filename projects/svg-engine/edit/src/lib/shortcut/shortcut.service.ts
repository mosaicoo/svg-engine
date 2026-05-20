import { DOCUMENT } from '@angular/common';
import { inject, Injectable, OnDestroy } from '@angular/core';
import { isEditableTarget } from '../pointer/is-editable-target';
import { ShortcutRegistry } from './shortcut-registry.service';

/**
 * Global keyboard listener that routes events to {@link ShortcutRegistry}.
 * Hooks `keydown` on `document` and, for each event:
 *
 * 1. Skips events from editable targets (input/textarea/contenteditable)
 *    so typing inside the inspector or any text field doesn't trigger
 *    `Delete` or letter shortcuts.
 * 2. Asks the registry for the first matching active shortcut.
 * 3. Calls the shortcut's `run(event)` if found.
 *
 * **`preventDefault` is the shortcut's responsibility**: the service
 * doesn't auto-prevent so non-destructive shortcuts (e.g., "focus
 * search") can let the event continue. Most shortcuts will want to
 * `event.preventDefault()` inside `run()`.
 *
 * **Bootstrap**: the service is `providedIn: 'root'`. Calling
 * `ShortcutService.start()` once in app bootstrap activates the
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

  private listening = false;
  private readonly handler = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) return;
    const match = this.registry.tryMatch(event);
    if (match === null) return;
    match.run(event);
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
