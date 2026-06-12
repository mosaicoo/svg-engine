import { Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { inject, Injectable, type Injector, type OnDestroy } from '@angular/core';
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
 * - Closes on outside pointer-down (`outsidePointerEvents`) — LEFT or RIGHT.
 *   **No backdrop** (deliberate): a backdrop would swallow a second
 *   right-click (leaking the browser's native menu and not repositioning);
 *   without it the re-right-click reaches the canvas trigger, which
 *   reopens the menu at the new spot. See `open()` for the full rationale.
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
   * @param parentInjector Optional **D-043 fix**: when supplied, the
   *   rendered `<svge-context-menu>` is attached with this injector as
   *   its parent. The component's `inject(Injector)` then returns the
   *   active editor scope (D-042 route-scoped) instead of the overlay
   *   root injector. Without this, menu contribution handlers that
   *   call `injector.get(SelectionService)` would hit the root
   *   service and operate on the wrong document. Callers pass the
   *   trigger directive's own injector (which is the host
   *   component's scope).
   */
  open(
    slot: string,
    position: { readonly x: number; readonly y: number },
    parentInjector?: Injector,
  ): void {
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
      // **No backdrop (bug fix).** A transparent backdrop covers the whole
      // viewport on top of the canvas. Its `backdropClick()` only fires on a
      // LEFT click, so a SECOND RIGHT-click while the menu is open landed on
      // the backdrop instead — which (a) has no `[svgeContextMenu]` trigger,
      // so `preventDefault()` never ran and the BROWSER's native context menu
      // leaked through, and (b) did not dismiss our menu. Without a backdrop
      // the second right-click passes straight to the canvas, whose
      // `[svgeContextMenu]` calls `preventDefault()` (no native menu) and
      // reopens the menu at the new position (with the slot re-resolved).
      // Outside dismissal is handled by `outsidePointerEvents()` below.
      hasBackdrop: false,
      panelClass: 'svge-context-menu-panel',
    });

    // D-043 fix: passing `parentInjector` as the 3rd arg makes the
    // rendered SvgeContextMenu's `inject(Injector)` resolve to the
    // caller's scope (typically the editor route's injector), so
    // contribution handlers reach the active editor's services.
    // Fallback to undefined preserves the original behavior for
    // single-editor callers that don't pass anything.
    const portal = new ComponentPortal(SvgeContextMenu, null, parentInjector);
    const componentRef = overlayRef.attach(portal);
    componentRef.setInput('slot', slot);

    // Wire up the dismiss outputs / dismissal sources.
    const dismissSub = componentRef.instance.dismiss.subscribe(() => this.close());
    // Outside dismissal without a backdrop: closes on any pointer-down
    // outside the menu panel (LEFT or RIGHT). On a re-right-click this fires
    // on the pointerdown; the canvas trigger's `contextmenu` then reopens at
    // the new position — net effect: the menu repositions, no native menu.
    const outsideSub = overlayRef.outsidePointerEvents().subscribe(() => this.close());
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
      outsideSub.unsubscribe();
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
