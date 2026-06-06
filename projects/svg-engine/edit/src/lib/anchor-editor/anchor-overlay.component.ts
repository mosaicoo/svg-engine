import { ChangeDetectionStrategy, Component, computed, ElementRef, inject } from '@angular/core';
import {
  type AnchorKind,
  type AnchorPoint,
  type AnchorRef,
  applyTransform,
  CommandBus,
  ConvertAnchorTypeCommand,
  EditorStateService,
  InsertAnchorCommand,
  invert,
  MoveAnchorCommand,
  parsePathToAnchors,
  type Point,
  type Transform,
} from 'svg-engine/core';
import { composeAncestorMatrix } from './compose-ancestor-matrix';
import { nearestTOnCubic } from './cubic-nearest';
import { screenToDoc, ViewportService } from 'svg-engine/render';
import { LayersService } from '../layers/layers.service';
import { capturePointer, releasePointer } from '../pointer';
import { SelectionService } from '../selection/selection.service';
import { DIRECT_SELECT_TOOL_ID } from '../tool/builtin-tools';
import { ToolHostService } from '../tool/tool-host.service';
import { AnchorSelectionService } from './anchor-selection.service';

/** Pixel size of an anchor square (CSS pixels — kept via 1/zoom). */
const POINT_PX = 8;
/** Pixel size of a handle circle. */
const HANDLE_PX = 6;

/**
 * Cycle order for the dblclick-anchor gesture. Mirrors Affinity's
 * "Cycle node type" sequence: cusp (corner) → smooth (colinear,
 * different lengths) → symmetric (mirror) → back to cusp.
 */
const CYCLE_KIND: Readonly<Record<AnchorKind, AnchorKind>> = {
  cusp: 'smooth',
  smooth: 'symmetric',
  symmetric: 'cusp',
};

