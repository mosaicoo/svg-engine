import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatDivider } from '@angular/material/divider';
import { MatIcon } from '@angular/material/icon';
import { type MenuContribution, MenuContributionRegistry } from 'svg-engine/edit';

/**
 * Context menu **content component** — Sprint Pro-Editor Phase 2.
 * Renders a vertical list of `MenuContribution`s from a given slot,
 * styled like a Material `<mat-menu>` content area but without
 * `MatMenu`'s overlay/trigger machinery (the overlay is handled
 * by `SvgeContextMenuService` so we can open at arbitrary cursor
 * coordinates instead of being anchored to a button).
 *
 * **Slot conventions** (D-038 Phase 2):
 *
 * - `context.canvas` — empty space of the SVG canvas (right-click background)
 * - `context.node` — a selected SVG node (right-click on a shape)
 * - `context.layer` — a row in the layers panel
 * - `context.anchor` — an anchor point in the path editor
 * - `context.guide` — a workspace guide line
 *
 * The set is **convention-only** — plugins can introduce new slots
 * (e.g., `context.text-editor`) and the consumer wires them via
 * `[svgeContextMenu]="'context.text-editor'"`.
 *
 * **Emits `dismiss`** when the user clicks an item or hits Esc; the
 * service listens to close the overlay.
 *
 * **Standalone** — usable outside `SvgeContextMenuService` too if a
 * consumer wants to embed the same UI in another overlay/dialog.
 */
@Component({
  selector: 'svge-context-menu',
  standalone: true,
  imports: [MatIcon, MatDivider],
  host: {
    role: 'menu',
    '[attr.aria-label]': '"Context menu " + slot()',
  },
  template: `
    <div class="panel">
      @for (item of items(); track item.id) {
        @if (item.divider) {
          <mat-divider />
        } @else {
          <button
            type="button"
            role="menuitem"
            class="item"
            [disabled]="isDisabled(item)"
            (click)="runItem(item)"
          >
            <span class="icon">
              @if (item.icon) {
                <mat-icon>{{ item.icon }}</mat-icon>
              }
            </span>
            <span class="label">{{ item.label }}</span>
            @if (item.shortcut) {
              <span class="shortcut">{{ item.shortcut }}</span>
            }
          </button>
        }
      }
      @if (items().length === 0) {
        <div class="empty">No actions available</div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      pointer-events: auto;
    }
    .panel {
      min-width: 200px;
      max-width: 320px;
      padding: 4px 0;
      background: var(--mat-sys-surface-container, #fff);
      color: var(--mat-sys-on-surface, inherit);
      border: 1px solid var(--mat-sys-outline-variant, rgba(0, 0, 0, 0.12));
      border-radius: 6px;
      box-shadow:
        0 3px 12px rgba(0, 0, 0, 0.15),
        0 1px 3px rgba(0, 0, 0, 0.1);
      font-size: 13px;
    }
    .item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 6px 12px;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      text-align: left;
    }
    .item:hover:not(:disabled),
    .item:focus-visible {
      background: var(--mat-sys-surface-container-high, rgba(0, 0, 0, 0.05));
      outline: none;
    }
    .item:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .icon {
      display: inline-flex;
      width: 18px;
      justify-content: center;
      opacity: 0.75;
    }
    .icon mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .label {
      flex: 1 1 auto;
    }
    .shortcut {
      opacity: 0.55;
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      margin-left: 1.5rem;
    }
    .empty {
      padding: 8px 12px;
      opacity: 0.55;
      font-style: italic;
    }
    mat-divider {
      margin: 4px 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgeContextMenu {
  private readonly registry = inject(MenuContributionRegistry);

  /** Slot to read contributions from (`'context.canvas'`, etc.). */
  readonly slot = input<string>('');

  /** Fired when the user activates an item or dismisses (Esc / outside click handled by service). */
  readonly dismiss = output<void>();

  /**
   * Effective items for the slot. Re-evaluates when the slot input or
   * the registry contents change (signal-driven via `bySlot`). Submenu
   * `parentId` is intentionally **ignored** here — context menus are
   * flat by convention (right-click → quick actions, no cascading).
   * Plugins that want submenu items in a context menu register them as
   * top-level entries with prefixed labels (e.g., "Transform → Rotate").
   */
  protected readonly items = computed(() => {
    if (this.slot().length === 0) return [];
    return this.registry
      .bySlot(this.slot())()
      .filter((c) => c.parentId === undefined);
  });

  protected isDisabled(item: MenuContribution): boolean {
    return item.disabled == null ? false : item.disabled();
  }

  protected runItem(item: MenuContribution): void {
    if (item.divider) return;
    try {
      item.run();
    } finally {
      // Dismiss regardless of run() outcome so a broken contribution
      // doesn't leave a stuck menu on screen.
      this.dismiss.emit();
    }
  }
}

/** Canonical context-menu slot ids — exported so plugins don't memorize strings. */
export const CONTEXT_MENU_SLOT = {
  CANVAS: 'context.canvas',
  NODE: 'context.node',
  LAYER: 'context.layer',
  ANCHOR: 'context.anchor',
  GUIDE: 'context.guide',
} as const;

/** Type union of the canonical slots. */
export type ContextMenuSlot = (typeof CONTEXT_MENU_SLOT)[keyof typeof CONTEXT_MENU_SLOT];
