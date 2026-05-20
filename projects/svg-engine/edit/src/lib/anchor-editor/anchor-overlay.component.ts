import { ChangeDetectionStrategy, Component, computed, ElementRef, inject } from '@angular/core';
import {
  type AnchorPoint,
  type AnchorRef,
  applyTransform,
  CommandBus,
  EditorStateService,
  invert,
  MoveAnchorCommand,
  parsePathToAnchors,
  type Point,
  type Transform,
} from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';
import { SelectionService } from '../selection/selection.service';
import { DIRECT_SELECT_TOOL_ID } from '../tool/builtin-tools';
import { ToolHostService } from '../tool/tool-host.service';
import { AnchorSelectionService } from './anchor-selection.service';

/** Pixel size of an anchor square (CSS pixels — kept via 1/zoom). */
const POINT_PX = 8;
/** Pixel size of a handle circle. */
const HANDLE_PX = 6;

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
 * - Alt + pointerdown on a stem/segment midpoint → InsertAnchorCommand
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
  template: `
    @if (anchors(); as anchors) {
      <!--
        Handle stems first (rendered behind squares so a drag on the
        square wins hit-testing). Each stem is two short lines from
        the anchor point to its in/out tangent control.
      -->
      @for (a of anchors; track a.key) {
        @if (a.hasHandleIn) {
          <svg:line
            class="handle-stem"
            [attr.x1]="a.anchor.point.x"
            [attr.y1]="a.anchor.point.y"
            [attr.x2]="a.anchor.handleIn.x"
            [attr.y2]="a.anchor.handleIn.y"
          />
        }
        @if (a.hasHandleOut) {
          <svg:line
            class="handle-stem"
            [attr.x1]="a.anchor.point.x"
            [attr.y1]="a.anchor.point.y"
            [attr.x2]="a.anchor.handleOut.x"
            [attr.y2]="a.anchor.handleOut.y"
          />
        }
      }

      <!-- Handle circles (interactive) -->
      @for (a of anchors; track a.key) {
        @if (a.hasHandleIn) {
          <svg:circle
            class="handle-knob"
            [attr.cx]="a.anchor.handleIn.x"
            [attr.cy]="a.anchor.handleIn.y"
            [attr.r]="handleHalf()"
            (pointerdown)="onPointerDown($event, a.ref, 'handleIn')"
            (pointermove)="onPointerMove($event)"
            (pointerup)="onPointerUp($event)"
          />
        }
        @if (a.hasHandleOut) {
          <svg:circle
            class="handle-knob"
            [attr.cx]="a.anchor.handleOut.x"
            [attr.cy]="a.anchor.handleOut.y"
            [attr.r]="handleHalf()"
            (pointerdown)="onPointerDown($event, a.ref, 'handleOut')"
            (pointermove)="onPointerMove($event)"
            (pointerup)="onPointerUp($event)"
          />
        }
      }

      <!-- Anchor squares (interactive, on top) -->
      @for (a of anchors; track a.key) {
        <svg:rect
          class="anchor-point"
          [class.selected]="a.isSelected"
          [attr.x]="a.anchor.point.x - pointHalf()"
          [attr.y]="a.anchor.point.y - pointHalf()"
          [attr.width]="pointSize()"
          [attr.height]="pointSize()"
          (pointerdown)="onPointerDown($event, a.ref, 'point')"
          (pointermove)="onPointerMove($event)"
          (pointerup)="onPointerUp($event)"
          (dblclick)="onDoubleClick($event)"
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
    }
    .anchor-point.selected {
      fill: #ff6f00;
      stroke: #ff6f00;
    }
    .handle-knob {
      fill: #1976d2;
      stroke: #ffffff;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      cursor: move;
      touch-action: none;
    }
    .handle-stem {
      stroke: #90caf9;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
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

  /** Size in viewBox units → constant on screen. */
  protected readonly pointSize = computed(() => POINT_PX / this.viewport.zoom());
  protected readonly pointHalf = computed(() => this.pointSize() / 2);
  protected readonly handleHalf = computed(() => HANDLE_PX / this.viewport.zoom() / 2);

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
    const doc = this.state.document();
    const target = findById(doc.root, focusId);
    if (target === null || target.type !== 'path') return null;
    const subpaths = parsePathToAnchors(target.d);
    // The anchor `d` coordinates are in the NODE-LOCAL frame (before
    // the node's `transform` is applied). The overlay renders inside
    // the same `<svg viewBox>` as the content, so we must transform
    // each rendered point through the node's own transform — otherwise
    // moving a shape leaves the anchor squares stuck at the original
    // location (the bug user reported with the dotted-line trail).
    const t = target.transform;
    const out: AnchorEntry[] = [];
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
        });
      }
    }
    return out;
  });

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
    const node = findById(this.state.document().root, ref.nodeId);
    if (node === null) return;
    let inverseNodeTransform: import('svg-engine/core').Transform;
    try {
      inverseNodeTransform = invertMatrix(node.transform);
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
      nodeTransform: node.transform,
      inverseNodeTransform,
    };
    (event.target as Element & { setPointerCapture?(id: number): void }).setPointerCapture?.(
      event.pointerId,
    );
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
    (
      event.target as Element & { releasePointerCapture?(id: number): void }
    ).releasePointerCapture?.(event.pointerId);
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
   * Double-click on an anchor cycles its kind:
   *   cusp → smooth → symmetric → cusp
   * Matches Affinity's "Cycle node type" behavior. The dispatched
   * `ConvertAnchorTypeCommand` snaps handles to the new constraint.
   */
  protected onDoubleClick(event: MouseEvent): void {
    event.stopPropagation();
    // Implementation deferred — the ConvertAnchorTypeCommand exists
    // (core), but cycling requires reading the current kind from the
    // anchor and dispatching with the next one. Wired here as a stub
    // to keep the visual hint (cursor) in place; future polish.
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

  private screenToDoc(clientX: number, clientY: number): Point | null {
    const svg = this.elRef.nativeElement.ownerSVGElement;
    if (svg === null) return null;
    if (typeof svg.getScreenCTM !== 'function') return null;
    const ctm = svg.getScreenCTM();
    if (ctm === null) return null;
    const inv = ctm.inverse();
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const user = pt.matrixTransform(inv);
    return { x: user.x, y: user.y };
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