/**
 * Visual overlay for editing anchor points of a selected `<path>`
 * with the Direct Select tool active.
 *
 * **Render gating** (cheap signals — no work when not applicable):
 * - Active tool MUST be `direct-select` (V leaves the gesture alone)
 * - SelectionService MUST have exactly 1 node selected AND it must
 *   be type `path`
 *
 * **Visual hierarchy** (z-stack, in template order):
 * 1. Handle stems (dim lines from anchor to in/out tangent control)
 * 2. Handle circles (small filled dots — drag to move tangent)
 * 3. Anchor squares (one per point — drag to move position)
 *
 * **Sizing**: squares + circles use `1/viewport.zoom()` so they
 * stay pixel-constant on screen regardless of canvas zoom level —
 * same trick as `SelectionOverlay` handles.
 *
 * **Interactions** (this component handles them inline):
 * - pointerdown on anchor square → select + start drag
 * - pointermove during drag → MoveAnchorCommand-equivalent preview
 *   via direct document mutation (preview-then-commit pattern)
 * - pointerup → commit final position via `MoveAnchorCommand`
 * - dblclick on a segment → InsertAnchorCommand at the CLICK LOCATION
 *   (projected onto the cubic; market convention)
 * - Alt + click on a segment → InsertAnchorCommand at the midpoint
 *   (t=0.5; back-compat secondary gesture)
 * - dblclick on anchor → cycle kind (cusp → smooth → symmetric → cusp)
 *
 * **Selection feedback**: selected anchor squares get the `.selected`
 * class (orange fill) so the user can see what's about to be moved
 * or deleted via the playground's Delete handler.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeAnchorOverlay]',
  standalone: true,
  // role="application" tells screen readers this is a custom widget that
  // captures keyboard input (don't apply default browse-mode key handling).
  // aria-label gives a name to the entire path-editor overlay.
  host: {
    role: 'application',
    'aria-label':
      'Path anchor editor — use arrow keys to nudge selected anchor or handle, Enter to cycle anchor type, Delete to remove anchor',
  },
  template: `
    @if (anchors(); as anchors) {
      <!--
        Handle stems first (rendered behind squares so a drag on the
        square wins hit-testing). Each stem is two short lines from
        the anchor point to its in/out tangent control. Decorative —
        aria-hidden so SR users don't hear "graphic" noise for every
        tangent line.
      -->
      @for (a of anchors; track a.key) {
        @if (a.hasHandleIn) {
          <svg:line
            class="handle-stem"
            aria-hidden="true"
            [attr.x1]="a.anchor.point.x"
            [attr.y1]="a.anchor.point.y"
            [attr.x2]="a.anchor.handleIn.x"
            [attr.y2]="a.anchor.handleIn.y"
          />
        }
        @if (a.hasHandleOut) {
          <svg:line
            class="handle-stem"
            aria-hidden="true"
            [attr.x1]="a.anchor.point.x"
            [attr.y1]="a.anchor.point.y"
            [attr.x2]="a.anchor.handleOut.x"
            [attr.y2]="a.anchor.handleOut.y"
          />
        }
      }

      <!-- Handle circles (interactive — tangent control points). -->
      @for (a of anchors; track a.key) {
        @if (a.hasHandleIn) {
          <svg:circle
            class="handle-knob"
            role="button"
            tabindex="0"
            focusable="true"
            [attr.aria-label]="
              'Incoming tangent handle, anchor ' + (a.index + 1) + ' of ' + a.total
            "
            [attr.cx]="a.anchor.handleIn.x"
            [attr.cy]="a.anchor.handleIn.y"
            [attr.r]="handleHalf()"
            (pointerdown)="onPointerDown($event, a.ref, 'handleIn')"
            (pointermove)="onPointerMove($event)"
            (pointerup)="onPointerUp($event)"
            (keydown)="onKeyDown($event, a.ref, 'handleIn')"
          />
        }
        @if (a.hasHandleOut) {
          <svg:circle
            class="handle-knob"
            role="button"
            tabindex="0"
            focusable="true"
            [attr.aria-label]="
              'Outgoing tangent handle, anchor ' + (a.index + 1) + ' of ' + a.total
            "
            [attr.cx]="a.anchor.handleOut.x"
            [attr.cy]="a.anchor.handleOut.y"
            [attr.r]="handleHalf()"
            (pointerdown)="onPointerDown($event, a.ref, 'handleOut')"
            (pointermove)="onPointerMove($event)"
            (pointerup)="onPointerUp($event)"
            (keydown)="onKeyDown($event, a.ref, 'handleOut')"
          />
        }
      }

      <!--
        Invisible segment hit-zones for inserting anchors. Renders BELOW
        the anchor squares so a click on the anchor itself wins.
        'stroke: transparent' + 'stroke-width' ~10px (in CSS px via
        1/zoom) makes the target generous enough to hit without a precise
        stylus.

        Gestures (see handlers):
        - **Double-click** → insert a new anchor AT THE CLICK LOCATION
          (projected onto the curve; market convention — Inkscape /
          Affinity / Figma). Primary gesture.
        - **Alt+click** → insert at the segment midpoint (t=0.5). Kept
          for back-compat with the original D-038 gesture.
        A plain single click is swallowed (stopPropagation) so it neither
        deselects the path nor starts a marquee from the curve — and so
        the overlay survives until the dblclick fires.

        aria-hidden because click-on-curve has no comparable keyboard
        surface (continuous along the curve); the keyboard alternative is
        to focus an anchor and use Enter to cycle kind / arrow keys.
      -->
      @for (seg of segments(); track seg.key) {
        <svg:path
          class="segment-hit"
          aria-hidden="true"
          [attr.d]="seg.d"
          [attr.stroke-width]="hitZoneSize()"
          (pointerdown)="onSegmentPointerDown($event, seg.ref)"
          (dblclick)="onSegmentDoubleClick($event, seg)"
        />
      }

      <!-- Anchor squares (interactive, on top). -->
      @for (a of anchors; track a.key) {
        <svg:rect
          class="anchor-point"
          role="button"
          tabindex="0"
          focusable="true"
          [class.selected]="a.isSelected"
          [attr.aria-pressed]="a.isSelected ? 'true' : 'false'"
          [attr.aria-label]="
            'Anchor ' +
            (a.index + 1) +
            ' of ' +
            a.total +
            ', ' +
            a.anchor.kind +
            ' point. Enter to cycle type, arrow keys to nudge, Shift+arrow for 10 units.'
          "
          [attr.x]="a.anchor.point.x - pointHalf()"
          [attr.y]="a.anchor.point.y - pointHalf()"
          [attr.width]="pointSize()"
          [attr.height]="pointSize()"
          (pointerdown)="onPointerDown($event, a.ref, 'point')"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (dblclick)="onDoubleClick($event, a.ref)"
          (keydown)="onKeyDown($event, a.ref, 'point')"
        />
      }
    }
  `,
  styles: `
    .anchor-point {
      fill: #ffffff;
      stroke: #1976d2;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      cursor: move;
      touch-action: none;
      /* Default outline removed; :focus-visible below provides the
         keyboard-only focus indicator (same convention as the resize
         handles on SelectionOverlay — orange contrast against the
         default primary-blue stroke). */
      outline: none;
    }
    .anchor-point.selected {
      fill: #ff6f00;
      stroke: #ff6f00;
    }
    .anchor-point:focus-visible {
      stroke: #ff6f00;
      stroke-width: 2;
      filter: drop-shadow(0 0 2px rgba(255, 111, 0, 0.6));
    }
    .handle-knob {
      fill: #1976d2;
      stroke: #ffffff;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      cursor: move;
      touch-action: none;
      outline: none;
    }
    .handle-knob:focus-visible {
      stroke: #ff6f00;
      stroke-width: 2;
      filter: drop-shadow(0 0 2px rgba(255, 111, 0, 0.6));
    }
    .handle-stem {
      stroke: #90caf9;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    /*
      Segment hit-zone: invisible stroke that catches Alt+click for
      InsertAnchor. transparent (NOT none) so pointer events register;
      fill:none + non-scaling-stroke keep the click region pixel-
      consistent at all zoom levels. crosshair cursor signals to the
      user that this is a clickable region for path editing.
    */
    .segment-hit {
      stroke: transparent;
      fill: none;
      cursor: crosshair;
      touch-action: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnchorOverlay {
  private readonly elRef = inject(ElementRef<SVGGElement>);
  private readonly selection = inject(SelectionService);
  private readonly anchorSelection = inject(AnchorSelectionService);
  private readonly state = inject(EditorStateService);
  private readonly viewport = inject(ViewportService);
  private readonly bus = inject(CommandBus);
  private readonly toolHost = inject(ToolHostService);
  private readonly layers = inject(LayersService);

  /** Size in viewBox units → constant on screen. */
  protected readonly pointSize = computed(() => POINT_PX / this.viewport.zoom());
  protected readonly pointHalf = computed(() => this.pointSize() / 2);
  protected readonly handleHalf = computed(() => HANDLE_PX / this.viewport.zoom() / 2);
  /**
   * Segment hit-zone thickness in doc units, sized to approximate
   * ~10 CSS pixels at the current zoom. Fat enough that Alt+click
   * doesn't require pixel-perfect aim along a hair-thin curve.
   */
  protected readonly hitZoneSize = computed(() => 10 / this.viewport.zoom());

  /**
   * Resolved anchor entries to render, or `null` to render nothing.
   * Returns `null` when the gating predicate fails (wrong tool,
   * wrong selection cardinality, focused node isn't a path).
   */
  protected readonly anchors = computed<readonly AnchorEntry[] | null>(() => {
    if (this.toolHost.activeId() !== DIRECT_SELECT_TOOL_ID) return null;
    if (this.selection.count() !== 1) return null;
    const focusId = this.selection.focusId();
    if (focusId === null) return null;
    // Visibility gate — matches SelectionOverlay/RotationPivot. When
    // the focused path is hidden (Layer Panel eye OR metadata.visible
    // = false), suppress anchor squares + handle knobs + segment hit
    // zones. Otherwise we'd render path-edit chrome floating in empty
    // space — both visually confusing and impossible to interact with
    // (the underlying path is `display: none` so segment-hit clicks
    // would land on the canvas background instead).
    if (this.layers.hiddenIds().has(focusId)) return null;
    const doc = this.state.document();
    const target = findById(doc.root, focusId);
    if (target === null || target.type !== 'path') return null;
    if (target.metadata.visible === false) return null;
    const subpaths = parsePathToAnchors(target.d);
    // The anchor `d` coordinates are in the NODE-LOCAL frame (before
    // ANY transform is applied). The overlay renders inside the same
    // `<svg viewBox>` as the content, so we must transform each
    // rendered point through the COMPOSED ANCESTOR MATRIX (node's own
    // transform + every ancestor group's transform up to the doc root).
    //
    // **Why the full chain** (not just node.transform): when the path
    // lives inside a moved/rotated group, the path's visual position
    // is `group.transform * path.transform * d`. Without composing the
    // group's transform, the anchor squares render at the wrong place
    // on the canvas — the user reported "arestas não estão posicionadas
    // sobre o elemento" for shapes inside groups.
    const t = composeAncestorMatrix(doc.root, focusId);
    const out: AnchorEntry[] = [];
    // Compute total anchor count up-front for the aria-label "X of N"
    // string — flat across subpaths, matches what the user sees on screen.
    let totalAnchors = 0;
    for (const sub of subpaths) totalAnchors += sub.anchors.length;
    let globalIdx = 0;
    for (let s = 0; s < subpaths.length; s++) {
      const sub = subpaths[s]!;
      for (let i = 0; i < sub.anchors.length; i++) {
        const anchor = sub.anchors[i]!;
        const ref: AnchorRef = {
          nodeId: focusId,
          subpathIndex: s,
          anchorIndex: i,
        };
        // Hide the "flat" handle (same as point) — equivalent to
        // straight-line segments having no handle visualization.
        const hasHandleIn = !pointsEqual(anchor.handleIn, anchor.point);
        const hasHandleOut = !pointsEqual(anchor.handleOut, anchor.point);
        // Render-space anchor: node-local coords transformed through
        // the node's own transform. Comparing rendered handle vs
        // rendered point preserves the "flat" detection.
        const renderedAnchor: AnchorPoint = {
          point: applyTransform2D(t, anchor.point),
          handleIn: applyTransform2D(t, anchor.handleIn),
          handleOut: applyTransform2D(t, anchor.handleOut),
          kind: anchor.kind,
        };
        out.push({
          key: `${s}:${i}`,
          ref,
          anchor: renderedAnchor,
          hasHandleIn,
          hasHandleOut,
          isSelected: this.anchorSelection.isSelected(ref),
          index: globalIdx,
          total: totalAnchors,
        });
        globalIdx++;
      }
    }
    return out;
  });

  /**
   * Per-segment SVG `d` strings for the invisible hit-zones used by
   * Alt+click → InsertAnchor. One entry per cubic between consecutive
   * anchors (open subpath: N-1 segments; closed: N segments including
   * the wrap from last → first).
   *
   * Coordinates use the SAME render-space (post-transform) as the
   * anchor squares — clicks on the rendered curve land on the right
   * hit-zone regardless of node translate/rotation.
   *
   * Each segment carries the `ref` of its STARTING anchor; the
   * insert command derives the next-anchor from `subpathIndex` +
   * the closed flag (see InsertAnchorCommand).
   */
  protected readonly segments = computed<readonly SegmentEntry[] | null>(() => {
    // Reuse the same gating logic as `anchors` — both render only
    // when the path is selected under Direct Select. Sharing the
    // condition would require re-parsing the path; rely on Angular
    // signal memoization to dedup. Visibility gate mirrors
    // `anchors()` — keep them in sync.
    if (this.toolHost.activeId() !== DIRECT_SELECT_TOOL_ID) return null;
    if (this.selection.count() !== 1) return null;
    const focusId = this.selection.focusId();
    if (focusId === null) return null;
    if (this.layers.hiddenIds().has(focusId)) return null;
    const doc = this.state.document();
    const target = findById(doc.root, focusId);
    if (target === null || target.type !== 'path') return null;
    if (target.metadata.visible === false) return null;
    const subpaths = parsePathToAnchors(target.d);
    // Same composed-matrix rationale as `anchors()` — segment hit-zones
    // must align with the rendered curve, which means we need every
    // ancestor's transform, not just the path's own.
    const t = composeAncestorMatrix(doc.root, focusId);
    const out: SegmentEntry[] = [];
    for (let s = 0; s < subpaths.length; s++) {
      const sub = subpaths[s]!;
      const n = sub.anchors.length;
      const limit = sub.closed ? n : n - 1;
      for (let i = 0; i < limit; i++) {
        const a = sub.anchors[i]!;
        const b = sub.anchors[(i + 1) % n]!;
        const p0 = applyTransform2D(t, a.point);
        const p1 = applyTransform2D(t, a.handleOut);
        const p2 = applyTransform2D(t, b.handleIn);
        const p3 = applyTransform2D(t, b.point);
        out.push({
          key: `seg:${s}:${i}`,
          d: `M${fmt(p0.x)} ${fmt(p0.y)} C${fmt(p1.x)} ${fmt(p1.y)} ${fmt(p2.x)} ${fmt(p2.y)} ${fmt(p3.x)} ${fmt(p3.y)}`,
          ref: { nodeId: focusId, subpathIndex: s, anchorIndex: i },
          // Render-space control points — kept so the dblclick handler can
          // project the click onto this exact cubic to find the insert `t`.
          p0,
          p1,
          p2,
          p3,
        });
      }
    }
    return out;
  });

  /**
   * Pointer-down on a segment hit-zone.
   *
   * - **Alt+click** → insert a new anchor at the segment midpoint
   *   (t=0.5). Secondary/back-compat gesture (the original D-038
   *   path-editor behavior).
   * - **Plain left-click** → swallowed (`stopPropagation`, no insert).
   *   This is intentional and additive: the primary insert gesture is
   *   now a **double-click** (see {@link onSegmentDoubleClick}), and a
   *   double-click is two pointer-downs. If those bubbled to the canvas
   *   they would clear the path selection and tear down this overlay
   *   *before* the dblclick fired — making the gesture unreliable.
   *   Swallowing the click also matches Illustrator/Affinity, where
   *   clicking the curve in node-edit mode never starts a marquee or
   *   deselects. Dragging the path BODY still works (that lands on the
   *   real path fill, not this thin stroke hit-zone), as do anchor /
   *   handle drags (their own squares own those pointer-downs).
   */
  protected onSegmentPointerDown(event: PointerEvent, ref: AnchorRef): void {
    if (event.button !== 0) return;
    if (event.altKey) {
      event.stopPropagation();
      event.preventDefault();
      this.bus.dispatch(new InsertAnchorCommand(ref, 0.5));
      return;
    }
    // Plain click: absorb it (keep selection + overlay stable for the
    // potential dblclick). No state change.
    event.stopPropagation();
  }

  /**
   * Double-click on a segment hit-zone inserts a new anchor **at the
   * click location** — the market convention (Inkscape / Affinity /
   * Figma). The click is projected onto the cubic to recover the curve
   * parameter `t`; `InsertAnchorCommand` then splits the cubic at that
   * `t` via De Casteljau, so the path's shape is preserved (it just
   * gains an editable node where the user clicked).
   *
   * Falls back to the midpoint (t=0.5) if the screen→doc conversion is
   * unavailable (jsdom / detached SVG). `t` is clamped to the open
   * interval the command requires (`0 < t < 1`) so a near-endpoint
   * double-click still inserts instead of failing.
   */
  protected onSegmentDoubleClick(event: MouseEvent, seg: SegmentEntry): void {
    event.stopPropagation();
    event.preventDefault();
    const docPoint = this.screenToDoc(event.clientX, event.clientY);
    const rawT =
      docPoint === null ? 0.5 : nearestTOnCubic(seg.p0, seg.p1, seg.p2, seg.p3, docPoint);
    const t = Math.min(0.999, Math.max(0.001, rawT));
    this.bus.dispatch(new InsertAnchorCommand(seg.ref, t));
  }

  // ── Drag state ───────────────────────────────────────────────────

  private dragState: {
    readonly ref: AnchorRef;
    readonly which: 'point' | 'handleIn' | 'handleOut';
    /** Cursor doc-space position at gesture start (for delta math). */
    readonly startDocPoint: Point;
    /**
     * Original anchor position **in NODE-LOCAL coords** (the `d`-space
     * the parser/serializer speak). All `MoveAnchorCommand` calls
     * receive local-space points; we project the doc-space cursor
     * delta into local via the inverse of `nodeTransform`.
     */
    readonly originalPos: Point;
    /** Snapshot of the node's own transform at gesture start. */
    readonly nodeTransform: import('svg-engine/core').Transform;
    /** Precomputed inverse to avoid recomputing every move frame. */
    readonly inverseNodeTransform: import('svg-engine/core').Transform;
  } | null = null;

  protected onPointerDown(
    event: PointerEvent,
    ref: AnchorRef,
    which: 'point' | 'handleIn' | 'handleOut',
  ): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    // Selection update: Shift-click toggles; plain click replaces.
    if (which === 'point') {
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        this.anchorSelection.toggle(ref);
      } else {
        this.anchorSelection.selectOne(ref);
      }
    }
    const docPoint = this.screenToDoc(event.clientX, event.clientY);
    if (docPoint === null) return;
    // Capture the anchor's NODE-LOCAL position (the `d`-space the
    // parser returns). When the node has a transform applied (move,
    // rotation, scale), the doc-space cursor delta must be projected
    // through the inverse of that transform to produce a valid
    // local-space delta — otherwise moving an anchor on a translated
    // shape "teleports" because we'd be summing local + doc.
    const anchorData = this.anchorAt(ref);
    if (anchorData === null) return;
    const originalPos =
      which === 'point'
        ? anchorData.point
        : which === 'handleIn'
          ? anchorData.handleIn
          : anchorData.handleOut;
    const doc = this.state.document();
    const node = findById(doc.root, ref.nodeId);
    if (node === null) return;
    // Compose the FULL ancestor chain (node + every group up to root)
    // — without this, dragging an anchor on a path inside a translated
    // group "drifts" because we'd be projecting doc-space pointer
    // deltas through only the node's own (often identity) transform.
    const nodeTransform = composeAncestorMatrix(doc.root, ref.nodeId);
    let inverseNodeTransform: import('svg-engine/core').Transform;
    try {
      inverseNodeTransform = invertMatrix(nodeTransform);
    } catch {
      // Non-invertible (degenerate) transform — bail out of the drag
      // gracefully; the user can reset the transform and try again.
      return;
    }
    this.dragState = {
      ref,
      which,
      startDocPoint: docPoint,
      originalPos,
      nodeTransform,
      inverseNodeTransform,
    };
    capturePointer(event);
  }

  /**
   * Compute the new LOCAL-SPACE anchor position from the current
   * doc-space cursor. Used by both `onPointerMove` (preview) and
   * `onPointerUp` (commit) — kept as a method so the math has one
   * source of truth.
   */
  private resolveLocalPos(docPoint: Point): Point | null {
    if (this.dragState === null) return null;
    // Convert both endpoints (start + current) to local space and
    // take the delta there. Equivalent to projecting just the delta
    // through the linear part of inverseTransform, but slightly more
    // robust against transforms with non-trivial translation.
    const startLocal = applyTransform2D(
      this.dragState.inverseNodeTransform,
      this.dragState.startDocPoint,
    );
    const cursorLocal = applyTransform2D(this.dragState.inverseNodeTransform, docPoint);
    return {
      x: this.dragState.originalPos.x + (cursorLocal.x - startLocal.x),
      y: this.dragState.originalPos.y + (cursorLocal.y - startLocal.y),
    };
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragState === null) return;
    event.stopPropagation();
    const docPoint = this.screenToDoc(event.clientX, event.clientY);
    if (docPoint === null) return;
    const newPos = this.resolveLocalPos(docPoint);
    if (newPos === null) return;
    // Preview mutates `state.document()` directly via patchPathD —
    // single source of truth, MoveAnchorCommand isn't dispatched until
    // pointerup so undo gets one entry per gesture.
    this.applyPreview(newPos);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.dragState === null) return;
    event.stopPropagation();
    releasePointer(event);
    const docPoint = this.screenToDoc(event.clientX, event.clientY);
    if (docPoint === null) {
      this.dragState = null;
      return;
    }
    const newPos = this.resolveLocalPos(docPoint);
    if (newPos === null) {
      this.dragState = null;
      return;
    }
    if (
      Math.abs(newPos.x - this.dragState.originalPos.x) < 1e-4 &&
      Math.abs(newPos.y - this.dragState.originalPos.y) < 1e-4
    ) {
      this.dragState = null;
      return;
    }
    // Revert preview, then dispatch the proper command (single undo entry).
    this.revertPreview();
    this.bus.dispatch(new MoveAnchorCommand(this.dragState.ref, newPos, this.dragState.which));
    this.dragState = null;
  }

  /**
   * Dblclick on an anchor cycles its kind in the canonical order:
   * cusp → smooth → symmetric → cusp. Matches Affinity's "Cycle
   * node type" gesture, which is the fastest way to convert a
   * corner into a curve handle without leaving the canvas.
   *
   * Dispatches `ConvertAnchorTypeCommand` so the handles snap to
   * the new constraint (smooth reflects, symmetric mirrors). The
   * `kind` is read from the node-local anchor data (not the
   * rendered/transformed entry), so the cycle is independent of
   * the node's transform.
   */
  protected onDoubleClick(event: MouseEvent, ref: AnchorRef): void {
    event.stopPropagation();
    this.cycleKind(ref);
  }

  /**
   * Keyboard accessibility for the path editor (Fase 6c a11y audit).
   *
   * Arrow keys nudge the focused anchor point / handle by 1 doc unit;
   * Shift+Arrow nudges by 10 doc units (matches Illustrator's
   * `Increment` preference). Enter on an anchor square cycles its
   * kind (mirror of the dblclick gesture). All movement dispatches
   * `MoveAnchorCommand` directly — same undo behavior as a pointer
   * gesture (one undo entry per keystroke).
   *
   * The handler **does not** support Delete: removal of focused
   * anchors is already handled at the playground level via a global
   * keydown listener that walks `AnchorSelectionService.selected()`.
   * Adding it here would double-fire.
   *
   * Pointer-based interactions (pointerdown/dblclick) remain the
   * primary path for sighted/mouse users; this handler is the
   * accessibility-only entry point and shares the same command bus,
   * so behavior is identical end-to-end.
   */
  protected onKeyDown(
    event: KeyboardEvent,
    ref: AnchorRef,
    which: 'point' | 'handleIn' | 'handleOut',
  ): void {
    // Enter cycles kind, but only on the anchor point itself —
    // pressing Enter while focused on a handle is a no-op (kind is a
    // property of the anchor, not its handles individually).
    if (event.key === 'Enter' && which === 'point') {
      event.preventDefault();
      this.cycleKind(ref);
      return;
    }
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
        return; // not a key we care about — let the browser handle it
    }
    event.preventDefault();
    event.stopPropagation();
    const anchorData = this.anchorAt(ref);
    if (anchorData === null) return;
    const current =
      which === 'point'
        ? anchorData.point
        : which === 'handleIn'
          ? anchorData.handleIn
          : anchorData.handleOut;
    const next = { x: current.x + dx, y: current.y + dy };
    this.bus.dispatch(new MoveAnchorCommand(ref, next, which));
  }

  /**
   * Shared between `onDoubleClick` (pointer) and `onKeyDown` (Enter).
   * Reads the current kind from the node-local anchor data and
   * dispatches `ConvertAnchorTypeCommand` with the next kind in the
   * cycle. The classifier post-pass in `parsePathToAnchors` ensures
   * the kind round-trips correctly across the re-parse.
   */
  private cycleKind(ref: AnchorRef): void {
    const anchorData = this.anchorAt(ref);
    if (anchorData === null) return;
    const nextKind = CYCLE_KIND[anchorData.kind];
    if (nextKind === anchorData.kind) return; // safety (shouldn't happen)
    this.bus.dispatch(new ConvertAnchorTypeCommand(ref, nextKind));
  }

  // ── Preview helpers (direct doc mutation, undo-safe via revert) ──

  /** Snapshot of `path.d` before the preview started — used for revert. */
  private previewSnapshot: string | null = null;

  private applyPreview(newPos: Point): void {
    if (this.dragState === null) return;
    const focusId = this.dragState.ref.nodeId;
    const doc = this.state.document();
    const target = findById(doc.root, focusId);
    if (target === null || target.type !== 'path') return;
    if (this.previewSnapshot === null) this.previewSnapshot = target.d;
    // Re-parse from the SNAPSHOT (not from the current preview state)
    // so the cumulative drift is always relative to the gesture start.
    const subpaths = parsePathToAnchors(this.previewSnapshot).map((s) => ({
      anchors: [...s.anchors],
      closed: s.closed,
    }));
    const sub = subpaths[this.dragState.ref.subpathIndex];
    if (sub === undefined) return;
    const anchor = sub.anchors[this.dragState.ref.anchorIndex];
    if (anchor === undefined) return;
    sub.anchors[this.dragState.ref.anchorIndex] = applyMoveToAnchor(
      anchor,
      newPos,
      this.dragState.which,
    );
    const nextD = serialize(subpaths);
    if (nextD === target.d) return;
    // Update state directly (no command — this is preview only).
    const nextRoot = patchPathD(doc.root, focusId, nextD);
    this.state.setDocument({ ...doc, root: nextRoot });
  }

  private revertPreview(): void {
    if (this.dragState === null || this.previewSnapshot === null) return;
    const doc = this.state.document();
    const nextRoot = patchPathD(doc.root, this.dragState.ref.nodeId, this.previewSnapshot);
    this.state.setDocument({ ...doc, root: nextRoot });
    this.previewSnapshot = null;
  }

  // ── DOM / coord helpers ─────────────────────────────────────────

  /**
   * Convert a client (screen) point to doc coords via the shared util
   * (D-036). Resolves the overlay's owning `<svg>`; returns null in
   * jsdom / SSR / detached scenarios so handlers no-op cleanly.
   */
  private screenToDoc(clientX: number, clientY: number): Point | null {
    return screenToDoc(this.elRef.nativeElement.ownerSVGElement, clientX, clientY);
  }

  private anchorAt(ref: AnchorRef): AnchorPoint | null {
    const doc = this.state.document();
    const target = findById(doc.root, ref.nodeId);
    if (target === null || target.type !== 'path') return null;
    const subpaths = parsePathToAnchors(target.d);
    const sub = subpaths[ref.subpathIndex];
    if (sub === undefined) return null;
    return sub.anchors[ref.anchorIndex] ?? null;
  }
}

