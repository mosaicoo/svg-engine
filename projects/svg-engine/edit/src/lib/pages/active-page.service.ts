import { computed, effect, inject, Injectable, signal } from '@angular/core';
import {
  type BoundingBox,
  EditorStateService,
  getPageViewBox,
  type NodeId,
  type SvgNode,
} from 'svg-engine/core';
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
export class ActivePageService {
  private readonly pages = inject(PagesService);
  private readonly state = inject(EditorStateService);

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

  constructor() {
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
}
