import { computed, inject, Injectable } from '@angular/core';
import {
  EditorStateService,
  type GroupNode,
  getPageName,
  getPageViewBox,
  isPage,
  type SvgNode,
} from 'svg-engine/core';
import type { BoundingBox } from 'svg-engine/core';

/**
 * **D-079** — `PagesService`: derived view over the document that
 * surfaces the top-level pages (groups flagged via D-072
 * `svgeKind === 'page'`).
 *
 * **Why a derived service (not stored state)**: pages ARE just
 * top-level GroupNodes with a metadata flag. The single source of
 * truth lives in the document tree itself. This service is a thin
 * reactive view — when the document changes, the computed list
 * re-evaluates lazily.
 *
 * **Why per-editor scope**: pages are document-bound; each editor
 * instance has its own document and so its own list of pages.
 * Provided via {@link provideSvgEngineEditorScope} (D-042).
 *
 * **Why ONLY top-level**: matches the user mental model (pages are
 * tab-level containers, never nested). Nesting is technically
 * possible in the model but the UI doesn't surface it; the `walk`
 * helper here intentionally stops at root.children. This mirrors
 * how the Layers Panel treats Logical Layers (D-072d invariant).
 */
@Injectable({ providedIn: 'root' })
export class PagesService {
  private readonly state = inject(EditorStateService);

  /**
   * All top-level pages in the current document, in z-order
   * (children array order). Pages are GroupNodes flagged with
   * `svgeKind === 'page'`. Re-derives reactively when the document
   * tree changes.
   */
  readonly pages = computed<readonly GroupNode[]>(() => {
    const root = this.state.document().root;
    return root.children.filter((c): c is GroupNode => isPage(c));
  });

  /** Convenience: how many pages exist (0 for legacy single-root docs). */
  readonly count = computed(() => this.pages().length);

  /** `true` when the document has at least one page-flagged group. */
  readonly hasPages = computed(() => this.count() > 0);

  /**
   * Lookup helper — returns the page node with the given id, or
   * `null`. Useful for the Pages Panel to resolve a clicked tab back
   * to its model node.
   */
  byId(pageId: string): GroupNode | null {
    return this.pages().find((p) => p.id === pageId) ?? null;
  }

  /**
   * Convenience accessor — display name for a page id (falls back
   * through page.svgePageName → metadata.name → 'Untitled Page').
   */
  nameOf(pageId: string): string {
    const p = this.byId(pageId);
    if (p === null) return '';
    return getPageName(p);
  }

  /**
   * Convenience accessor — viewBox for a page id (falls back to the
   * document's viewBox when the page is missing its `pageViewBox`
   * metadata — defensive against legacy exports).
   */
  viewBoxOf(pageId: string): BoundingBox | null {
    const p = this.byId(pageId);
    if (p === null) return null;
    const vb = getPageViewBox(p as SvgNode);
    return vb ?? this.state.document().viewBox;
  }
}
