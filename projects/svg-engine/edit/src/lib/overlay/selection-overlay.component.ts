import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import {
  type BoundingBox,
  CommandBus,
  EditorStateService,
  type Point,
  RotateNodeCommand,
} from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';
import { allAnchors, type BBoxAnchor } from '../geometry/bbox-anchors';
import {
  getCombinedBBox,
  getRenderedNodeBBox,
  getRenderedParentMatrix,
} from '../geometry/node-bbox';
import { SelectionService } from '../selection/selection.service';
import { DIRECT_SELECT_TOOL_ID } from '../tool/builtin-tools';
import { ToolHostService } from '../tool/tool-host.service';
import { TransformService } from '../transform/transform.service';

/** Pixel size of resize/rotation handles (CSS pixels, kept constant via 1/zoom factor). */
const HANDLE_PX = 8;
/** Distance (in CSS pixels) from the top-center anchor to the rotation handle. */
const ROTATION_HANDLE_GAP_PX = 24;
/** Inner data attribute used by the future TransformService to identify which handle was grabbed. */
const HANDLE_DATA_ATTR = 'data-svge-handle';

type ResizeAnchor = Exclude<BBoxAnchor, 'mc'>;

/**
 * Visual selection overlay. Renders, **inside the same `<svg>`** as the
 * content (via the renderer's `<ng-content />` slot — D-022 architecture):
 *
 * - Bounding box outline of the focused node (or composite bbox of a
 *   multi-selection).
 * - 8 resize handles (TL/TC/TR/ML/MR/BL/BC/BR) **only for single
 *   selection** in Bloco 2/3. Multi-selection resize is deferred to a
 *   future block that decides handle semantics for composites.
 * - 1 rotation handle above the top-center anchor.
 * - Light outline of the currently hovered node (when not selected).
 *
 * **Bloco 3 — interactive handles**: pointer events on each resize/
 * rotation handle drive {@link TransformService} (`startResize`/
 * `startRotate` + `update*` + `end*`). Pointer capture keeps the gesture
 * alive when the cursor leaves the handle. The bbox/handles re-render
 * reactively from the previewed `state.document()` mutation in
 * `TransformService`, so the overlay tracks the gesture in real time.
 *
 * Bbox computation is **DOM-based** via `SVGGraphicsElement.getBBox()`
 * (correct for every node type including paths/text). We re-measure
 * with `afterEveryRender({ read })` so DOM updates from the renderer
 * are picked up on the next frame.
 *
 * Handle size stays pixel-constant by scaling with `1/viewport.zoom()`.
 * The bbox outline uses `vector-effect="non-scaling-stroke"`.
 *
 * Usage (inside a `<svge-renderer>`):
 * ```html
 * <svge-renderer [tree]="tree" [viewBox]="viewBox">
 *   <svg:g svgeSelectionOverlay></svg:g>
 * </svge-renderer>
 * ```
 *
 * The component is a no-op when nothing is selected.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeSelectionOverlay]',
  standalone: true,
  // role="group" + a name announce the entire handle cluster as one
  // logical widget. Hover outline is decorative (aria-hidden inside).
  host: {
    role: 'group',
    'aria-label': 'Selection transform handles',
  },
  template: `
    @if (hoverBBox(); as h) {
      <svg:rect
        class="hover-outline"
        aria-hidden="true"
        [attr.x]="h.x"
        [attr.y]="h.y"
        [attr.width]="h.width"
        [attr.height]="h.height"
        fill="none"
      ></svg:rect>
    }

    @if (focusBBox(); as b) {
      <svg:rect
        class="bbox"
        aria-hidden="true"
        [attr.x]="b.x"
        [attr.y]="b.y"
        [attr.width]="b.width"
        [attr.height]="b.height"
        fill="none"
      ></svg:rect>

      @if (showsTransformHandles()) {
        @for (h of resizeHandles(); track h.anchor) {
          <svg:rect
            class="handle resize"
            [attr.x]="h.x - handleHalf()"
            [attr.y]="h.y - handleHalf()"
            [attr.width]="handleSize()"
            [attr.height]="handleSize()"
            [attr.data-svge-handle]="h.anchor"
            [attr.aria-label]="
              'Resize handle, ' +
              anchorLabel(h.anchor) +
              '. Arrow keys to resize 1 unit, Shift+arrow for 10 units.'
            "
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
            role="button"
            tabindex="0"
            focusable="true"
            (pointerdown)="onResizeHandlePointerDown($event, h.anchor)"
            (pointermove)="onHandlePointerMove($event)"
            (pointerup)="onHandlePointerUp($event)"
            (keydown)="onResizeHandleKeyDown($event, h.anchor)"
          ></svg:rect>
        }

        @if (rotationHandle(); as r) {
          <svg:line
            class="rotation-stem"
            aria-hidden="true"
            [attr.x1]="r.stemX1"
            [attr.y1]="r.stemY1"
            [attr.x2]="r.x"
            [attr.y2]="r.y"
          ></svg:line>
          <svg:circle
            class="handle rotation"
            [attr.cx]="r.x"
            [attr.cy]="r.y"
            [attr.r]="handleHalf()"
            [attr.data-svge-handle]="'rotation'"
            aria-label="Rotation handle. Left/right arrows rotate by 1 degree, Shift+arrow rotates by 15 degrees."
            aria-keyshortcuts="ArrowLeft ArrowRight"
            role="button"
            tabindex="0"
            focusable="true"
            (pointerdown)="onRotationHandlePointerDown($event)"
            (pointermove)="onHandlePointerMove($event)"
            (pointerup)="onHandlePointerUp($event)"
            (keydown)="onRotationHandleKeyDown($event)"
          ></svg:circle>
        }
      }
    }
  `,
  styles: `
    .bbox,
    .hover-outline {
      stroke: #1976d2;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    .hover-outline {
      stroke: #90caf9;
      stroke-dasharray: 3 2;
      vector-effect: non-scaling-stroke;
    }
    .handle {
      fill: #ffffff;
      stroke: #1976d2;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      cursor: pointer;
      touch-action: none;
      /* Default outline removed so the keyboard-focus ring (below) is
         the only visual focus affordance. Without this, native browser
         outlines from tabindex=0 would show on hover/click via :focus
         (mouse), which is noisy. The focus-visible rule keeps it
         keyboard-only. */
      outline: none;
    }
    .handle:focus-visible {
      /* Keyboard-only focus ring — accessibility (Fase 6c-2). Orange
         glow ensures contrast against the default primary-blue stroke,
         visible on both light and dark canvases. */
      stroke: #ff6f00;
      stroke-width: 2;
      filter: drop-shadow(0 0 2px rgba(255, 111, 0, 0.5));
    }
    .handle.resize {
      cursor: grab;
    }
    .handle.resize:active {
      cursor: grabbing;
    }
    .handle.rotation {
      cursor: grab;
    }
    .handle.rotation:active {
      cursor: grabbing;
    }
    .rotation-stem {
      stroke: #1976d2;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectionOverlay {
  private readonly elRef = inject(ElementRef<SVGGElement>);
  private readonly selection = inject(SelectionService);
  private readonly state = inject(EditorStateService);
  private readonly viewport = inject(ViewportService);
  private readonly transform = inject(TransformService);
  private readonly toolHost = inject(ToolHostService);
  private readonly bus = inject(CommandBus);

  private readonly _focusBBox = signal<BoundingBox | null>(null);
  private readonly _hoverBBox = signal<BoundingBox | null>(null);

  /** Bounding box of the focused selection (single id) or composite bbox (multi). */
  readonly focusBBox = this._focusBBox.asReadonly();

  /** Bounding box of the hovered node (when not part of the selection). */
  readonly hoverBBox = this._hoverBBox.asReadonly();

  protected readonly singleSelection = this.selection.isSingleSelection;

  /**
   * Transform handles (resize squares + rotation circle) are shown
   * when **single selection** is active, with one Illustrator-style
   * exception: hide them when Direct Select (A) is active AND the
   * focused node is a `path` — because the `AnchorOverlay` is then
   * showing anchor points for that path, and the two overlays
   * overlapping would clutter the canvas.
   *
   * For non-path types under Direct Select (rect, ellipse, line,
   * polygon, polyline, group, text, image) we KEEP the transform
   * handles — Direct Select on them has no anchor surface to switch
   * to, so removing handles would just disable editing. Matches
   * Illustrator's behavior precisely (Direct Selection Tool on a
   * rect still shows the bbox handles because rect has no
   * editable nodes; convert it to a path first to get anchors).
   *
   * The bbox **outline** stays visible in both tools so the user
   * can always see which node is focused.
   */
  protected readonly showsTransformHandles = computed(() => {
    if (!this.singleSelection()) return false;
    if (this.toolHost.activeId() !== DIRECT_SELECT_TOOL_ID) return true;
    // Direct Select active — hide handles only when the focused node
    // is a path (the only type the anchor overlay renders).
    const focusId = this.selection.focusId();
    if (focusId === null) return true;
    const node = findFocusedType(this.state.document().root, focusId);
    return node !== 'path';
  });

  /** Handle size in document units (kept constant in screen pixels via 1/zoom). */
  protected readonly handleSize = computed(() => HANDLE_PX / this.viewport.zoom());
  protected readonly handleHalf = computed(() => this.handleSize() / 2);

  protected readonly resizeHandles = computed(() => {
    const b = this._focusBBox();
    if (b === null) return [];
    const a = allAnchors(b);
    return [
      { anchor: 'tl' as ResizeAnchor, ...a.tl },
      { anchor: 'tc' as ResizeAnchor, ...a.tc },
      { anchor: 'tr' as ResizeAnchor, ...a.tr },
      { anchor: 'ml' as ResizeAnchor, ...a.ml },
      { anchor: 'mr' as ResizeAnchor, ...a.mr },
      { anchor: 'bl' as ResizeAnchor, ...a.bl },
      { anchor: 'bc' as ResizeAnchor, ...a.bc },
      { anchor: 'br' as ResizeAnchor, ...a.br },
    ];
  });

  protected readonly rotationHandle = computed(() => {
    const b = this._focusBBox();
    if (b === null) return null;
    const tc = allAnchors(b).tc;
    const gap = ROTATION_HANDLE_GAP_PX / this.viewport.zoom();
    return {
      x: tc.x,
      y: tc.y - gap,
      stemX1: tc.x,
      stemY1: tc.y,
    };
  });

  constructor() {
    afterEveryRender({
      read: () => this.recomputeBBoxes(),
    });
    // **Font-ready bbox refresh** (bug fix #4 — user reported "resize
    // do texto só funciona depois de clicar na rotação"). Text nodes
    // measure 0×0 in `getBBox()` until the browser has loaded their
    // font and painted the glyphs. `getRenderedNodeBBox` returns null
    // for 0×0 geometry, which leaves `_focusBBox` null and the resize
    // handles silently no-op (the pointerdown handler bails on null
    // bbox). After `document.fonts.ready` resolves, every text node's
    // bbox becomes valid; we trigger one re-compute so already-
    // selected text re-acquires its handles. Subsequent text creations
    // measure correctly because the font is now cached.
    if (typeof document !== 'undefined' && document.fonts !== undefined) {
      void document.fonts.ready.then(() => {
        this.recomputeBBoxes();
      });
    }
  }

  // ── Resize handle interactions ───────────────────────────────────

  protected onResizeHandlePointerDown(event: PointerEvent, anchor: ResizeAnchor): void {
    const focus = this.selection.focusId();
    const b = this._focusBBox();
    if (focus === null || b === null) return;

    // Capture the node's ancestor matrix so the resize math can adjust
    // the doc-space anchor into the node's parent-local frame — without
    // this, resizing a shape inside a translated/rotated group "drifts"
    // (becomes a move). `null` means no ancestor transform / node is
    // directly under the SVG root.
    const svg = this.elRef.nativeElement.ownerSVGElement;
    const parentMatrix = svg === null ? null : getRenderedParentMatrix(svg, focus);

    this.transform.startResize(focus, anchor, b, parentMatrix);
    capturePointer(event);
    event.stopPropagation();
  }

  // ── Rotation handle interactions ─────────────────────────────────

  protected onRotationHandlePointerDown(event: PointerEvent): void {
    const focus = this.selection.focusId();
    const b = this._focusBBox();
    if (focus === null || b === null) return;
    const start = this.screenToDoc(event.clientX, event.clientY);
    if (start === null) return;

    const pivot = this.transform.resolvePivot(b);
    this.transform.startRotate(focus, pivot, start);
    capturePointer(event);
    event.stopPropagation();
  }

  // ── Keyboard accessibility (Fase 6c a11y audit) ─────────────────

  /**
   * Arrow-key resize for keyboard users (no mouse). Reuses the same
   * gesture API (`startResize → updateResize → endResize`) as pointer
   * drag so the math, the locked-node filter, the parent-matrix
   * adjustment, and the single-undo-entry guarantee are all identical.
   *
   * Each key press fires one full gesture (one undo entry). Arrow
   * keys nudge the handle by 1 doc unit; Shift+Arrow by 10 (matches
   * Illustrator's `Keyboard Increment` × 1/10 ratio for fine vs coarse).
   * Enter/Space are intentionally no-ops — there's no atomic "select
   * handle" gesture; the focus itself is the affordance.
   */
  protected onResizeHandleKeyDown(event: KeyboardEvent, anchor: ResizeAnchor): void {
    const step = event.shiftKey ? 10 : 1;
    let dx = 0;
    let dy = 0;
    switch (event.key) {
      case 'ArrowLeft':
        dx = -step;
        break;
      case 'ArrowRight':
        dx = step;
        break;
      case 'ArrowUp':
        dy = -step;
        break;
      case 'ArrowDown':
        dy = step;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    const focus = this.selection.focusId();
    const bbox = this._focusBBox();
    if (focus === null || bbox === null) return;
    const svg = this.elRef.nativeElement.ownerSVGElement;
    const parentMatrix = svg === null ? null : getRenderedParentMatrix(svg, focus);
    // Synthesize cursor positions: start at the handle's current
    // position, end one step further along (dx, dy). The gesture
    // service computes sx/sy from the delta and pivots on the
    // opposite anchor automatically.
    const anchors = allAnchors(bbox);
    const start = anchors[anchor];
    const target = { x: start.x + dx, y: start.y + dy };
    this.transform.startResize(focus, anchor, bbox, parentMatrix);
    this.transform.updateResize(target);
    this.transform.endResize();
  }

  /**
   * Arrow-key rotation for keyboard users. Left/right rotate by 1°
   * (Shift = 15° — same step Illustrator uses for `Cmd+Shift+arrow`).
   * Dispatches `RotateNodeCommand` directly with the resolved pivot —
   * doesn't go through the start/update/end gesture API because
   * keyboard rotation is single-step (no continuous drag preview).
   */
  protected onRotationHandleKeyDown(event: KeyboardEvent): void {
    const stepDeg = event.shiftKey ? 15 : 1;
    let deltaDeg: number;
    switch (event.key) {
      case 'ArrowLeft':
        deltaDeg = -stepDeg;
        break;
      case 'ArrowRight':
        deltaDeg = stepDeg;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    const focus = this.selection.focusId();
    const bbox = this._focusBBox();
    if (focus === null || bbox === null) return;
    const pivot = this.transform.resolvePivot(bbox);
    const angleRad = (deltaDeg * Math.PI) / 180;
    this.bus.dispatch(new RotateNodeCommand(focus, angleRad, pivot));
  }

  /**
   * Human-readable expansion of the 8 resize-anchor codes. The codes
   * (`tl`, `tc`, ...) are the engine's canonical short names; screen
   * readers should hear "top-left", "middle-right", etc.
   */
  protected anchorLabel(a: ResizeAnchor): string {
    const labels: Record<ResizeAnchor, string> = {
      tl: 'top-left corner',
      tc: 'top-center',
      tr: 'top-right corner',
      ml: 'middle-left',
      mr: 'middle-right',
      bl: 'bottom-left corner',
      bc: 'bottom-center',
      br: 'bottom-right corner',
    };
    return labels[a];
  }

  // ── Shared move/up handlers (active for any drag started above) ─

  protected onHandlePointerMove(event: PointerEvent): void {
    const ds = this.transform.dragState();
    if (ds === null) return;
    const point = this.screenToDoc(event.clientX, event.clientY);
    if (point === null) return;
    if (ds.kind === 'resize') this.transform.updateResize(point);
    else if (ds.kind === 'rotate') this.transform.updateRotate(point);
  }

  protected onHandlePointerUp(event: PointerEvent): void {
    const ds = this.transform.dragState();
    if (ds === null) return;
    if (ds.kind === 'resize') this.transform.endResize();
    else if (ds.kind === 'rotate') this.transform.endRotate();
    releasePointer(event);
  }

  // ── Bbox recomputation ──────────────────────────────────────────

  private recomputeBBoxes(): void {
    const svg = this.elRef.nativeElement.ownerSVGElement;
    if (svg === null) {
      this.maybeSet(this._focusBBox, null);
      this.maybeSet(this._hoverBBox, null);
      return;
    }
    const ids = this.selection.selectedIds();
    const focus = this.selection.focusId();
    const hover = this.selection.hoverId();
    this.state.document();

    let focusBBox: BoundingBox | null = null;
    if (this.selection.isSingleSelection() && focus !== null) {
      focusBBox = getRenderedNodeBBox(svg, focus);
    } else if (ids.size > 1) {
      focusBBox = getCombinedBBox(svg, ids);
    }
    this.maybeSet(this._focusBBox, focusBBox);

    const hoverBBox = hover !== null && !ids.has(hover) ? getRenderedNodeBBox(svg, hover) : null;
    this.maybeSet(this._hoverBBox, hoverBBox);
  }

  // ── Internal helpers ─────────────────────────────────────────────

  private screenToDoc(clientX: number, clientY: number): Point | null {
    const svg = this.elRef.nativeElement.ownerSVGElement;
    if (svg === null) return null;
    const ctm = svg.getScreenCTM();
    if (ctm === null) return null;
    const inverse = ctm.inverse();
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const userSpace = pt.matrixTransform(inverse);
    return { x: userSpace.x, y: userSpace.y };
  }

  /**
   * Update the signal only if the value actually changed, to avoid
   * triggering an extra render cycle from `afterEveryRender`.
   */
  private maybeSet(
    target: { set(v: BoundingBox | null): void; (): BoundingBox | null },
    next: BoundingBox | null,
  ): void {
    const cur = target();
    if (cur === next) return;
    if (cur !== null && next !== null && bboxesEqual(cur, next)) return;
    target.set(next);
  }
}

function bboxesEqual(a: BoundingBox, b: BoundingBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function capturePointer(event: PointerEvent): void {
  const target = event.target as Element & { setPointerCapture?(id: number): void };
  if (typeof target.setPointerCapture === 'function') {
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // ignore (some browsers/elements reject capture)
    }
  }
}

function releasePointer(event: PointerEvent): void {
  const target = event.target as Element & { releasePointerCapture?(id: number): void };
  if (typeof target.releasePointerCapture === 'function') {
    try {
      target.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
  }
}

/** Re-export for convenience: caller may want to reference the data attribute name. */
export { HANDLE_DATA_ATTR };

/**
 * Returns the `type` of the focused node, walking the tree from
 * `root`. Inlined here so `showsTransformHandles` doesn't pay the
 * full `findNodeById` import chain — we only need the type field
 * and the walk is the same.
 */
function findFocusedType(
  node: import('svg-engine/core').SvgNode,
  id: import('svg-engine/core').NodeId,
): import('svg-engine/core').SvgNode['type'] | null {
  if (node.id === id) return node.type;
  if (node.type === 'group') {
    for (const child of node.children) {
      const found = findFocusedType(child, id);
      if (found !== null) return found;
    }
  }
  return null;
}
