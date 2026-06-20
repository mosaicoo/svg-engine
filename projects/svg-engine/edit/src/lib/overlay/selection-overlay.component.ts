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
  applyTransform,
  bbox,
  type BoundingBox,
  CommandBus,
  EditorStateService,
  findNodeById,
  isIdentityOrTranslate,
  isPage,
  type Point,
  RotateNodeCommand,
  RotateNodesCommand,
  type TextNode,
  type Transform,
} from 'svg-engine/core';
import { composeAncestorMatrix } from '../anchor-editor/compose-ancestor-matrix';
import { screenToDoc, ViewportService } from 'svg-engine/render';
import { capturePointer, releasePointer } from '../pointer';
import { allAnchors, type BBoxAnchor } from '../geometry/bbox-anchors';
import {
  getCombinedBBox,
  getRenderedNodeBBox,
  getRenderedNodeOBB,
  getRenderedParentMatrix,
  type RenderedOBB,
} from '../geometry/node-bbox';
import { KeyObjectService } from '../alignment/key-object.service';
import { LayersService } from '../layers/layers.service';
import { SelectionService } from '../selection/selection.service';
import { SelectionAppearanceService } from '../selection-appearance';
import { DIRECT_SELECT_TOOL_ID } from '../tool/builtin-tools';
import { ToolHostService } from '../tool/tool-host.service';
import { TransformService } from '../transform/transform.service';

// D-143 — the resize/rotation handle PIXEL size is no longer a constant
// here; it comes from the app-wide `SelectionAppearanceService` preference
// (default 8) so users can resize the handles from Workspace Settings.
/** Distance (in CSS pixels) from the top-center anchor to the rotation handle. */
const ROTATION_HANDLE_GAP_PX = 24;
/**
 * Inner data attribute set on each handle element. Today the overlay
 * itself passes the `anchor` directly to `TransformService.startResize`
 * — the attribute is kept exported for consumers / tests / automation
 * that need to identify which handle was grabbed via DOM inspection.
 */
const HANDLE_DATA_ATTR = 'data-svge-handle';

type ResizeAnchor = Exclude<BBoxAnchor, 'mc'>;

