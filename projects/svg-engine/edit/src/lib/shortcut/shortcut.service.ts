import { DOCUMENT } from '@angular/common';
import { inject, Injectable, OnDestroy } from '@angular/core';
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

/**
 * True when the event target is an editable element where typed
 * characters should NOT trigger global shortcuts. Mirrors the
 * existing helper in the playground; lives here because the
 * `ShortcutService` is the natural owner of this policy.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (target === null) return false;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}
