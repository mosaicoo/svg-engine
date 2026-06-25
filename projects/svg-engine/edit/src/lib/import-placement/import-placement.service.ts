import { computed, inject, Injectable, signal } from '@angular/core';
import {
  AUTO_PARENT,
  type BoundingBox,
  CommandBus,
  EditorStateService,
  getNodeBBox,
  InsertNodeCommand,
  type NodeId,
  type Point,
  type SvgDocument,
  type SvgNode,
  type Transform,
} from '@mosaicoo/svg-engine/core';
import {
  collectDefsIds,
  mergeDefsFragments,
  namespaceCollidingDefs,
} from '@mosaicoo/svg-engine/io';
import { ViewportService } from '@mosaicoo/svg-engine/render';

import { ActivePageService } from '../pages/active-page.service';
import { SelectionService } from '../selection/selection.service';

/**
 * **D-101** — monotonic counter for the per-import namespace prefix. Process-
 * global so every placement in a session gets a distinct prefix; this is what
 * makes two imported SVGs that both define `id="grad"` collision-free once
 * merged (only the colliding ids of the *second* import get renamed). Resets on
 * reload — irrelevant, since collision-freedom only needs uniqueness within one
 * document's lifetime.
 */
let importNamespaceSeq = 0;
function nextImportPrefix(): string {
  return `svgi${++importNamespaceSeq}-`;
}

/** A parsed SVG import waiting to be placed on the canvas (D-107). */
export interface PendingImport {
  /** The imported content as one group (its natural coordinates). */
  readonly group: SvgNode;
  /** Natural bounds of the art — the imported file's viewBox. */
  readonly src: BoundingBox;
  /** Opaque `<defs>` fragment to merge into the document on commit. */
  readonly defs?: string;
}

/** Below this drag span (doc units) a gesture counts as a click, not a drag. */
const CLICK_EPSILON = 3;

/**
 * **D-113** — the bounds the import flow fits/centers the art to. Returns the
 * art's actual **content** bounding box (model geometry via {@link getNodeBBox})
 * rather than the file's `viewBox`.
 *
 * Many editor exports (CorelDRAW, Illustrator) park a small graphic in a large
 * artboard — e.g. a ~250×430 logo centered on a `1440×810` viewBox. Fitting the
 * WHOLE viewBox into the user's placement rectangle (or centering on it) shrinks
 * the art to a tiny, near-invisible sliver (~17% of the rect) — the "imported
 * file looks empty" symptom. The content box fits the actual artwork, matching
 * Illustrator's *Place* (which uses artwork bounds, not the artboard).
 *
 * Falls back to `viewBox` when the content box is degenerate (empty art, or a
 * zero-area dimension) so empty / single-point docs still place predictably.
 */
export function placementBounds(root: SvgNode, viewBox: BoundingBox): BoundingBox {
  const content = getNodeBBox(root);
  return content.width > 0 && content.height > 0 ? content : viewBox;
}

/**
 * **D-107** — matrix that fits `src` into `rect` **preserving aspect ratio**
 * (scaled to fill the rectangle as much as possible without distortion,
 * centered within it). A near-zero rect (a click rather than a drag) falls
 * back to natural 1:1 size centered on the click point.
 */
export function fitImportTransform(src: BoundingBox, rect: BoundingBox): Transform {
  const tiny = Math.abs(rect.width) < CLICK_EPSILON && Math.abs(rect.height) < CLICK_EPSILON;
  const srcW = src.width || 1;
  const srcH = src.height || 1;
  const s = tiny
    ? 1
    : Math.max(1e-4, Math.min(Math.abs(rect.width) / srcW, Math.abs(rect.height) / srcH));
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const tx = cx - s * (src.x + src.width / 2);
  const ty = cy - s * (src.y + src.height / 2);
  return [s, 0, 0, s, tx, ty];
}

/**
 * **D-108** — matrix that maps `src` **exactly onto `rect`** with independent
 * X/Y scale (non-uniform). Fills the rectangle completely, **distorting** the
 * art when the rect's aspect ratio differs from the source's (the `Shift`
 * variant of *place*). A near-zero rect (a click) falls back to natural 1:1
 * centered on the click point, same as {@link fitImportTransform} — a click
 * can't define a stretch ratio.
 */
export function stretchImportTransform(src: BoundingBox, rect: BoundingBox): Transform {
  const tiny = Math.abs(rect.width) < CLICK_EPSILON && Math.abs(rect.height) < CLICK_EPSILON;
  if (tiny) {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    return [1, 0, 0, 1, cx - (src.x + src.width / 2), cy - (src.y + src.height / 2)];
  }
  const sx = Math.max(1e-4, Math.abs(rect.width) / (src.width || 1));
  const sy = Math.max(1e-4, Math.abs(rect.height) / (src.height || 1));
  // Map the source box's top-left onto the (already-normalized) rect's
  // top-left: src.x → rect.x, src.x+src.width → rect.x+rect.width (idem y).
  const tx = rect.x - sx * src.x;
  const ty = rect.y - sy * src.y;
  return [sx, 0, 0, sy, tx, ty];
}