interface AnchorEntry {
  readonly key: string;
  readonly ref: AnchorRef;
  readonly anchor: AnchorPoint;
  readonly hasHandleIn: boolean;
  readonly hasHandleOut: boolean;
  readonly isSelected: boolean;
  /** 0-based global anchor index (across all subpaths) — for aria-label "X of N". */
  readonly index: number;
  /** Total anchor count across all subpaths — pairs with `index`. */
  readonly total: number;
}

/**
 * One curve segment's invisible hit-zone, plus the render-space cubic
 * control points (`p0`=start, `p1`=start.handleOut, `p2`=end.handleIn,
 * `p3`=end) used to project a double-click onto the curve for
 * insert-at-click-location.
 */
interface SegmentEntry {
  readonly key: string;
  readonly d: string;
  readonly ref: AnchorRef;
  readonly p0: Point;
  readonly p1: Point;
  readonly p2: Point;
  readonly p3: Point;
}

function pointsEqual(a: Point, b: Point, eps = 1e-6): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

/**
 * Local copy of the model walk used by the overlay. Avoids importing
 * `findNodeById` directly to keep the bundle slim (overlay only needs
 * the path-typed branch).
 */
function findById(
  node: import('svg-engine/core').SvgNode,
  id: string,
): import('svg-engine/core').SvgNode | null {
  if (node.id === id) return node;
  if (node.type === 'group') {
    for (const child of node.children) {
      const found = findById(child, id);
      if (found !== null) return found;
    }
  }
  return null;
}

