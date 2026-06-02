import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  type Signal,
} from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatDivider } from '@angular/material/divider';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import {
  makeDisabledResolver,
  MenuContributionRegistry,
  runContribution,
  type MenuContribution,
} from 'svg-engine/edit';

/**
 * Top-level menu bar — Sprint Pro-Editor (2026-05-20). Renders a row of
 * Material dropdown menus (File / Edit / View / Object / Help) from
 * `MenuContributionRegistry` using the convention that **each top-level
 * menu owns its own slot**: `menu.file`, `menu.edit`, `menu.view`,
 * `menu.object`, `menu.help`. The menu bar reads the **slots input**
 * (default = the 5 canonical menus) and renders one dropdown per slot.
 *
 * **Submenus** are supported via the new `parentId` field on
 * `MenuContribution` (D-038). A child contribution with `parentId`
 * pointing at an existing contribution in the same slot renders as a
 * cascading submenu instead of a sibling. Multi-level nesting is
 * supported (Edit > Transform > Rotate > 90°).
 *
 * **Dividers** are supported via the `divider: true` field. Renders a
 * Material `<mat-divider>` row with no click handler. Use to visually
 * separate groups within a menu (e.g., file-ops divider history-ops).
 *
 * **Per-menu label resolution**: the label shown on the menu bar button
 * for a slot comes from the input map `[labels]` (default English:
 * "File / Edit / View / Object / Help"). Consumers can override per
 * locale or terminology preference.
 *
 * **Headless boundary (D-017)**: Material-bound; lives in `svg-engine/ui`.
 * Consumers using only `core/render/edit` can build their own menu bar
 * by reading the same `MenuContributionRegistry` slots — the registry
 * lives in `/edit`, this component is just one (Material-flavored) way
 * to render it.
 *
 * **Standalone**: usable inside `<svge-shell-pro>`, inside `<svge-editor>`
 * via `[showMenuBar]`, or completely on its own in a consumer's custom
 * layout.
 */
