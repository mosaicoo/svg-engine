import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  type BoundingBox,
  EditorStateService,
  getPageBackgroundNode,
  getPageViewBox,
  type InsertParentResolver,
  type NodeId,
  type SvgDocument,
  type SvgNode,
  toNodeId,
} from 'svg-engine/core';
import { SelectionService } from '../selection/selection.service';
import { ACTIVE_PAGE_STORAGE_KEY } from './active-page.config';
import { PagesService } from './pages.service';

/**
 * **D-079** — `ActivePageService`: which page is currently being
 * viewed/edited. Pairs with {@link PagesService} (the derived list
 * of all pages) and feeds the renderer's "single page" mode.
 *
 * **Why per-editor scope**: the active page selection is editor-
 * specific. Provided via {@link provideSvgEngineEditorScope} (D-042).
 *
 * **Auto-select behavior**: when the document HAS pages, this service
 * auto-selects the first page if no explicit selection exists. When
 * the document has NO pages (legacy single-root document), the
 * service stays in `activePageId === null` mode — the renderer falls
 * back to its full-document render (back-compat with everything
 * pre-D-079).
 *
 * **Auto-recovery**: if the currently-active page gets deleted (the
 * user removed it via the Pages Panel), the effect re-derives and
 * picks the first remaining page — or goes back to `null` when zero
 * pages remain. The user is never stuck pointing at a gone page.
 */
@Injectable({ providedIn: 'root' })
export class ActivePageService implements InsertParentResolver {
  private readonly pages = inject(PagesService);
  private readonly state = inject(EditorStateService);
  // PAGES-REFACTOR Fase 7 — selection-clear-on-switch + persistence
  // dependencies. `selection` is optional so legacy unit tests that
  // instantiate ActivePageService without the full editor scope keep
  // working; in production every D-042 scope provides it.
  private readonly selection = inject(SelectionService, { optional: true });
  private readonly storageKey = inject(ACTIVE_PAGE_STORAGE_KEY);
  private readonly document = inject(DOCUMENT);

  /** Writable internal signal — public reads go through {@link activePageId}. */
  private readonly _activePageId = signal<NodeId | null>(null);

  /** Currently-active page id, or `null` when no pages OR no selection. */
  readonly activePageId = this._activePageId.asReadonly();

  /**
   * The active page's GroupNode (lookup through PagesService), or
   * `null`. Re-derives when either `activePageId` or the underlying
   * pages list changes.
   */
  readonly activePage = computed(() => {
    const id = this._activePageId();
    if (id === null) return null;
    return this.pages.byId(id);
  });

  /**
   * The active page's viewBox (from page metadata). Returns `null`
   * when no active page — consumers should fall back to the
   * document's own `viewBox` in that case (the renderer does this
   * automatically when `[activePageId]` is unset).
   */
  readonly activePageViewBox = computed<BoundingBox | null>(() => {
    const p = this.activePage();
    if (p === null) return null;
    return getPageViewBox(p);
  });

  /**
   * Snapshot of the previous active page id — used by the selection-
   * clear effect to detect "the active page actually CHANGED" vs
   * "first emission" (initial null → first-page is recovery, not a
   * user-driven switch and shouldn't clear selection).
   */
  private lastActiveSeen: NodeId | null = null;

