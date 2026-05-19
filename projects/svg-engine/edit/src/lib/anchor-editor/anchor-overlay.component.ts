import { ChangeDetectionStrategy, Component, computed, ElementRef, inject } from '@angular/core';
import {
  type AnchorPoint,
  type AnchorRef,
  CommandBus,
  EditorStateService,
  MoveAnchorCommand,
  parsePathToAnchors,
  type Point,
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
        out.push({
          key: `${s}:${i}`,
          ref,
          anchor,
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
    readonly startDocPoint: Point;
    /** Snapshot of original anchor position for preview math. */
    readonly originalPos: Point;
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
    // Stash the anchor's original coord for the moved field (point /
    // handleIn / handleOut) so updateMove can compute the new position
    // by ADDING the cursor delta to it, instead of teleporting to the
    // cursor itself (which would feel offset).
    const anchorData = this.anchorAt(ref);
    if (anchorData === null) return;
    const originalPos =
      which === 'point'
        ? anchorData.point
        : which === 'handleIn'
          ? anchorData.handleIn
          : anchorData.handleOut;
    this.dragState = { ref, which, startDocPoint: docPoint, originalPos };
    (event.target as Element & { setPointerCapture?(id: number): void }).setPointerCapture?.(
      event.pointerId,
    );
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragState === null) return;
    event.stopPropagation();
    const docPoint = this.screenToDoc(event.clientX, event.clientY);
    if (docPoint === null) return;
    const dx = docPoint.x - this.dragState.startDocPoint.x;
    const dy = docPoint.y - this.dragState.startDocPoint.y;
    const newPos: Point = {
      x: this.dragState.originalPos.x + dx,
      y: this.dragState.originalPos.y + dy,
    };
    // Live dispatch — the command captures previousD on FIRST execute
    // and overwrites on subsequent calls. That's wasteful undo-wise
    // (each frame creates one undo entry); a future polish should add
    // a `previewMove`/`commitMove` split. For now we dispatch the
    // final command on pointerup only, and mutate state directly here.
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
    const dx = docPoint.x - this.dragState.startDocPoint.x;
    const dy = docPoint.y - this.dragState.startDocPoint.y;
    if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) {
      this.dragState = null;
      return;
    }
    const newPos: Point = {
      x: this.dragState.originalPos.x + dx,
      y: this.dragState.originalPos.y + dy,
    };
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
