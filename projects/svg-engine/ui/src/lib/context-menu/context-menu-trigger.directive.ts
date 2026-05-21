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
   * **D-040 (2026-05-20)** — Optional **slot resolver function** for
   * hit-test-aware context menus. When supplied, takes precedence over
   * the static `[svgeContextMenu]` slot input. Called with the original
   * `MouseEvent` on every right-click; return value is the slot id to
   * open (or empty string to suppress the menu for that event).
   *
   * **Use case** (the motivating one for D-040): a shell wants
   * `context.canvas` when right-clicking empty canvas but `context.node`
   * when right-clicking a selected shape. The resolver inspects
   * `event.target` (or runs `resolveSelectableNodeId`) and picks the
   * right slot — without forcing two `[svgeContextMenu]` bindings or
   * teaching the trigger directive about hit-testing (which lives in
   * `svg-engine/edit`).
   *
   * **Why a function input over a service**: the resolver depends on
   * application-level state (current selection, isolation, etc.) that
   * the consumer knows. Threading those into a generic service would
   * couple the directive to specific services. The function input keeps
   * the directive policy-free.
   *
   * **Default** `null` → fall back to the static `[svgeContextMenu]`.
   */
  readonly svgeContextMenuResolver = input<((event: MouseEvent) => string) | null>(null);

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
    // Resolver wins over static slot when provided.
    const resolver = this.svgeContextMenuResolver();
    const slot = resolver !== null ? resolver(event) : this.svgeContextMenu();
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