  constructor() {
    // Try to restore the previously-active page id from localStorage
    // BEFORE the auto-recovery effect runs. The effect honors an
    // already-set value if it's still valid; if the persisted id
    // doesn't match any current page, the effect falls back to "pick
    // first" automatically. This is a synchronous read so the very
    // first effect tick sees the restored id (no flash of "first page
    // momentarily active").
    const persisted = this.readPersistedId();
    if (persisted !== null) {
      this._activePageId.set(persisted);
    }
    this.lastActiveSeen = this._activePageId();

    // Auto-select / recovery effect: keeps `activePageId` in sync
    // with what actually exists in the document.
    effect(() => {
      const list = this.pages.pages();
      const current = this._activePageId();
      if (list.length === 0) {
        // No pages → clear selection so renderer falls back to full-doc mode.
        if (current !== null) this._activePageId.set(null);
        return;
      }
      // Pages exist → ensure selection is valid; otherwise pick first.
      const stillExists = current !== null && list.some((p) => p.id === current);
      if (!stillExists) {
        this._activePageId.set(list[0]!.id);
      }
    });

    // PAGES-REFACTOR Fase 7 — selection clear + persistence on
    // active-page changes.
    effect(() => {
      const next = this._activePageId();
      const prev = this.lastActiveSeen;
      this.lastActiveSeen = next;
      // (a) Persist the new id so the next page load can restore it.
      this.persistId(next);
      // (b) Clear selection ONLY when the user genuinely switched pages
      // (prev was non-null and the id changed). Skip on initial
      // hydration (prev === null) so a freshly-loaded editor doesn't
      // wipe a selection the consumer set programmatically.
      if (prev !== null && next !== prev && this.selection !== null) {
        // Selected node from the prior page is no longer visible in
        // the renderer's "single page" mode — its bbox would draw on
        // top of "nothing", which is confusing. Illustrator/Affinity
        // both clear selection on artboard switch.
        this.selection.clear();
      }
    });
  }

  /**
   * Set the active page. Pass `null` to clear (falls back to first
   * page on next effect tick when pages exist). Pass an unknown id
   * and the auto-recovery effect will re-pick the first page on
   * next tick.
   */
  setActive(pageId: NodeId | null): void {
    this._activePageId.set(pageId);
  }

  /**
   * **PAGES-C** — convenience signal for renderers. Returns the
   * active page's GroupNode when one is selected, otherwise falls
   * back to the document's root. Lets shells bind their
   * `<svge-renderer [tree]="..."/>` to a single signal that handles
   * both "pages mode" and "legacy single-root" docs uniformly.
   */
  readonly treeForRendering = computed<SvgNode>(() => {
    const page = this.activePage();
    if (page !== null) return page as unknown as SvgNode;
    return this.state.document().root;
  });

  /**
   * **PAGES-C** — companion to {@link treeForRendering}. Returns the
   * active page's `pageViewBox` when present, otherwise the document's
   * own viewBox. Bind to `<svge-renderer [viewBox]="..."/>` so the
   * canvas frames the active page (or the whole document in legacy
   * mode) correctly.
   */
  readonly viewBoxForRendering = computed<BoundingBox>(() => {
    const pvb = this.activePageViewBox();
    if (pvb !== null) return pvb;
    return this.state.document().viewBox;
  });

  /**
   * **PAGES-FIX-2** — "where should new shapes be inserted?" The
   * drawing tools (Pencil, Pen, Rectangle, Ellipse, Polygon, Text,
   * Stamp, asset-manager drop) call this when they need a parent id
   * for {@link InsertNodeCommand}.
   *
   * - When a page is active → returns the page's id (shapes become
   *   children of the page → visible in the renderer's page-filter
   *   mode → user sees them in the canvas).
   * - When no page is active → returns the document root id (legacy
   *   pre-D-079 behavior; renderer shows everything).
   *
   * **Why a single source of truth**: without this, tools that
   * hard-code `state.document().root.id` would insert shapes as
   * SIBLINGS of pages, and the renderer's page-filter would hide them.
   * Centralizing the lookup here means every drawing tool stays in
   * sync with the active-page selection.
   */
  readonly effectiveDrawTargetId = computed<NodeId>(() => {
    const page = this.activePage();
    if (page !== null) return page.id;
    return this.state.document().root.id;
  });

