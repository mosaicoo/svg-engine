/**
 * **Canonical slot id constants for {@link MenuContributionRegistry}.**
 *
 * These are the slot strings that `<svge-menu-bar>`, `<svge-toolbar>`
 * and `<svge-context-menu>` (in `svg-engine/ui`) render by default.
 * Plugins use them to target the standard slots without memorizing the
 * string conventions:
 *
 * ```ts
 * import { MENU_SLOT, TOOLBAR_SLOT, CONTEXT_MENU_SLOT } from 'svg-engine/edit';
 *
 * reg.register({ slot: MENU_SLOT.EDIT, ... });
 * reg.register({ slot: TOOLBAR_SLOT.MAIN, ... });
 * reg.register({ slot: CONTEXT_MENU_SLOT.NODE, ... });
 * ```
 *
 * **Why these live in `edit` (and not `ui`)**: the slot vocabulary is
 * owned by `MenuContributionRegistry` (which lives in `edit`). Plugins
 * register from `edit` scope and shouldn't need to import from `ui` to
 * know the canonical slot names. UI components re-export these for
 * backward compatibility with consumers that already wrote
 * `import { MENU_SLOT } from 'svg-engine/ui'` — both imports work and
 * resolve to the same object.
 *
 * **Custom slots are allowed**: `slot` in {@link MenuContribution} is
 * just a string. Plugins may invent new slots; UIs that don't render
 * those slots silently ignore the contributions (graceful).
 */

/** Top-level menu bar slots — populated by `<svge-menu-bar>`. */
export const MENU_SLOT = {
  FILE: 'menu.file',
  EDIT: 'menu.edit',
  VIEW: 'menu.view',
  /**
   * **D-052**: "Insert" menu — drops new shapes / text / images at the
   * center of the visible viewport in a single undoable step. Market
   * convention placement (between View and Object) matches Figma,
   * Sketch, PowerPoint, Google Drawings, and most other 2D editors.
   *
   * Distinct from `menu.object` (which operates on EXISTING nodes:
   * reorder, group, ungroup) — `menu.insert` *creates* new nodes.
   *
   * Distinct from the toolbar (`toolbar.main` + `TOOLBAR_SLOT.MAIN`)
   * shape tools (R / E / Y) which ARM a drawing tool waiting for a
   * drag; Insert items perform an IMMEDIATE drop, mirroring the
   * Office/Google "Insert > Rectangle" UX.
   */
  INSERT: 'menu.insert',
  OBJECT: 'menu.object',
  /**
   * **D-085** — "Path" menu: path-level operations (Convert to Path,
   * Outline Stroke, Join, Split, Simplify, Offset, Smooth, Clean Up).
   * Distinct from `menu.object` (whole-node ops) — these reshape the
   * geometry of the selected path(s). Mirrors Inkscape's "Path" menu.
   */
  PATH: 'menu.path',
  /**
   * **D-085** — "Tools" menu: app-level utilities (Command Palette, Plugins
   * submenu). Distinct from the canvas `toolbar.main` drawing tools — these
   * are editor/IDE-style commands, not shape tools. (D-132 removed the
   * Quick Search / Plugin Console / Developer Tools / Developer Mode roadmap
   * placeholders.)
   */
  TOOLS: 'menu.tools',
  /**
   * **D-085** — "Window" menu: workspace + panel visibility (Workspace
   * submenu, Panels submenu). Panel show/hide + workspace settings live
   * here, matching Illustrator/Affinity's "Window" menu convention.
   */
  WINDOW: 'menu.window',
  HELP: 'menu.help',
} as const;

/** Type union of the standard menu bar slots. */
export type MenuBarSlot = (typeof MENU_SLOT)[keyof typeof MENU_SLOT];

/** Toolbar slots — populated by `<svge-toolbar>`. */
export const TOOLBAR_SLOT = {
  /** Main horizontal toolbar at the top of the editor. */
  MAIN: 'toolbar.main',
} as const;

/** Type union of the standard toolbar slots. */
export type ToolbarSlot = (typeof TOOLBAR_SLOT)[keyof typeof TOOLBAR_SLOT];

/** Context menu slots — populated by `<svge-context-menu>` on right-click. */
export const CONTEXT_MENU_SLOT = {
  /** Right-click on empty canvas / pasteboard. */
  CANVAS: 'context.canvas',
  /** Right-click on a shape / group node. */
  NODE: 'context.node',
  /** Right-click on a row in the Layers panel. */
  LAYER: 'context.layer',
  /** Right-click on an anchor point (Path Editor). */
  ANCHOR: 'context.anchor',
  /** Right-click on a guide (ruler-dragged or programmatic). */
  GUIDE: 'context.guide',
} as const;

/** Type union of the standard context menu slots. */
export type ContextMenuSlot = (typeof CONTEXT_MENU_SLOT)[keyof typeof CONTEXT_MENU_SLOT];
