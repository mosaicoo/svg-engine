import { Injectable, signal } from '@angular/core';
import { type BoundingBox, type NodeId } from 'svg-engine/core';

/**
 * **PAGES-REFACTOR follow-up #4** — transient drag-preview store for
 * the Page tool. Bridges the gesture owner
 * ({@link SvgePageSelectionOverlay}) and the visual page renderer
 * ({@link PageOverlay}) so both stay in sync during a resize/move
 * drag.
 *
 * **Why a dedicated service** (vs. mixing into `ActivePageService`):
 * drag preview is transient interaction state; `ActivePageService`
 * owns the *persistent* "which page is active" identity. Keeping
 * them separate means tests/headless consumers don't depend on this
 * surface at all (the service is optional in both consumer components).
 *
 * **The flow**:
 * 1. User pointerdowns on a bracket / page interior →
 *    PageSelectionOverlay's local drag state goes non-null →
 *    `setPreview(pageId, viewBox)` pushes the current "what the user
 *    would commit if they released NOW" rect into this service.
 * 2. Every pointermove updates that preview.
 * 3. PageOverlay's `pageBounds()` reads `previewFor(activePage.id)`
 *    FIRST; when non-null, the paper rect renders at the previewed
 *    geometry — so the user sees the page itself move/resize in
 *    real time, not just the brackets.
 * 4. On pointerup OR ESC, `clearPreview()` is called; PageOverlay
 *    falls back to reading the stored `pageViewBox` (which the
 *    pointerup dispatch has just updated, for the commit case; or
 *    is unchanged, for the ESC-cancel case → page snaps back).
 *
 * **Why not dispatch the command on every pointermove instead**:
 * that would flood the undo stack with intermediate states (one entry
 * per pixel) AND re-trigger every renderer/effect/binding that listens
 * to the document on every move — orders of magnitude more expensive
 * than a single signal update routed to two overlays.
 *
 * **Scope**: `providedIn: 'root'` matches the existing
 * {@link ActivePageService} sibling. If multi-editor isolation
 * becomes a requirement, both services migrate together to
 * `provideSvgEngineEditorScope`.
 */
@Injectable({ providedIn: 'root' })
export class PageDragService {
  private readonly _preview = signal<{
    readonly pageId: NodeId;
    readonly viewBox: BoundingBox;
  } | null>(null);

  /**
   * Reactive read of the current preview state. Consumers usually
   * call {@link previewFor} (gated by page id) instead — direct read
   * is exposed for spec / debug scenarios.
   */
  readonly preview = this._preview.asReadonly();

  /**
   * Returns the previewed viewBox **only if** a drag is active AND
   * it targets the given `pageId`. Null otherwise — the page should
   * read its stored viewBox in that case.
   *
   * Defensive gating on the page id matters because there could be
   * a stale preview from a previous drag if the user switched active
   * page mid-gesture (unusual but possible via Pages panel click).
   */
  previewFor(pageId: NodeId): BoundingBox | null {
    const p = this._preview();
    if (p === null || p.pageId !== pageId) return null;
    return p.viewBox;
  }

  /**
   * Push the current previewed geometry into the store. Called from
   * an effect inside SvgePageSelectionOverlay that watches its local
   * drag state.
   */
  setPreview(pageId: NodeId, viewBox: BoundingBox): void {
    this._preview.set({ pageId, viewBox });
  }

  /**
   * Drop the preview — either because the drag committed (pointerup
   * dispatched the command, stored viewBox is now the truth) or
   * because the user cancelled with ESC (stored viewBox is unchanged,
   * page snaps back to its pre-drag origin/size).
   */
  clearPreview(): void {
    this._preview.set(null);
  }
}