/**
 * Visual selection overlay. Renders, **inside the same `<svg>`** as the
 * content (via the renderer's `<ng-content />` slot — D-022 architecture):
 *
 * - Bounding box outline of the focused node **or the composite (union)
 *   bbox of a multi-selection** (`getCombinedBBox`). A multi-selection
 *   shows the combined outline AND can be **dragged as a group** (the
 *   `[svgeShellInteractions]` directive routes a multi-drag through
 *   `TransformService.startMoveMany` → `TranslateManyCommand`,
 *   Illustrator/Figma/Affinity convention).
 * - 8 resize handles (TL/TC/TR/ML/MR/BL/BC/BR) **only for single
 *   selection**. Multi-selection RESIZE (scaling the whole group around
 *   the union-bbox anchor) is still deferred — it needs per-node scale
 *   math around a shared external anchor + a batch resize command;
 *   tracked as a follow-up. Multi-selection MOVE is supported.
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

    @if (keyBBox(); as k) {
      <svg:rect
        class="key-object"
        aria-hidden="true"
        [attr.x]="k.x"
        [attr.y]="k.y"
        [attr.width]="k.width"
        [attr.height]="k.height"
        fill="none"
      ></svg:rect>
    }

    <!--
      **D-141 — oriented (OBB) chrome.** For a single ROTATED node the box +
      handles + rotation stem are drawn in the node's LOCAL frame inside a
      <g matrix="..."> so the whole transform widget rotates WITH the object
      (Illustrator/Figma/Affinity). Resize handles route to the OBB gesture
      (scale along local axes). Non-rotated single + multi-selection keep the
      axis-aligned chrome in the @else if below.
    -->
    @if (obb(); as o) {
      <svg:g [attr.transform]="obbTransform()">
        <svg:rect
          class="bbox"
          aria-hidden="true"
          [attr.x]="o.localBBox.x"
          [attr.y]="o.localBBox.y"
          [attr.width]="o.localBBox.width"
          [attr.height]="o.localBBox.height"
          fill="none"
        ></svg:rect>
      </svg:g>

      <!--
        D-142-fix3 — resize handles for the oriented box are drawn in DOCUMENT
        space (NOT inside the <g matrix>) as fixed-size squares positioned at
        the box corners and rotated by the box ANGLE only. Inside the matrix
        group they inherited its scale/skew, so a non-uniformly scaled object
        stretched the handle squares. Doc-space + angle-only keeps them
        pixel-constant and square under any transform (the box outline above
        still rides the matrix, since it must trace the object's real bounds).
      -->
      @if (showsTransformHandles()) {
        @for (h of obbResizeHandlesDoc(); track h.anchor) {
          <svg:rect
            [class]="'handle resize handle-' + h.anchor"
            [attr.x]="h.x - handleHalf()"
            [attr.y]="h.y - handleHalf()"
            [attr.width]="handleSize()"
            [attr.height]="handleSize()"
            [attr.transform]="obbHandleTransform(h.x, h.y)"
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
      }
    } @else if (focusBBox(); as b) {
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
            [class]="'handle resize handle-' + h.anchor"
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
      }
    }

    <!--
      D-141 persistent rotation handle + stem. Rendered ONCE, OUTSIDE the
      AABB/oriented conditional above, in DOCUMENT space (not inside the
      oriented matrix group). This is deliberate: the pointer-capture taken on
      the handle at gesture start would be lost if the element were destroyed
      mid-drag — and the conditional DOES swap when a rotation crosses the
      identity-to-rotated boundary (a non-rotated node becomes oriented on the
      first move). Keeping the rotation handle persistent preserves capture and
      lets rotationHandlePersistent() recompute its position each frame so the
      stem visually FOLLOWS the mouse during rotation, then settles oriented
      with the element (the user's explicit D-141 requirement). The pivot is the
      bbox centre, invariant under rotation (AABB centre == OBB centre), so the
      rotation gesture itself is unaffected.
    -->
    @if (showsRotationHandle() && rotationHandlePersistent(); as r) {
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
    /* D-094 — key object accent: thicker orange outline (same hue as the
       keyboard focus ring) so it reads as "the anchor" against the blue
       selection chrome. Decorative + non-interactive. */
    .key-object {
      stroke: #ff6f00;
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
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
    /*
     * Per-handle cursors (Select V). Each resize handle shows the axis it
     * resizes along; the rotation handle shows a rotate cursor. The "hand"
     * (grab) is intentionally NOT used here — it is reserved for dragging
     * the shape body. Mirrors the page-selection-overlay convention +
     * Illustrator / Figma / Affinity. The bbox + handles are axis-aligned
     * (AABB) even for rotated nodes, so axis-aligned cursors are correct.
     * Selectors include .resize/.rotation so specificity beats the base
     * .handle { cursor } rule regardless of source order.
     */
    .handle.resize.handle-tl,
    .handle.resize.handle-br {
      cursor: nwse-resize;
    }
    .handle.resize.handle-tr,
    .handle.resize.handle-bl {
      cursor: nesw-resize;
    }
    .handle.resize.handle-tc,
    .handle.resize.handle-bc {
      cursor: ns-resize;
    }
    .handle.resize.handle-ml,
    .handle.resize.handle-mr {
      cursor: ew-resize;
    }
    .handle.rotation {
      /*
       * Custom rotate cursor (circular-arrow / "refresh" glyph, white halo
       * for contrast on light + dark canvases, hotspot centred on 24×24).
       * Falls back to crosshair if the data URI can't load — never the hand.
       */
      cursor:
        url("data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='24'%20height='24'%20viewBox='0%200%2024%2024'%3E%3Cpath%20d='M17.65%206.35A7.96%207.96%200%200%200%2012%204a8%208%200%201%200%207.75%2010h-2.08A6%206%200%201%201%2012%206c1.66%200%203.14.69%204.22%201.78L13%2011h7V4z'%20fill='%23222'%20stroke='%23fff'%20stroke-width='1'/%3E%3C/svg%3E")
          12 12,
        crosshair;
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
  // D-143 — app-wide handle-size preference (drives the resize squares +
  // rotation knob). Root-scoped service; the dialog writes it, this reads.
  private readonly appearance = inject(SelectionAppearanceService);
  private readonly bus = inject(CommandBus);
  private readonly layers = inject(LayersService);
  // D-094 — "Align to Key Object" highlight: the designated anchor among
  // a multi-selection gets a distinct accented outline so the user sees
  // which object the align ops snap everything else to.
  private readonly keyObject = inject(KeyObjectService);

  private readonly _focusBBox = signal<BoundingBox | null>(null);
  private readonly _hoverBBox = signal<BoundingBox | null>(null);
  private readonly _keyBBox = signal<BoundingBox | null>(null);
  /**
   * **D-141** — the focused single node's oriented box (local bbox +
   * full matrix). Drives the rotated selection chrome. `null` for
   * multi-selection or when the node has no rendered geometry.
   */
  private readonly _obb = signal<RenderedOBB | null>(null);

  /** Accented outline of the key object (only while a multi-selection has one). */
  readonly keyBBox = this._keyBBox.asReadonly();

  /**
   * Bounding box of the focused selection (single id) or composite bbox
   * (multi). Returns `null` when:
   *
   * - No node is focused (no selection), OR
   * - The focused node is HIDDEN via the Layer Panel eye toggle
   *   (`LayersService.hiddenIds`, session-level), OR
   * - The focused node has `metadata.visible === false` (doc-level
   *   persistent hide — used by Live Boolean inputs).
   *
   * **Why also gate on visibility** (vs. just exposing the raw signal):
   * the rendered geometry is invisible, so showing the selection bbox
   * + 8 resize handles + rotation handle around an invisible shape is
   * visually confusing — handles float in empty space. Illustrator/
   * Affinity both hide the selection chrome when the target layer is
   * hidden. The selection state itself stays intact (the row stays
   * highlighted in the Layer Panel); re-showing the layer restores
   * the handles immediately. Pointer-down on a hidden handle would
   * also be impossible anyway because the underlying node is
   * `display: none` (D-056 follow-up renderer fix).
   */
  readonly focusBBox = computed<BoundingBox | null>(() => {
    const id = this.selection.focusId();
    if (id === null) return this._focusBBox();
    if (this.layers.hiddenIds().has(id)) return null;
    const node = findNodeById(this.state.document().root, id);
    if (node !== null && node.metadata.visible === false) return null;
    // **PAGES-REFACTOR Fase 6 follow-up**: when the focused node is a
    // D-079 page, suppress the regular shape-selection bbox + handles.
    // The dedicated `<svg:g svgePageSelectionOverlay>` renders its own
    // L-brackets + label + 8 page-resize handles + move handle (which
    // dispatch `ResizePageCommand` / `MovePageCommand`, not
    // `ResizeNodeCommand` which would bake a transform on the page —
    // wrong semantics, pages resize their viewBox instead).
    //
    // Without this guard, BOTH overlays render around a selected page:
    // the user sees shape-style white handles AND the page brackets,
    // gets confused about which one to grab, and dragging a shape
    // handle dispatches the wrong command. Hiding the regular overlay
    // for pages makes the page selection visual unambiguous.
    if (node !== null && isPage(node)) return null;
    return this._focusBBox();
  });

  /**
   * Bounding box of the hovered node (when not part of the selection).
   *
   * **PAGES-REFACTOR Fase 6 follow-up**: suppress the hover outline
   * when the hovered node is a D-079 page — the page already has its
   * own visual treatment (paper rect + brackets when selected). A
   * cyan dashed bbox on top of all that just adds noise and reinforces
   * the user's perception that "the page is just another rectangle".
   */
  readonly hoverBBox = computed<BoundingBox | null>(() => {
    const raw = this._hoverBBox();
    if (raw === null) return null;
    const hoverId = this.selection.hoverId();
    if (hoverId === null) return raw;
    const node = findNodeById(this.state.document().root, hoverId);
    if (node !== null && isPage(node)) return null;
    return raw;
  });

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
    // Multi-selection → show the 8 resize handles around the COMBINED
    // bbox (group resize). The Direct-Select/path exception below only
    // concerns a single focused path (the anchor overlay never targets
    // a multi-selection), so it doesn't apply here.
    if (!this.singleSelection()) {
      return this.selection.count() > 1;
    }
    if (this.toolHost.activeId() !== DIRECT_SELECT_TOOL_ID) return true;
    // Direct Select active — hide handles only when the focused node
    // is a path (the only type the anchor overlay renders).
    const focusId = this.selection.focusId();
    if (focusId === null) return true;
    const node = findFocusedType(this.state.document().root, focusId);
    return node !== 'path';
  });

  /**
   * Rotation handle visibility. Shown whenever the transform handles are
   * shown — i.e. for single selection AND for multi-selection (group
   * rotation about the combined-bbox centre, the same way a single group
   * rotates about its own centre). The pointer/keyboard handlers route to
   * the group gesture (`startRotateMany`) when `count > 1`, so the handle
   * rotates the whole selection rigidly — never just the focus node.
   */
  protected readonly showsRotationHandle = this.showsTransformHandles;

  /**
   * Handle size in document units (kept constant in screen pixels via
   * 1/zoom). **D-143** — the pixel size now comes from the app-wide
   * {@link SelectionAppearanceService} preference (default 8) instead of a
   * hard-coded constant, so users can pick Small/Medium/Large (or a custom
   * value) from Workspace Settings. Driving both the 8 resize squares and
   * the rotation knob off this one computed keeps them consistent.
   */
  protected readonly handleSize = computed(
    () => this.appearance.handleSizePx() / this.viewport.zoom(),
  );
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

  /**
   * **D-141** — single persistent rotation handle, expressed in DOCUMENT
   * space, that adapts to the selection's orientation:
   *
   * - **Oriented single node** (`obb()` non-null): the stem starts at the
   *   object's LOCAL top-center projected to doc space and points along the
   *   object's rotated "up" axis (the matrix's negated y-basis vector,
   *   normalized). So the stem rotates WITH the element — and, because
   *   `_obb` recomputes from the live previewed matrix every frame, it
   *   tracks the mouse continuously during a rotation drag.
   * - **AABB** (non-rotated single OR multi-selection): straight up from the
   *   focus/combined bbox top-center (legacy behaviour).
   *
   * Rendered outside the AABB/oriented conditional so the DOM element is
   * stable across the mode swap → the pointer capture taken on drag-start
   * survives a rotation crossing the identity boundary.
   */
  protected readonly rotationHandlePersistent = computed(() => {
    if (!this.showsRotationHandle()) return null;
    const gapDoc = ROTATION_HANDLE_GAP_PX / this.viewport.zoom();
    const o = this.obb();
    if (o !== null) {
      const m = o.matrix;
      const tc = allAnchors(o.localBBox).tc;
      const tcDoc = applyTransform(m, tc.x, tc.y);
      // Local +y points DOWN in SVG user space, so the box's visual "up" is
      // the negated y-basis vector (-c, -d) of the matrix. Normalize it and
      // step a screen-constant gap so the stem length stays pixel-stable.
      let ux = -m[2];
      let uy = -m[3];
      const len = Math.hypot(ux, uy);
      if (len > 1e-6) {
        ux /= len;
        uy /= len;
      }
      return {
        x: tcDoc.x + ux * gapDoc,
        y: tcDoc.y + uy * gapDoc,
        stemX1: tcDoc.x,
        stemY1: tcDoc.y,
      };
    }
    // AABB path — use the gated focusBBox so the handle inherits the same
    // hidden/page suppression as the rest of the chrome.
    const b = this.focusBBox();
    if (b === null) return null;
    const tc = allAnchors(b).tc;
    return { x: tc.x, y: tc.y - gapDoc, stemX1: tc.x, stemY1: tc.y };
  });

  // ── D-141 — oriented (OBB) chrome for a single rotated node ────────

  /**
   * Oriented box for the focused single node — non-null ONLY when the
   * node is genuinely rotated/skewed (its matrix isn't identity-or-
   * translate). Inherits the visibility / page / single-selection gating
   * from {@link focusBBox} (returns null whenever that does), so the
   * oriented chrome appears under exactly the same conditions as the
   * axis-aligned one it replaces.
   */
  protected readonly obb = computed<RenderedOBB | null>(() => {
    if (!this.singleSelection()) return null;
    if (this.focusBBox() === null) return null;
    const o = this._obb();
    if (o === null) return null;
    if (isIdentityOrTranslate(o.matrix)) return null; // axis-aligned → keep the AABB path
    return o;
  });

  /** `matrix(...)` transform that orients the whole chrome group. */
  protected readonly obbTransform = computed<string | null>(() => {
    const o = this.obb();
    if (o === null) return null;
    const m = o.matrix;
    return `matrix(${m[0]} ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]})`;
  });

  /**
   * **D-142-fix3** — the box rotation in degrees (`atan2` of the matrix's
   * x-basis), WITHOUT its scale. Used to rotate the fixed-size handle squares
   * so they align with the oriented box edges but never inherit the object's
   * scale/skew (which would stretch them).
   */
  protected readonly obbAngleDeg = computed(() => {
    const o = this.obb();
    if (o === null) return 0;
    return (Math.atan2(o.matrix[1], o.matrix[0]) * 180) / Math.PI;
  });

  /**
   * **D-142-fix3** — the 8 resize anchors in DOCUMENT coordinates (local
   * anchor projected through the OBB matrix). Rendered in doc space at a
   * fixed pixel size (`handleSize`), so they stay square regardless of the
   * node's scale; only their POSITION follows the oriented box.
   */
  protected readonly obbResizeHandlesDoc = computed(() => {
    const o = this.obb();
    if (o === null) return [];
    const a = allAnchors(o.localBBox);
    const order: ResizeAnchor[] = ['tl', 'tc', 'tr', 'ml', 'mr', 'bl', 'bc', 'br'];
    return order.map((anchor) => {
      const p = applyTransform(o.matrix, a[anchor].x, a[anchor].y);
      return { anchor, x: p.x, y: p.y };
    });
  });

  /** `rotate(angle cx cy)` for a doc-space oriented handle — angle only, no scale. */
  protected obbHandleTransform(cx: number, cy: number): string {
    return `rotate(${this.obbAngleDeg()} ${cx} ${cy})`;
  }

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
    // **D-141 — oriented (OBB) resize** for a single rotated node. `obb()`
    // is non-null only for single selection with a genuinely rotated matrix,
    // so this branch never collides with the multi/AABB paths below. Scale
    // happens along the object's OWN axes (see `startResizeObb`).
    const o = this.obb();
    if (o !== null) {
      const focus = this.selection.focusId();
      if (focus === null) return;
      this.transform.startResizeObb(focus, anchor, o.localBBox, o.matrix);
      capturePointer(event);
      event.stopPropagation();
      return;
    }

    const b = this._focusBBox();
    if (b === null) return;
    const svg = this.elRef.nativeElement.ownerSVGElement;

    // **Multi-selection → GROUP resize** about the combined bbox `b`.
    // Capture each selected node's ancestor matrix so the shared
    // doc-space anchor projects into each node's own parent frame.
    if (this.selection.count() > 1) {
      const entries = Array.from(this.selection.selectedIds()).map((id) => ({
        id,
        parentMatrix: svg === null ? null : getRenderedParentMatrix(svg, id),
      }));
      this.transform.startResizeMany(entries, anchor, b);
      capturePointer(event);
      event.stopPropagation();
      return;
    }

    // Single selection — capture the node's ancestor matrix so the resize
    // math can adjust the doc-space anchor into the node's parent-local
    // frame; without this, resizing a shape inside a translated/rotated
    // group "drifts". `null` = no ancestor transform / directly under SVG.
    const focus = this.selection.focusId();
    if (focus === null) return;
    const parentMatrix = svg === null ? null : getRenderedParentMatrix(svg, focus);
    this.transform.startResize(focus, anchor, b, parentMatrix);
    capturePointer(event);
    event.stopPropagation();
  }

  // ── Rotation handle interactions ─────────────────────────────────

  protected onRotationHandlePointerDown(event: PointerEvent): void {
    const b = this._focusBBox();
    if (b === null) return;
    const start = this.screenToDoc(event.clientX, event.clientY);
    if (start === null) return;
    const svg = this.elRef.nativeElement.ownerSVGElement;

    // **Multi-selection → GROUP rotation** about the shared pivot (centre of
    // the combined AABB, or a custom multi pivot). Capture each node's
    // ancestor matrix so the shared doc-space pivot projects into each
    // node's own parent frame.
    if (this.selection.count() > 1) {
      const pivot = this.transform.resolvePivot(b);
      const entries = Array.from(this.selection.selectedIds()).map((id) => ({
        id,
        parentMatrix: svg === null ? null : getRenderedParentMatrix(svg, id),
      }));
      this.transform.startRotateMany(entries, pivot, start);
      capturePointer(event);
      event.stopPropagation();
      return;
    }

    const focus = this.selection.focusId();
    if (focus === null) return;
    // **D-142** — resolve the pivot in the node's ORIENTED frame so the
    // gesture rotates about the exact point the crosshair shows (and the
    // custom pivot stays glued to a rotated object). Falls back to the AABB
    // resolution when the OBB isn't available (e.g. not rendered yet); for a
    // non-rotated node the two are identical.
    const obb = svg === null ? null : getRenderedNodeOBB(svg, focus);
    const pivot =
      obb !== null
        ? this.transform.resolvePivotForNode(focus, obb.localBBox, obb.matrix)
        : this.transform.resolvePivot(b);
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

    // **D-141 — oriented keyboard resize**: when the focused node is rotated,
    // nudge the LOCAL handle by (dx, dy) in the node's own frame and project
    // it to doc space, so the OBB gesture scales along the object's rotated
    // axes (consistent with the pointer path). One full gesture = one undo.
    const o = this.obb();
    if (o !== null) {
      const focus = this.selection.focusId();
      if (focus === null) return;
      const lh = allAnchors(o.localBBox)[anchor];
      const targetDoc = applyTransform(o.matrix, lh.x + dx, lh.y + dy);
      this.transform.startResizeObb(focus, anchor, o.localBBox, o.matrix);
      this.transform.updateResizeObb(targetDoc);
      this.transform.endResizeObb();
      return;
    }

    const bbox = this._focusBBox();
    if (bbox === null) return;
    const svg = this.elRef.nativeElement.ownerSVGElement;
    // Synthesize cursor positions: start at the handle's current
    // position, end one step further along (dx, dy). The gesture
    // service computes sx/sy from the delta and pivots on the
    // opposite anchor automatically.
    const anchors = allAnchors(bbox);
    const start = anchors[anchor];
    const target = { x: start.x + dx, y: start.y + dy };

    // **Multi-selection → keyboard GROUP resize** (same gesture API as
    // the pointer path) so arrow-key resize stays consistent with drag.
    if (this.selection.count() > 1) {
      const entries = Array.from(this.selection.selectedIds()).map((id) => ({
        id,
        parentMatrix: svg === null ? null : getRenderedParentMatrix(svg, id),
      }));
      this.transform.startResizeMany(entries, anchor, bbox);
      this.transform.updateResizeMany(target);
      this.transform.endResizeMany();
      return;
    }

    const focus = this.selection.focusId();
    if (focus === null) return;
    const parentMatrix = svg === null ? null : getRenderedParentMatrix(svg, focus);
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
    const bbox = this._focusBBox();
    if (bbox === null) return;
    const angleRad = (deltaDeg * Math.PI) / 180;
    const svg = this.elRef.nativeElement.ownerSVGElement;

    // **Multi-selection → keyboard GROUP rotation** (one RotateNodesCommand
    // = one undo entry), mirroring the pointer path.
    if (this.selection.count() > 1) {
      const pivot = this.transform.resolvePivot(bbox);
      const entries = Array.from(this.selection.selectedIds()).map((id) => ({
        id,
        parentMatrix: svg === null ? null : getRenderedParentMatrix(svg, id),
      }));
      this.bus.dispatch(new RotateNodesCommand(entries, pivot, angleRad));
      return;
    }

    const focus = this.selection.focusId();
    if (focus === null) return;
    // **D-142** — oriented-frame pivot so keyboard rotation matches the
    // crosshair + the pointer path on a rotated object.
    const obb = svg === null ? null : getRenderedNodeOBB(svg, focus);
    const pivot =
      obb !== null
        ? this.transform.resolvePivotForNode(focus, obb.localBBox, obb.matrix)
        : this.transform.resolvePivot(bbox);
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
    else if (ds.kind === 'resize-obb') this.transform.updateResizeObb(point);
    else if (ds.kind === 'resize-many') this.transform.updateResizeMany(point);
    else if (ds.kind === 'rotate') this.transform.updateRotate(point);
    else if (ds.kind === 'rotate-many') this.transform.updateRotateMany(point);
  }

  protected onHandlePointerUp(event: PointerEvent): void {
    const ds = this.transform.dragState();
    if (ds === null) return;
    if (ds.kind === 'resize') this.transform.endResize();
    else if (ds.kind === 'resize-obb') this.transform.endResizeObb();
    else if (ds.kind === 'resize-many') this.transform.endResizeMany();
    else if (ds.kind === 'rotate') this.transform.endRotate();
    else if (ds.kind === 'rotate-many') this.transform.endRotateMany();
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
    const docRoot = this.state.document().root;

    let focusBBox: BoundingBox | null = null;
    if (this.selection.isSingleSelection() && focus !== null) {
      focusBBox = getRenderedNodeBBox(svg, focus);
      // **Text fallback** (bug fix #4 round 2): browsers measure
      // `<text>` asynchronously — getBBox returns 0×0 (and we map that
      // to null) on the same frame the node was inserted, before the
      // font painter has run. _focusBBox=null silently disables the
      // resize/rotation handles, so users see "handles don't work"
      // until a later afterEveryRender catches the measured bbox.
      // To avoid the dead window, ALWAYS estimate a bbox from the
      // model (x/y/fontSize/content) when DOM measurement is missing.
      // The estimate is rough but functional; once the real bbox
      // arrives on a subsequent render, `maybeSet` swaps it in.
      if (focusBBox === null) {
        const node = findNodeById(docRoot, focus);
        if (node !== null && node.type === 'text') {
          focusBBox = estimateTextBBox(docRoot, node as TextNode, focus);
        }
      }
    } else if (ids.size > 1) {
      focusBBox = getCombinedBBox(svg, ids);
    }
    this.maybeSet(this._focusBBox, focusBBox);

    // **D-141** — oriented box source for a single selection. Only the
    // single-selection case carries orientation (a multi-selection's
    // combined box is axis-aligned by definition). `getRenderedNodeOBB`
    // returns the local geometry bbox + the full (own × ancestors) matrix;
    // the `obb()` computed downstream filters out identity-or-translate
    // matrices so non-rotated nodes keep the axis-aligned chrome + bake
    // resize. Guarded by `maybeSetObb` so this afterEveryRender pass does
    // NOT re-trigger itself (the matrix is compared element-wise).
    const obb =
      this.selection.isSingleSelection() && focus !== null ? getRenderedNodeOBB(svg, focus) : null;
    this.maybeSetObb(this._obb, obb);

    const hoverBBox = hover !== null && !ids.has(hover) ? getRenderedNodeBBox(svg, hover) : null;
    this.maybeSet(this._hoverBBox, hoverBBox);

    // **D-094** — key object outline. Only meaningful for a multi-selection
    // (for single selection the key would equal the only object); hidden
    // when the key node is layer-hidden so the accent doesn't float in
    // empty space. `keyObjectId()` already returns null once the key
    // leaves the selection, so this clears itself automatically.
    const keyId = this.keyObject.keyObjectId();
    const keyBBox =
      keyId !== null && ids.size > 1 && !this.layers.hiddenIds().has(keyId)
        ? getRenderedNodeBBox(svg, keyId)
        : null;
    this.maybeSet(this._keyBBox, keyBBox);
  }

  // ── Internal helpers ─────────────────────────────────────────────

  private screenToDoc(clientX: number, clientY: number): Point | null {
    // Delegates to the canonical `screenToDoc` util in svg-engine/render
    // (D-036). The local wrapper resolves `ownerSVGElement` from this
    // overlay's host `<g>` so callers don't need to plumb the SVG ref.
    return screenToDoc(this.elRef.nativeElement.ownerSVGElement, clientX, clientY);
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

  /**
   * Same change-guard as {@link maybeSet} but for the oriented box — compares
   * BOTH the local bbox and the full matrix element-wise. Without this, the
   * `afterEveryRender` re-measure would set `_obb` to a fresh (but equal)
   * object every frame, re-triggering the render and spinning the CPU.
   */
  private maybeSetObb(
    target: { set(v: RenderedOBB | null): void; (): RenderedOBB | null },
    next: RenderedOBB | null,
  ): void {
    const cur = target();
    if (cur === next) return;
    if (cur !== null && next !== null && obbsEqual(cur, next)) return;
    target.set(next);
  }
}