  /**
   * **PAGES-FIX-4** — derive an "active-page-only" document suitable
   * for export / SVG source preview / single-page screenshot pipelines.
   *
   * Each page is conceptually a standalone artboard; users expect
   * "Export SVG" or the View Source dialog to show **only** what's
   * inside the page they're currently editing — not all pages
   * concatenated as `<g>`s inside a single SVG (which is what the
   * raw `state.document()` represents on disk for round-trip).
   *
   * **Returned shape** (when a page is active):
   * - `viewBox` = the page's stored viewBox (so the SVG frames the
   *   artboard, not the whole multi-page document).
   * - `root.children` = the page's children (the actual content;
   *   the page wrapper itself is collapsed — it'd just be noise in
   *   the exported file).
   * - `defs` / `exportPreferences` preserved verbatim so gradients,
   *   patterns, filters, and the D-072 title preference still apply.
   *
   * When no page is active (legacy doc) this returns the input doc
   * unchanged — same back-compat shape as the rest of the service.
   */
  effectiveExportDoc(doc: SvgDocument): SvgDocument {
    const page = this.activePage();
    if (page === null) return doc;
    const pvb = getPageViewBox(page);
    // **Page background as artwork** — the page's solid/image background
    // (PageOptions.background) is part of the art, not editor chrome, so
    // it must serialize into the exported SVG/PNG. Prepend it as the
    // first child (behind all content); `null` for transparent pages
    // (export keeps an alpha background, matching the canvas). The live
    // canvas paints the equivalent rect/image via PageOverlay from the
    // SAME helper, so canvas ↔ export stay in parity.
    const bg = getPageBackgroundNode(page);
    const children = bg !== null ? [bg, ...page.children] : page.children;
    return {
      ...doc,
      viewBox: pvb ?? doc.viewBox,
      root: {
        ...doc.root,
        children,
      },
    };
  }

  /**
   * **PAGES-REFACTOR Fase 1** — implementation of {@link InsertParentResolver}.
   *
   * Called by `CommandBus` (via the `INSERT_PARENT_RESOLVER` token
   * wired in `provideSvgEngineEditorScope`) whenever an
   * `InsertNodeCommand` is dispatched with `parentId: AUTO_PARENT`.
   * Returns the same value as {@link effectiveDrawTargetId} but
   * exposed as a plain method so it satisfies the interface contract
   * (signal `.computed()` would force the resolver shape to be
   * "computed", coupling consumers to Angular signals).
   *
   * **Net effect**: every tool / library / plugin that dispatches
   * an `InsertNodeCommand` with `AUTO_PARENT` automatically lands its
   * new node inside the active page — no `inject(ActivePageService)`
   * or `effectiveDrawTargetId()` call required at the call site.
   * Eliminates the wire-up spread that produced the 3 known
   * regressions (Symbol Sprayer, Auto-trace, NLU).
   */
  resolveAutoParent(): NodeId {
    return this.effectiveDrawTargetId();
  }

  // ── PAGES-REFACTOR Fase 7 — localStorage helpers ─────────────────

  /**
   * Read the persisted active-page id from localStorage. Returns
   * `null` when:
   * - the storage key is disabled (`ACTIVE_PAGE_STORAGE_KEY` bound to null),
   * - localStorage is unavailable (SSR, privacy mode),
   * - nothing was stored yet, or
   * - the stored value is empty / whitespace.
   *
   * The auto-recovery effect handles "id no longer exists in doc" —
   * we don't validate against the current pages list here because
   * the document may still be loading at constructor time.
   */
  private readPersistedId(): NodeId | null {
    const key = this.storageKey;
    if (key === null || key.length === 0) return null;
    const win = this.window();
    if (win === null) return null;
    try {
      const raw = win.localStorage.getItem(key);
      if (raw === null) return null;
      const trimmed = raw.trim();
      if (trimmed.length === 0) return null;
      return toNodeId(trimmed);
    } catch {
      // Some browser privacy modes throw on localStorage access.
      return null;
    }
  }

  /**
   * Persist the current active-page id to localStorage. Pass `null`
   * to clear the slot. Silent no-op when the storage key is disabled
   * or localStorage is unavailable — persistence is best-effort.
   */
  private persistId(id: NodeId | null): void {
    const key = this.storageKey;
    if (key === null || key.length === 0) return;
    const win = this.window();
    if (win === null) return;
    try {
      if (id === null) {
        win.localStorage.removeItem(key);
      } else {
        win.localStorage.setItem(key, id);
      }
    } catch {
      // Best-effort write — swallow quota / privacy-mode errors.
    }
  }

  /** Cross-env window accessor — falls back to null in SSR / tests. */
  private window(): (Window & typeof globalThis) | null {
    const docWindow = this.document.defaultView;
    if (docWindow !== null) return docWindow as Window & typeof globalThis;
    if (typeof window !== 'undefined') return window;
    return null;
  }
}
