import { Directive, inject, input } from '@angular/core';
import { SvgeContextMenuService } from './context-menu.service';

/**
 * `[svgeContextMenu="slot-id"]` — Sprint Pro-Editor Phase 2.
 *
 * Drop-in directive that wires the native `contextmenu` (right-click)
 * event on the host element to {@link SvgeContextMenuService}, opening
 * a context menu for the bound slot at the cursor position.
 *
 * **Why a directive over manual wireup**: the right-click → preventDefault
 * → service.open dance is identical everywhere a context menu is wanted,
 * and the directive keeps the call site declarative:
 *
 * ```html
 * <svg svgeContextMenu="context.canvas"></svg>
 * <li *ngFor="let layer of layers" [svgeContextMenu]="'context.layer'"
 *     [contextMenuData]="layer">…</li>
 * ```
 *
 * **`event.preventDefault()`** is called automatically — without it,
 * the browser's default context menu would compete with ours. Consumers
 * needing the browser menu in specific subtrees can either:
 *
 * - Not apply this directive to that subtree, OR
 * - Listen to `contextmenu` on the child with their own handler that
 *   calls `stopPropagation()` BEFORE this directive sees the event.
 *
 * **Headless boundary**: this directive lives in `svg-engine/ui`
 * (depends on `SvgeContextMenuService` which uses CDK Overlay). For
 * headless puro consumers who don't import `/ui`, they can write a
 * 3-line equivalent: listen to `contextmenu`, call their own overlay
 * solution, render `<svge-context-menu>` (or any UI of their choice)
 * reading the same `MenuContributionRegistry` slot.
 */
@Directive({
  selector: '[svgeContextMenu]',
  standalone: true,
  host: {
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class SvgeContextMenuTrigger {
  private readonly service = inject(SvgeContextMenuService);

  /**
   * Slot id to open. Pass an empty string to **disable** the trigger
   * without removing the directive from the template (useful when the
   * directive is bound from a parent that toggles via a flag).
   *
   * Use the `CONTEXT_MENU_SLOT.*` constants for the canonical slots
   * (`context.canvas` / `context.node` / `context.layer` / `context.anchor`
   * / `context.guide`) — exported from `svg-engine/ui`.
   */
  readonly svgeContextMenu = input<string>('');

  /**
   * When `true`, do NOT call `event.preventDefault()` — instead let the
   * browser's native context menu appear ALONGSIDE the SVGEngine menu.
   * Default: `false` (suppress browser menu, our menu wins).
   *
   * Use case: developer wants to keep browser inspect / save-image
   * options accessible during development. Production typically wants
   * the default behavior.
   */
  readonly allowNative = input<boolean>(false);

  protected onContextMenu(event: MouseEvent): void {
    const slot = this.svgeContextMenu();
    // Empty slot means "disabled" — pass through to native context menu
    // (or whatever sibling listener handles it).
    if (slot.length === 0) return;
    if (!this.allowNative()) {
      event.preventDefault();
    }
    this.service.open(slot, {
      x: event.clientX,
      y: event.clientY,
    });
  }
}
