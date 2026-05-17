import type { Signal } from '@angular/core';

/**
 * Where a menu contribution wants to appear. The string is opaque to
 * the registry — UIs filter by slot id to lay out items in the right
 * place. Common conventions:
 *
 * - `'toolbar.main'` — top toolbar (file/edit/view groups)
 * - `'toolbar.shape'` — shape-creation row
 * - `'toolbar.transform'` — alignment / distribution
 * - `'sidebar.left'` / `'sidebar.right'` — vertical sidebars
 * - `'context.canvas'` / `'context.layer'` — right-click menus
 *
 * Plugins are free to invent new slots. The contract is just: the UI
 * decides which slots it renders; contributions for unknown slots are
 * silently ignored (graceful — installing a plugin with a context-menu
 * contribution shouldn't crash a UI that doesn't show context menus).
 */
export type MenuSlot = string;

/**
 * A single entry contributed to a {@link MenuSlot}. The shape is
 * deliberately data-only — no Angular components, no callbacks that
 * close over DOM. UIs construct the actual `<button>` / `<menuitem>`
 * from these fields, which keeps the contribution serializable and
 * inspectable (essential for future persistence / hot-reload).
 *
 * **Fields**:
 * - `id`: stable, unique within the slot. UIs use this as `track` key
 *   and for keyboard shortcut binding. Reverse-DNS recommended.
 * - `slot`: which menu / toolbar to insert into. See {@link MenuSlot}.
 * - `label`: human-readable text shown to the user.
 * - `icon`: optional Material icon name (e.g. `'content_copy'`).
 *   When omitted, UIs fall back to text-only.
 * - `tooltip`: optional `title=` text. Defaults to `label` when absent.
 * - `shortcut`: optional human-readable hint (`'Ctrl+G'`). Display
 *   only — actual binding happens via the future `ShortcutRegistry`
 *   (Bloco 4g). Kept as a hint here so the toolbar can show it now.
 * - `order`: sort key within the slot (lower = first). Defaults to 100.
 *   Spacing of 100 leaves room for inserts (`50`, `150`, etc.).
 * - `disabled`: reactive signal — UI checks each render. When `null`,
 *   the item is never disabled. Computed signals are encouraged so
 *   contributions reflect selection / document state automatically.
 * - `visible`: reactive signal — `false` removes the item entirely.
 *   When `null`, always visible.
 * - `run`: callback fired when the user activates the item.
 *
 * **Why signals instead of plain booleans / functions**: signal-driven
 * UI updates are the standard pattern across the codebase (Tool,
 * Palette, Layer registries all reactive). Asking contributors to
 * return signals lets the toolbar render with `OnPush` and skip
 * checking every plugin every cycle.
 */
export interface MenuContribution {
  readonly id: string;
  readonly slot: MenuSlot;
  readonly label: string;
  readonly icon?: string;
  readonly tooltip?: string;
  readonly shortcut?: string;
  readonly order?: number;
  readonly disabled?: Signal<boolean> | null;
  readonly visible?: Signal<boolean> | null;
  /** Activated by the UI (click / keyboard). MUST NOT throw. */
  run(): void;
}
