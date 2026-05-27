// D-079 — Pages / Artboards services (per-editor scope).
// Pairs with core/model/page.ts (helpers) and core/commands/page.commands.ts.
export { ActivePageService } from './active-page.service';
export { PagesService } from './pages.service';
// PAGES-REFACTOR Fase 2 — visual selection overlay for the active
// page (draw.io style corner brackets + floating label + move handle).
export { SvgePageSelectionOverlay } from './page-selection-overlay.component';
// PAGES-REFACTOR Fase 7 — per-editor storage key for the active-page
// id (so reloads restore the same page the user was on).
export { ACTIVE_PAGE_STORAGE_KEY } from './active-page.config';
// PAGES-REFACTOR follow-up #4 — transient drag-preview store shared
// between SvgePageSelectionOverlay (gesture owner) and PageOverlay
// (paper-rect renderer) so the page itself follows the cursor during
// a resize/move drag (not just the brackets).
export { PageDragService } from './page-drag.service';