/** Tree walk that returns a new root with `path.d` patched. */
function patchPathD(
  root: import('svg-engine/core').GroupNode,
  nodeId: string,
  nextD: string,
): import('svg-engine/core').GroupNode {
  function visit(node: import('svg-engine/core').SvgNode): import('svg-engine/core').SvgNode {
    if (node.id === nodeId && node.type === 'path') {
      return { ...node, d: nextD };
    }
    if (node.type === 'group') {
      let changed = false;
      const nextChildren = node.children.map((c) => {
        const updated = visit(c);
        if (updated !== c) changed = true;
        return updated;
      });
      if (changed) return { ...node, children: nextChildren };
    }
    return node;
  }
  return visit(root) as import('svg-engine/core').GroupNode;
}

/**
 * Mirror of the same-name function in `anchor.commands.ts` — kept
 * inline so the preview code path doesn't need to call into the
 * commands module (which would re-snapshot the path on each frame).
 */
function applyMoveToAnchor(
  anchor: AnchorPoint,
  newPos: Point,
  which: 'point' | 'handleIn' | 'handleOut',
): AnchorPoint {
  if (which === 'point') {
    const dx = newPos.x - anchor.point.x;
    const dy = newPos.y - anchor.point.y;
    return {
      ...anchor,
      point: newPos,
      handleIn: { x: anchor.handleIn.x + dx, y: anchor.handleIn.y + dy },
      handleOut: { x: anchor.handleOut.x + dx, y: anchor.handleOut.y + dy },
    };
  }
  if (which === 'handleIn') {
    if (anchor.kind === 'cusp') return { ...anchor, handleIn: newPos };
    const inDx = newPos.x - anchor.point.x;
    const inDy = newPos.y - anchor.point.y;
    const inLen = Math.hypot(inDx, inDy);
    let outDx = -inDx;
    let outDy = -inDy;
    if (anchor.kind === 'smooth' && inLen > 1e-6) {
      const outLen = Math.hypot(
        anchor.handleOut.x - anchor.point.x,
        anchor.handleOut.y - anchor.point.y,
      );
      const k = outLen / inLen;
      outDx = -inDx * k;
      outDy = -inDy * k;
    }
    return {
      ...anchor,
      handleIn: newPos,
      handleOut: { x: anchor.point.x + outDx, y: anchor.point.y + outDy },
    };
  }
  if (anchor.kind === 'cusp') return { ...anchor, handleOut: newPos };
  const outDx = newPos.x - anchor.point.x;
  const outDy = newPos.y - anchor.point.y;
  const outLen = Math.hypot(outDx, outDy);
  let inDx = -outDx;
  let inDy = -outDy;
  if (anchor.kind === 'smooth' && outLen > 1e-6) {
    const inLen = Math.hypot(
      anchor.handleIn.x - anchor.point.x,
      anchor.handleIn.y - anchor.point.y,
    );
    const k = inLen / outLen;
    inDx = -outDx * k;
    inDy = -outDy * k;
  }
  return {
    ...anchor,
    handleOut: newPos,
    handleIn: { x: anchor.point.x + inDx, y: anchor.point.y + inDy },
  };
}