@Component({
  selector: 'svge-menu-bar',
  standalone: true,
  imports: [MatButton, MatMenu, MatMenuItem, MatMenuTrigger, MatIcon, MatDivider],
  host: {
    role: 'menubar',
    'aria-label': 'Editor menu bar',
    // MENUBAR HOVER-SWITCH — top-level dropdowns run without a backdrop so
    // the bar buttons stay hoverable; this global listener restores the
    // backdrop's outside-click-to-close behavior.
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
  template: `
    @for (menu of menus(); track menu.slot) {
      <button
        mat-button
        type="button"
        [matMenuTriggerFor]="dropdown"
        #trigger="matMenuTrigger"
        (menuOpened)="onMenuOpened(trigger)"
        (menuClosed)="onMenuClosed(trigger)"
        (mouseenter)="onButtonEnter(trigger)"
        [attr.aria-haspopup]="'menu'"
      >
        {{ menu.label }}
      </button>
      <!--
        MENUBAR HOVER-SWITCH — [hasBackdrop]="false" removes the transparent
        CDK backdrop that would otherwise sit over the bar and swallow the
        mouseenter on sibling buttons. Outside-click-to-close is restored by
        the host (document:pointerdown) listener. Submenus are unaffected
        (they never had a backdrop).
      -->
      <mat-menu #dropdown="matMenu" [hasBackdrop]="false">
        @for (item of menu.topLevel(); track item.id) {
          @if (item.divider) {
            <mat-divider />
          } @else if (childrenOf(item.id, menu.slot).length > 0) {
            <button
              mat-menu-item
              type="button"
              [matMenuTriggerFor]="sub"
              [disabled]="isDisabled(item)"
            >
              @if (item.icon) {
                <mat-icon>{{ item.icon }}</mat-icon>
              }
              <span>{{ item.label }}</span>
            </button>
            <mat-menu #sub="matMenu">
              @for (child of childrenOf(item.id, menu.slot); track child.id) {
                @if (child.divider) {
                  <mat-divider />
                } @else {
                  <button
                    mat-menu-item
                    type="button"
                    [disabled]="isDisabled(child)"
                    (click)="runItem(child)"
                  >
                    @if (child.icon) {
                      <mat-icon>{{ child.icon }}</mat-icon>
                    }
                    <span>{{ child.label }}</span>
                    @if (child.shortcut) {
                      <span class="shortcut">{{ child.shortcut }}</span>
                    }
                  </button>
                }
              }
            </mat-menu>
          } @else {
            <button
              mat-menu-item
              type="button"
              [disabled]="isDisabled(item)"
              (click)="runItem(item)"
            >
              @if (item.icon) {
                <mat-icon>{{ item.icon }}</mat-icon>
              }
              <span>{{ item.label }}</span>
              @if (item.shortcut) {
                <span class="shortcut">{{ item.shortcut }}</span>
              }
            </button>
          }
        }
      </mat-menu>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    button[mat-button] {
      min-width: 0;
      padding: 0 10px;
      font-size: 13px;
      line-height: 28px;
      height: 28px;
    }
    .shortcut {
      margin-left: auto;
      padding-left: 1.5rem;
      opacity: 0.55;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeMenuBar {
  private readonly registry = inject(MenuContributionRegistry);

  /**
   * Slots to render as top-level menus, in order. Each slot becomes one
   * dropdown button on the bar. Default = the 6 canonical menus that
   * Figma / Sketch / PowerPoint / Google Drawings all share (Insert
   * sits between View and Object — D-052).
   */
  readonly slots = input<readonly string[]>([
    'menu.file',
    'menu.edit',
    'menu.view',
    'menu.insert',
    'menu.object',
    'menu.help',
  ]);

  /**
   * Per-slot display labels. Override for i18n or terminology customization.
   * Keys are slot ids; missing keys fall back to a humanized version of
   * the slot suffix (`menu.file` → `File`).
   */
  readonly labels = input<Readonly<Record<string, string>>>({
    'menu.file': 'File',
    'menu.edit': 'Edit',
    'menu.view': 'View',
    'menu.insert': 'Insert',
    'menu.object': 'Object',
    'menu.help': 'Help',
  });

  /**
   * Computed render model: one entry per slot, with display label and a
   * lazy `topLevel()` signal returning the contributions WITHOUT a
   * `parentId` (children are resolved per-trigger via `childrenOf`).
   * Lazy avoids walking the full tree when the user never opens a menu.
   */
  protected readonly menus = computed(() =>
    this.slots().map((slot) => ({
      slot,
      label: this.labels()[slot] ?? this.humanize(slot),
      topLevel: (): readonly MenuContribution[] => this.topLevelFor(slot),
    })),
  );

  /** Top-level items (those without a `parentId`) within a slot, ordered. */
  private topLevelFor(slot: string): readonly MenuContribution[] {
    const all = this.registry.bySlot(slot)();
    return all.filter((c) => c.parentId === undefined);
  }

  /**
   * Resolve cascading children of a given parent within a slot.
   * Exposed protected for template binding. Slot is passed explicitly
   * so the lookup stays scoped (avoids accidental cross-slot leakage).
   */
  protected childrenOf(parentId: string, slot: string): readonly MenuContribution[] {
    return this.registry
      .bySlot(slot)()
      .filter((c) => c.parentId === parentId);
  }

  /**
   * D-043 fix: consumer injector — passed to factory-form `disabled`
   * resolvers AND to `run()` so handlers reach the active editor
   * scope (per-route in D-042 multi-editor apps).
   */
  private readonly injector = inject(Injector);
  private readonly disabledFor = makeDisabledResolver(this.injector);

  /** Host element — used to tell "click inside the bar" from "click outside". */
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected isDisabled(item: MenuContribution): boolean {
    return this.disabledFor(item)();
  }

  protected runItem(item: MenuContribution): void {
    runContribution(item, this.injector);
  }

  /**
   * **MENUBAR HOVER-SWITCH** — the currently-open top-level trigger, or
   * `null` when the bar is at rest (no menu open). This is what makes the
   * bar behave like every desktop menu bar (Office / Figma / macOS): the
   * FIRST menu still needs a click to "arm" the bar, but once something is
   * open, simply moving the mouse over a sibling top-level button switches
   * to it — no click required. Tracked via `(menuOpened)`/`(menuClosed)`.
   */
  private activeTrigger: MatMenuTrigger | null = null;

  /** A top-level menu opened — the bar is now in "menu mode". */
  protected onMenuOpened(trigger: MatMenuTrigger): void {
    this.activeTrigger = trigger;
  }

  /**
   * A top-level menu closed. Only clear `activeTrigger` if the one that
   * closed is still the active one: during a hover-switch the newly-opened
   * menu has already registered itself as active before the previous menu's
   * close event lands, so this guard avoids nulling out the fresh menu.
   */
  protected onMenuClosed(trigger: MatMenuTrigger): void {
    if (this.activeTrigger === trigger) {
      this.activeTrigger = null;
    }
  }

  /**
   * Hover over a top-level button. Switch the open menu ONLY when the bar is
   * already armed (some menu open) and the hovered button isn't the one
   * already showing. At rest, hover does nothing — the user clicks once to
   * arm, matching standard menu-bar behavior.
   */
  protected onButtonEnter(trigger: MatMenuTrigger): void {
    const active = this.activeTrigger;
    if (active && active !== trigger) {
      active.closeMenu();
      trigger.openMenu();
    }
  }

  /**
   * Outside-click close. Because the top-level dropdowns run WITHOUT a
   * backdrop (so the bar stays hoverable for the switch above), Material no
   * longer auto-closes them on an outside click — we restore it here. A
   * `pointerdown` inside an open menu panel is left to the item
   * (`closeOnInteraction`); one on the bar itself is left to the trigger's
   * own toggle; anything else closes the open menu.
   */
  protected onDocumentPointerDown(event: Event): void {
    const active = this.activeTrigger;
    if (!active) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.mat-mdc-menu-panel')) return;
    if (this.host.nativeElement.contains(target)) return;
    active.closeMenu();
  }

  /** Fallback humanizer for slots without an explicit label. */
  private humanize(slot: string): string {
    const tail = slot.split('.').at(-1) ?? slot;
    return tail.charAt(0).toUpperCase() + tail.slice(1);
  }
}

// Re-export the canonical slot constants from svg-engine/edit (single
// source of truth — see edit/lib/menu/menu-slots.ts). Kept here as a
// re-export so that consumers using the historical import path
// `from 'svg-engine/ui'` continue to work without code changes.
export { MENU_SLOT, type MenuBarSlot } from 'svg-engine/edit';

// Re-export `Signal` reference to keep TS happy when emitting `.d.ts`
// referencing the existing signal types on `MenuContribution`.
export type { Signal };