function bboxesEqual(a: BoundingBox, b: BoundingBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function transformsEqual(a: Transform, b: Transform): boolean {
  return (
    a[0] === b[0] &&
    a[1] === b[1] &&
    a[2] === b[2] &&
    a[3] === b[3] &&
    a[4] === b[4] &&
    a[5] === b[5]
  );
}

function obbsEqual(a: RenderedOBB, b: RenderedOBB): boolean {
  return bboxesEqual(a.localBBox, b.localBBox) && transformsEqual(a.matrix, b.matrix);
}

/**
 * Best-effort AABB for a `<text>` node when the browser hasn't measured
 * the glyphs yet (i.e. `getBBox()` returned 0×0). Estimates width from
 * `content.length × fontSize × 0.6` (typical average glyph width for
 * common sans fonts) and height from `lines × fontSize × 1.2` (matches
 * the renderer's `dy="1.2em"` multi-line spacing).
 *
 * **Why not waiting for fonts**: a fresh text node may still measure
 * 0×0 on the same frame it was inserted even when fonts are cached —
 * the SVG painter measures asynchronously. A non-null estimate keeps
 * the resize/rotation handles functional throughout the dead window;
 * `maybeSet` swaps in the precise DOM bbox as soon as it arrives.
 *
 * Composes the node's full ancestor chain (groups it lives inside) so
 * the estimate lands on the rendered position, not on raw `(x, y)`.
 */
function estimateTextBBox(
  root: import('svg-engine/core').GroupNode,
  text: TextNode,
  textId: import('svg-engine/core').NodeId,
): BoundingBox {
  const fontSize = text.fontSize ?? 16;
  const lines = text.content.length === 0 ? [''] : text.content.split('\n');
  const longestLineLen = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const w = Math.max(20, longestLineLen * fontSize * 0.6);
  const h = Math.max(fontSize, lines.length * fontSize * 1.2);
  // SVG `<text>` y is the BASELINE of the first line; the bbox top is
  // roughly 0.8em above the baseline.
  const localX = text.x;
  const localY = text.y - fontSize * 0.8;
  // Project through the ancestor chain so the estimate lands at the
  // visual position when the text is inside a moved/rotated group.
  const m = composeAncestorMatrix(root, textId);
  const tl = applyTransform(m, localX, localY);
  const tr = applyTransform(m, localX + w, localY);
  const bl = applyTransform(m, localX, localY + h);
  const br = applyTransform(m, localX + w, localY + h);
  const minX = Math.min(tl.x, tr.x, bl.x, br.x);
  const minY = Math.min(tl.y, tr.y, bl.y, br.y);
  const maxX = Math.max(tl.x, tr.x, bl.x, br.x);
  const maxY = Math.max(tl.y, tr.y, bl.y, br.y);
  return bbox(minX, minY, maxX - minX, maxY - minY);
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