/** Normalize a drag (start → current) into a positive-size box (doc coords). */
export function rectFromPoints(a: Point, b: Point): BoundingBox {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/**
 * **D-107** — interactive "place" flow for `File ▸ Import ▸ SVG` (the
 * Illustrator *Place* gesture). Holds the pending import + the live drag
 * rectangle; `<svge-import-placement-overlay>` captures the pointer and
 * drives `beginDrag`/`updateDrag`/`commitDrag`. On commit the art is fit to
 * the drawn rectangle, its defs merged, inserted into the **active page**
 * (`AUTO_PARENT`, single undo) and selected.
 *
 * **Per-editor scope**: the pending placement is editor-specific (two
 * editors mounted side-by-side place independently), so it's listed in
 * `provideSvgEngineEditorScope`. Declared `providedIn: 'root'` as well so
 * the placement overlay can inject it even when a single-editor host mounts
 * a shell WITHOUT the scope helper (the scope is documented as optional for
 * single-editor apps) — the scope override wins whenever it's present (same
 * "root fallback + scope override" pattern as {@link ViewportService}).
 */
@Injectable({ providedIn: 'root' })
export class ImportPlacementService {
  private readonly bus = inject(CommandBus);
  private readonly state = inject(EditorStateService);
  private readonly selection = inject(SelectionService);
  // **D-094** — used by `placeDocumentCentered` to center the import on the
  // active page (with viewport fallback), mirroring `File ▸ Import ▸ SVG`.
  private readonly activePage = inject(ActivePageService);
  private readonly viewport = inject(ViewportService);

  private readonly _pending = signal<PendingImport | null>(null);
  /** The import awaiting placement, or null. Drives the capture overlay. */
  readonly pending = this._pending.asReadonly();

  private dragStart: Point | null = null;
  private readonly _rect = signal<BoundingBox | null>(null);
  /** Live placement rectangle during the drag (doc coords), or null. */
  readonly rect = this._rect.asReadonly();

  private readonly _stretch = signal(false);
  /**
   * **D-108** — when `true`, commit/preview stretch the art to fill the
   * rectangle exactly (distorting); when `false`, it's fit proportionally
   * (centered). Driven by the `Shift` modifier in the capture overlay.
   */
  readonly stretch = this._stretch.asReadonly();

  /**
   * **D-108 fix** — `true` only when the live rectangle is a real DRAG
   * (at least one side past the click threshold), `false` for a bare click
   * (a zero/near-zero rect) or when nothing is pending. The overlay gates
   * its ghost preview on this so a single click doesn't flash the art at
   * natural size before any rectangle has been drawn. Uses the SAME
   * threshold that {@link fitImportTransform}/{@link stretchImportTransform}
   * use to switch click→natural vs drag→fit, so the ghost appears exactly
   * when the committed result stops being the natural-size click placement.
   */
  readonly hasDragRect = computed<boolean>(() => {
    const rect = this._rect();
    if (rect === null) return false;
    return Math.abs(rect.width) >= CLICK_EPSILON || Math.abs(rect.height) >= CLICK_EPSILON;
  });

  /**
   * **D-108** — the transform that {@link commitDrag} would apply right now,
   * given the current rect + stretch mode. `null` when there's nothing to
   * place. Exposed so the overlay's ghost preview renders the art with the
   * EXACT transform that committing produces (WYSIWYG — preview === result).
   */
  readonly placedTransform = computed<Transform | null>(() => {
    const pending = this._pending();
    const rect = this._rect();
    if (pending === null || rect === null) return null;
    return this._stretch()
      ? stretchImportTransform(pending.src, rect)
      : fitImportTransform(pending.src, rect);
  });

  /** Whether a placement gesture is currently active. */
  get isActive(): boolean {
    return this._pending() !== null;
  }

  /** Begin placing `pending` — the overlay starts capturing pointer drags. */
  begin(pending: PendingImport): void {
    this._pending.set(pending);
    this.dragStart = null;
    this._rect.set(null);
    this._stretch.set(false);
  }

  /**
   * **D-108** — set the stretch (distort-to-fill) mode. The overlay calls
   * this from the `Shift` modifier (keydown/keyup + pointer `shiftKey`).
   */
  setStretch(value: boolean): void {
    this._stretch.set(value);
  }

  /** Pointer-down on the canvas: anchor the placement rectangle. */
  beginDrag(point: Point): void {
    if (this._pending() === null) return;
    this.dragStart = point;
    this._rect.set({ x: point.x, y: point.y, width: 0, height: 0 });
  }

  /** Pointer-move: grow the placement rectangle. */
  updateDrag(point: Point): void {
    if (this.dragStart === null) return;
    this._rect.set(rectFromPoints(this.dragStart, point));
  }

  /**
   * Pointer-up: insert the pending import fit to the drawn rectangle (or at
   * natural size for a click), merging defs and selecting the result. Always
   * clears the pending state. No-op (just clears) if no drag was started.
   */
  commitDrag(): void {
    const pending = this._pending();
    const transform = this.placedTransform();
    if (pending === null || this.dragStart === null || transform === null) {
      this.cancel();
      return;
    }
    // **D-101** — namespace the incoming defs ids that collide with the
    // document's existing defs (and rewrite this art's references to them) so a
    // second import that reuses `id="grad"` doesn't resolve to the first's
    // gradient. No-op when there's no collision (single import stays clean).
    const { group, defs } = this.namespaceIncoming(pending.group, pending.defs);
    // **D-108** — `placedTransform()` is the SAME value the ghost preview
    // renders (fit or stretch per the Shift modifier), so what the user saw
    // is exactly what gets inserted.
    const placed: SvgNode = { ...group, transform };
    this.mergeDefs(defs);
    this.bus.dispatch(new InsertNodeCommand(AUTO_PARENT, placed));
    this.selection.select(placed.id);
    this.cancel();
  }

  /** Abort the placement (Esc / lost capture). */
  cancel(): void {
    this._pending.set(null);
    this.dragStart = null;
    this._rect.set(null);
    this._stretch.set(false);
  }

  /**
   * **D-094** — insert a parsed SVG document **additively** at its natural
   * 1:1 size, centered on the active page (viewport fallback). The
   * non-interactive sibling of {@link commitDrag}: same merge-defs +
   * `InsertNodeCommand(AUTO_PARENT)` + select pipeline, but with no drag
   * gesture — the placement is computed directly.
   *
   * Reuses the exact behavior of `File ▸ Import ▸ SVG…` (centered mode):
   * - centers the art's **content** box (via {@link placementBounds}) on the
   *   active page's artboard center, so a small graphic in a big viewBox
   *   doesn't land off-center;
   * - merges the imported `<defs>` (gradients/filters/patterns) into the
   *   document so `url(#id)` references resolve;
   * - inserts as one undo entry into the active page and selects the result.
   *
   * Used by the LLM **no-catalog** mode (D-094): the model returns a complete
   * SVG and we draw it on the canvas. Returns the inserted node id, or `null`
   * when the document has no drawable content.
   */
  placeDocumentCentered(doc: SvgDocument): NodeId | null {
    const imported = doc.root;
    if (imported.type !== 'group' || imported.children.length === 0) return null;

    // **D-101** — namespace incoming defs ids that collide with the current
    // document (centered on the art's pre-namespace bounds, which are
    // unaffected by id rewriting). Same collision-safety as `commitDrag`.
    const { group, defs } = this.namespaceIncoming(imported, doc.defs);

    const src = placementBounds(group, doc.viewBox);
    const srcCx = src.x + src.width / 2;
    const srcCy = src.y + src.height / 2;
    const { cx, cy } = this.insertionCenter();

    const placed: SvgNode = {
      ...group,
      transform: [1, 0, 0, 1, cx - srcCx, cy - srcCy] as Transform,
    };

    this.mergeDefs(defs);
    this.bus.dispatch(new InsertNodeCommand(AUTO_PARENT, placed));
    this.selection.select(placed.id);
    return placed.id;
  }

  /**
   * **D-101** — namespace the incoming art's defs ids that collide with the
   * current document's defs, rewriting this art's references accordingly so the
   * merge can't cross-wire `url(#id)` between two imports. Returns the (possibly
   * rewritten) group + defs fragment; a no-op (same group, `''` defs) when there
   * are no incoming defs, and reference-identical when nothing collides.
   */
  private namespaceIncoming(
    group: SvgNode,
    defs: string | undefined,
  ): { group: SvgNode; defs: string } {
    if (defs === undefined || defs.length === 0) return { group, defs: '' };
    const taken = collectDefsIds(this.state.document().defs);
    const ns = namespaceCollidingDefs(group, defs, taken, nextImportPrefix());
    return { group: ns.root, defs: ns.defs };
  }

  /** Merge a (already-namespaced) defs fragment into the document, deduped. */
  private mergeDefs(defs: string): void {
    if (defs.length === 0) return;
    const doc = this.state.document();
    this.state.setDocument({ ...doc, defs: mergeDefsFragments(doc.defs ?? '', defs) });
  }

  /**
   * **D-094** — center for {@link placeDocumentCentered}: the active page's
   * artboard center, falling back to the visible viewport center when no page
   * is active. Mirrors the menu plugin's `activeInsertionCenter`.
   */
  private insertionCenter(): { cx: number; cy: number } {
    const pageVb = this.activePage.activePageViewBox();
    if (pageVb !== null) {
      return { cx: pageVb.x + pageVb.width / 2, cy: pageVb.y + pageVb.height / 2 };
    }
    const vp = this.viewport.viewBox();
    return { cx: vp.x + vp.width / 2, cy: vp.y + vp.height / 2 };
  }
}
