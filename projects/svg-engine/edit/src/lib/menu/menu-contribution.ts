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
  /**
   * **Sprint Pro-Editor (2026-05-20 D-038)** — optional parent contribution id.
   * When set, this item is rendered as a **submenu child** of the parent
   * (instead of as a sibling in the same slot). Used by `<svge-menu-bar>`
   * to build cascading menus like "Edit > Transform > Rotate 90°".
   *
   * **Semantics**:
   * - `parentId === undefined` → top-level entry in the slot (default).
   * - `parentId === '<existing-id>'` → nested under that contribution.
   *   The parent must exist in the **same slot** and **same registry**.
   * - The parent's `run()` is ignored when it has children — its row
   *   becomes a submenu trigger. To keep run+children both meaningful,
   *   add a child with the same label/icon and an explicit `run()`.
   *
   * **Multi-level nesting** is supported (Edit > Transform > Move > Right).
   * Loops in the parent chain are detected by `<svge-menu-bar>` at render
   * time and bail out gracefully (the offending leaf is not rendered).
   *
   * **Why parent-pointer instead of nested arrays**: keeps the registry
   * shape flat + signal-friendly. Plugins can contribute leaves without
   * knowing about each other; the tree is reconstructed by `bySlot()`
   * consumers (the menu bar component).
   */
  readonly parentId?: string;
  /**
   * **Sprint Pro-Editor** — used for dividers between groups within a
   * menu. When `true`, this contribution renders as a horizontal rule
   * (no click handler, no icon). `label` is then optional and used as
   * an accessibility label / section heading.
   */
  readonly divider?: boolean;
  /** Activated by the UI (click / keyboard). MUST NOT throw. NOT called for dividers. */
  run(): void;
}