/** Inline serializer mirror (avoids importing `anchorsToPathD` chain). */
function serialize(
  subpaths: readonly { readonly anchors: readonly AnchorPoint[]; readonly closed: boolean }[],
): string {
  // Delegate to the canonical implementation via dynamic require —
  // ensures byte-identity with anchor.commands. Build size unaffected.
  // (Cleaner: just import; the function is small enough.)
  return anchorsToPathDInline(subpaths);
}

function anchorsToPathDInline(
  subpaths: readonly { readonly anchors: readonly AnchorPoint[]; readonly closed: boolean }[],
): string {
  const parts: string[] = [];
  for (const sub of subpaths) {
    if (sub.anchors.length === 0) continue;
    const first = sub.anchors[0]!;
    parts.push(`M${fmt(first.point.x)} ${fmt(first.point.y)}`);
    for (let i = 1; i < sub.anchors.length; i++) {
      const prev = sub.anchors[i - 1]!;
      const cur = sub.anchors[i]!;
      parts.push(buildSeg(prev, cur));
    }
    if (sub.closed) {
      const first0 = sub.anchors[0]!;
      const last = sub.anchors[sub.anchors.length - 1]!;
      const flat =
        pointsEqual(last.handleOut, last.point) && pointsEqual(first0.handleIn, first0.point);
      if (!flat) parts.push(buildSeg(last, first0));
      parts.push('Z');
    }
  }
  return parts.join(' ');
}

