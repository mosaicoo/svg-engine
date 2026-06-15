import { inject, Injectable, signal } from '@angular/core';
import {
  AUTO_PARENT,
  type BoundingBox,
  CommandBus,
  EditorStateService,
  InsertNodeCommand,
  type Point,
  type SvgNode,
  type Transform,
} from 'svg-engine/core';

import { SelectionService } from '../selection/selection.service';

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

  private readonly _pending = signal<PendingImport | null>(null);
  /** The import awaiting placement, or null. Drives the capture overlay. */
  readonly pending = this._pending.asReadonly();

  private dragStart: Point | null = null;
  private readonly _rect = signal<BoundingBox | null>(null);
  /** Live placement rectangle during the drag (doc coords), or null. */
  readonly rect = this._rect.asReadonly();

  /** Whether a placement gesture is currently active. */
  get isActive(): boolean {
    return this._pending() !== null;
  }

  /** Begin placing `pending` — the overlay starts capturing pointer drags. */
  begin(pending: PendingImport): void {
    this._pending.set(pending);
    this.dragStart = null;
    this._rect.set(null);
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
    const rect = this._rect();
    if (pending === null || this.dragStart === null || rect === null) {
      this.cancel();
      return;
    }
    const placed: SvgNode = {
      ...pending.group,
      transform: fitImportTransform(pending.src, rect),
    };
    if (pending.defs !== undefined && pending.defs.length > 0) {
      const doc = this.state.document();
      this.state.setDocument({ ...doc, defs: `${doc.defs ?? ''}\n${pending.defs}` });
    }
    this.bus.dispatch(new InsertNodeCommand(AUTO_PARENT, placed));
    this.selection.select(placed.id);
    this.cancel();
  }

  /** Abort the placement (Esc / lost capture). */
  cancel(): void {
    this._pending.set(null);
    this.dragStart = null;
    this._rect.set(null);
  }
}
