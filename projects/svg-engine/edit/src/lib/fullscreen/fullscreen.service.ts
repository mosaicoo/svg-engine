import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject, Injectable, signal } from '@angular/core';

/**
 * **`FullscreenService`** (D-129) — thin, reactive wrapper around the native
 * **Fullscreen API** (`Element.requestFullscreen` / `Document.exitFullscreen`).
 *
 * Backs the `View ▸ Display ▸ Full Screen` menu item. **Distinct from
 * Presentation Mode** (D-128): Presentation hides the *editor* chrome inside the
 * page; Full Screen tells the *browser* to give the editor element the whole
 * monitor (hiding the browser/OS chrome) while keeping the editor UI intact.
 * The two are orthogonal and compose.
 *
 * **Target element**: a shell (`<svge-shell-pro>` / `<svge-editor>`) registers
 * its host via {@link setTarget} so fullscreen wraps *that editor* — important
 * for embedded consumers where the editor is one widget on a larger page. When
 * no target is registered it falls back to `document.documentElement` (whole
 * page), matching a standalone playground.
 *
 * **User-activation**: `requestFullscreen()` only works inside a user gesture.
 * The menu click → `MenuContribution.run()` → {@link toggle} chain is fully
 * synchronous (`<svge-menu-bar>` calls `run()` directly in its `(click)`
 * handler), so the gesture is preserved.
 *
 * **Exit**: the browser exits fullscreen on **Esc** (and **F11**) natively — no
 * custom key handling needed. {@link active} stays in sync via the
 * `fullscreenchange` event, so a browser-driven exit updates our state too.
 *
 * **Headless boundary (D-017)**: pure DOM APIs, zero `@angular/material` — safe
 * to live in `svg-engine/edit`. `providedIn: 'root'` because browser fullscreen
 * is inherently a single global state (`document.fullscreenElement`); there is
 * only ever one fullscreen element, so a per-editor instance would be
 * meaningless.
 */
@Injectable({ providedIn: 'root' })
export class FullscreenService {
  private readonly document = inject(DOCUMENT);

  /** The element to request fullscreen on; shells register their host. */
  private target: HTMLElement | null = null;

  private readonly _active = signal(this.readActive());
  /**
   * Whether an element is currently in fullscreen. Synced to the browser via
   * the `fullscreenchange` event, so it reflects exits triggered by Esc/F11 or
   * by other code — not just our own {@link toggle} calls.
   */
  readonly active = this._active.asReadonly();

  constructor() {
    const onChange = (): void => this._active.set(this.readActive());
    this.document.addEventListener('fullscreenchange', onChange);
    inject(DestroyRef).onDestroy(() =>
      this.document.removeEventListener('fullscreenchange', onChange),
    );
  }

  /**
   * Whether the Fullscreen API is usable in this environment. `false` under
   * SSR / jsdom (no `requestFullscreen`) and inside an iframe that lacks the
   * `allowfullscreen` permission (`document.fullscreenEnabled === false`).
   */
  isSupported(): boolean {
    const root = this.document.documentElement as HTMLElement & {
      requestFullscreen?: unknown;
    };
    return (
      typeof root.requestFullscreen === 'function' && this.document.fullscreenEnabled !== false
    );
  }

  /** Register the element to take fullscreen (typically a shell host). */
  setTarget(el: HTMLElement | null): void {
    this.target = el;
  }

  /**
   * Clear the registered target **only if** it matches `el`. Safe to call from
   * a shell's `ngOnDestroy` without clobbering a target another live shell may
   * have registered in the meantime.
   */
  clearTarget(el: HTMLElement): void {
    if (this.target === el) this.target = null;
  }

  /** Enter fullscreen on the registered target (or `documentElement`). */
  enter(): void {
    if (!this.isSupported() || this.readActive()) return;
    const el = this.target ?? (this.document.documentElement as HTMLElement);
    // Promise may reject if the gesture lapsed or permission is denied —
    // swallow it (the menu item simply does nothing rather than throwing).
    void el.requestFullscreen?.().catch(() => undefined);
  }

  /** Exit fullscreen if currently active. */
  exit(): void {
    if (!this.readActive()) return;
    void this.document.exitFullscreen?.().catch(() => undefined);
  }

  /** Toggle fullscreen on/off. */
  toggle(): void {
    if (this.readActive()) this.exit();
    else this.enter();
  }

  private readActive(): boolean {
    return this.document.fullscreenElement != null;
  }
}