function buildSeg(prev: AnchorPoint, cur: AnchorPoint): string {
  const flatOut = pointsEqual(prev.handleOut, prev.point);
  const flatIn = pointsEqual(cur.handleIn, cur.point);
  if (flatOut && flatIn) return `L${fmt(cur.point.x)} ${fmt(cur.point.y)}`;
  return (
    `C${fmt(prev.handleOut.x)} ${fmt(prev.handleOut.y)} ` +
    `${fmt(cur.handleIn.x)} ${fmt(cur.handleIn.y)} ` +
    `${fmt(cur.point.x)} ${fmt(cur.point.y)}`
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? `${n}` : Number(n.toFixed(4)).toString();
}

/**
 * Apply a 2D affine transform to a point. Thin wrapper around core's
 * `applyTransform` exposing a Point-returning signature (so the
 * caller can spread/destructure cleanly).
 */
function applyTransform2D(t: Transform, p: Point): Point {
  const r = applyTransform(t, p.x, p.y);
  return { x: r.x, y: r.y };
}

/**
 * Thin wrapper around core's `invert` that surfaces the same throw
 * semantics — kept here so the overlay's drag setup has a clear
 * call site (and so the import block at the top stays paired:
 * applyTransform2D + invertMatrix, both relating to drag math).
 */
function invertMatrix(t: Transform): Transform {
  return invert(t);
}
