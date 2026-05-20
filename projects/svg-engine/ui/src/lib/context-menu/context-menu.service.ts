import { Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { inject, Injectable, type OnDestroy } from '@angular/core';
import { SvgeContextMenu } from './context-menu.component';

/**
 * Service that opens the {@link SvgeContextMenu} component as an
 * overlay anchored at given screen coordinates — Sprint Pro-Editor
 * Phase 2. Used by the `[svgeContextMenu]` directive (the common path)
 * and also exposed for programmatic control (toolbar gesture, menu
 * shortcut that opens a context menu at the selection bbox, etc.).
 *
 * **Position strategy**: `GlobalPositionStrategy` with `position: fixed`
 * at the cursor coordinates. `clientX/clientY` from a `MouseEvent` are
 * viewport-relative, matching the strategy's coordinate space. CDK
 * handles edge cases (menu near screen edge → caller adjusts before
 * calling, OR can switch to `flexibleConnectedTo` later if auto-
 * repositioning becomes a requirement).
 *
 * **Lifecycle**:
 *
 * - Only ONE menu open at a time — `open()` dismisses any previous menu.
 * - Closes on outside click (transparent backdrop captures all clicks).
 * - Closes on `Escape` keydown.
 * - Closes when an item runs (the component emits `dismiss`).
 * - Closes on `ngOnDestroy` (service is `providedIn: 'root'` so this
 *   fires on full app teardown — not per-component).
 *
 * **Headless boundary**: lives in `svg-engine/ui` (depends on CDK
 * Overlay). Consumers in headless puro can build their own overlay
 * strategy using the standalone `<svge-context-menu>` component
 * directly inside any custom overlay infrastructure.
 */
@Injectable({ providedIn: 'root' })
export class SvgeContextMenuService implements OnDestroy {
  private readonly overlay = inject(Overlay);
  private currentRef: OverlayRef | null = null;

  /**
   * Open a context menu at the given viewport coordinates for the
   * given contribution slot. Closes any previously open menu first.
   *
   * @param slot Registry slot id (e.g., `'context.canvas'`).
   * @param position Viewport coordinates — typically `event.clientX/Y`.
   */
  open(slot: string, position: { readonly x: number; readonly y: number }): void {
    this.close();

    // Global positioning is the simplest match for free-floating menus
    // anchored at a cursor — no need for an anchor element.
    const positionStrategy = this.overlay
      .position()
      .global()
      .left(`${position.x}px`)
      .top(`${position.y}px`);

    const overlayRef = this.overlay.create({
      positionStrategy,
      // Close-on-scroll is the conventional behavior — keeping a menu
      // open while the page scrolls leaves it visually disconnected
      // from whatever the user right-clicked on.
      scrollStrategy: this.overlay.scrollStrategies.close(),
      // Transparent backdrop captures outside clicks for dismiss
      // without dimming the canvas (which would feel modal-heavy).
      hasBackdrop: true,
      backdropClass: 'cdk-overlay-transparent-backdrop',
      panelClass: 'svge-context-menu-panel',
    });

    const portal = new ComponentPortal(SvgeContextMenu);
    const componentRef = overlayRef.attach(portal);
    componentRef.setInput('slot', slot);

    // Wire up the dismiss outputs / dismissal sources.
    const dismissSub = componentRef.instance.dismiss.subscribe(() => this.close());
    const backdropSub = overlayRef.backdropClick().subscribe(() => this.close());
    const keydownSub = overlayRef.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        this.close();
      }
    });
    // Cleanup subscriptions when the overlay disposes (avoids leaks
    // when the menu closes via any of the dismissal paths).
    overlayRef.detachments().subscribe(() => {
      dismissSub.unsubscribe();
      backdropSub.unsubscribe();
      keydownSub.unsubscribe();
    });

    this.currentRef = overlayRef;
  }

  /** Programmatically close the current menu (no-op when none open). */
  close(): void {
    if (this.currentRef === null) return;
    this.currentRef.dispose();
    this.currentRef = null;
  }

  /** True when a menu is currently open — useful for menu-trigger guard logic. */
  isOpen(): boolean {
    return this.currentRef !== null;
  }

  ngOnDestroy(): void {
    this.close();
  }
}
