import { computed, inject, Injectable, signal } from '@angular/core';
import {
  bakeScaleIntoNode,
  CommandBus,
  composeAnchoredScale,
  composePivotRotation,
  EditorStateService,
  findNodeById,
  multiply,
  MoveNodeCommand,
  type NodeId,
  type Point,
  ResizeNodeCommand,
  RotateNodeCommand,
  type SvgNode,
  type Transform,
  translate,
  updateNode,
} from 'svg-engine/core';
import { allAnchors, type BBoxAnchor } from '../geometry/bbox-anchors';
import { LayersService } from '../layers/layers.service';
import { SelectionService } from '../selection/selection.service';

/** Threshold under which a pointer release is treated as a click, not a drag. */
const CLICK_THRESHOLD_DOC_UNITS = 0.5;

/**
 * Snapshot of the active interactive gesture. Discriminated by `kind`.
 * Created by `start*`, mutated by `update*`, cleared by `end*` /
 * `cancelGesture`. The presence of a non-null `dragState` is the signal
 * that tells the playground (and other consumers) "we're inside a drag —
 * do not run hit-testing for hover, do not start another gesture".
 */
export type DragState =
  | {
      readonly kind: 'move';
      readonly nodeId: NodeId;
      readonly startTransform: Transform;
      readonly startPoint: Point;
      currentDelta: Point;
    }
  | {
      readonly kind: 'rotate';
      readonly nodeId: NodeId;
      readonly startTransform: Transform;
      readonly pivot: Point;
      readonly startPoint: Point;
      currentAngleRad: number;
    }
  | {
      readonly kind: 'resize';
      readonly nodeId: NodeId;
      readonly startTransform: Transform;
      /**
       * Full snapshot of the node at gesture start. Required by Bloco
       * 4-Inspector-Polish so `updateResize` can **bake** geometry
       * during the drag (not just compose a scale matrix). On commit
       * or cancel, this snapshot is restored before dispatching the
       * final command — guaranteeing identical end-state semantics
       * regardless of which preview strategy ran per frame.
       */
      readonly startNode: SvgNode;
      /** The fixed point (= the bbox anchor opposite to the dragged handle). */
      readonly anchor: Point;
      /** The initial position of the dragged handle in document coords. */
      readonly handleStart: Point;
      /** Which axes can scale (corners both; edges one only). */
      readonly scaleAxes: { readonly x: boolean; readonly y: boolean };
      currentScale: { readonly sx: number; readonly sy: number };
    };

/**
 * Editor-side transformation state. **Bloco 3** adds interactive gesture
 * management (drag/resize/rotate) on top of the Bloco-2 pivot skeleton.
 *
 * **Pivot model (D-022 Affinity-grade)**:
 * - Default pivot for any selection = center of its bounding box.
 * - Per-node custom pivots in `customPivots` (keyed by `NodeId`),
 *   stored in **node-local** coords so the pivot follows the node.
 * - Multi-selection pivot is transient and resets on composition change.
 *
 * **Gesture model (Bloco 3)**:
 * - `start{Move,Rotate,Resize}`: capture the node's transform snapshot
 *   and seed `dragState`.
 * - `update{Move,Rotate,Resize}`: mutate `EditorStateService.document`
 *   directly for **interactive preview** (no command bus dispatch — that
 *   would pollute the undo stack with one entry per pointer event).
 * - `end{Move,Rotate,Resize}`: revert the document to the pre-gesture
 *   transform, then dispatch a single command via {@link CommandBus} so
 *   the gesture is represented by exactly one undoable step.
 * - `cancelGesture`: revert without dispatching (Esc handler).
 *
 * **Why revert-then-dispatch**: the command's `execute()` captures
 * `previousTransform` at execute time. To make undo restore the
 * pre-gesture state (not the previewed end state), we revert first so
 * the captured "previous" matches what the user expects.
 */
@Injectable({ providedIn: 'root' })
export class TransformService {
  private readonly selection = inject(SelectionService);
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);
  private readonly layers = inject(LayersService);

  // ── Pivot persistence (D-022.persist) ────────────────────────────

  private readonly _customPivots = signal<ReadonlyMap<NodeId, Point>>(new Map());
  private readonly _multiPivotLocal = signal<Point | null>(null);
  private readonly _lastMultiSignature = signal<string>('');

  // ── Gesture state (Bloco 3) ──────────────────────────────────────

  private readonly _dragState = signal<DragState | null>(null);

  readonly customPivots = this._customPivots.asReadonly();
  readonly dragState = this._dragState.asReadonly();
  readonly isDragging = computed(() => this._dragState() !== null);

  /** `'single'` for one-node selection, `'multi'` for many, `'none'` if empty. */
  readonly pivotMode = computed<'none' | 'single' | 'multi'>(() => {
    const n = this.selection.count();
    if (n === 0) return 'none';
    if (n === 1) return 'single';
    return 'multi';
  });

  /**
   * Apaga o pivot transient de multi-seleção quando a **composição** da
   * seleção muda (cardinalidade ou conjunto de IDs).
   */
  syncPivotForSelection(): void {
    const ids = this.selection.selectedIds();
    const signature = computeSelectionSignature(ids);
    if (signature !== this._lastMultiSignature()) {
      this._lastMultiSignature.set(signature);
      this._multiPivotLocal.set(null);
    }
  }

  /** Resolve o pivot atual em coordenadas DO DOCUMENTO. */
  resolvePivot(bbox: { x: number; y: number; width: number; height: number }): Point {
    const mode = this.pivotMode();
    if (mode === 'none') return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };

    const local = mode === 'single' ? this.localPivotForFocus() : this._multiPivotLocal();
    if (local === null) {
      return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
    }
    return localToDoc(local, bbox);
  }

  setPivot(point: Point, bbox: { x: number; y: number; width: number; height: number }): void {
    const local = docToLocal(point, bbox);
    this.storeLocalPivot(local);
  }

  setPivotAnchor(
    anchor: BBoxAnchor,
    bbox: { x: number; y: number; width: number; height: number },
  ): void {
    const point = allAnchors(bbox)[anchor];
    this.setPivot(point, bbox);
  }

  /**
   * Defensive variant of {@link setPivotAnchor} that takes an explicit
   * `nodeId` instead of resolving it from `SelectionService.focusId()`.
   *
   * Useful for synchronous handlers (e.g., popover dot pointer-down)
   * where the caller has captured the focus id at handler entry and
   * wants to commit the pivot regardless of any later selection state
   * changes triggered by event bubbling. Bypasses `pivotMode` checks.
   */
  setPivotAnchorForNode(
    nodeId: NodeId,
    anchor: BBoxAnchor,
    bbox: { x: number; y: number; width: number; height: number },
  ): void {
    const point = allAnchors(bbox)[anchor];
    const local = docToLocal(point, bbox);
    const next = new Map(this._customPivots());
    next.set(nodeId, local);
    this._customPivots.set(next);
  }

  resetPivot(): void {
    const mode = this.pivotMode();
    if (mode === 'single') {
      const focus = this.selection.focusId();
      if (focus === null) return;
      const next = new Map(this._customPivots());
      next.delete(focus);
      this._customPivots.set(next);
    } else if (mode === 'multi') {
      this._multiPivotLocal.set(null);
    }
  }

  clearAllPivots(): void {
    this._customPivots.set(new Map());
    this._multiPivotLocal.set(null);
    this._lastMultiSignature.set('');
  }

  // ── Move gesture ─────────────────────────────────────────────────

  /**
   * Begin a move gesture for `nodeId`. Captures the node's current
   * transform as the snapshot to revert to on cancel/commit. `startPoint`
   * is the pointer position in **document coords** at gesture start.
   */
  startMove(nodeId: NodeId, startPoint: Point): void {
    if (this._dragState() !== null) return;
    if (this.layers.isLocked(nodeId)) return; // D-022 lock enforcement (Bloco 4b-Lock)
    const node = findNodeById(this.state.document().root, nodeId);
    if (node === null) return;
    this._dragState.set({
      kind: 'move',
      nodeId,
      startTransform: node.transform,
      startPoint,
      currentDelta: { x: 0, y: 0 },
    });
  }

  /**
   * Update an in-progress move gesture. `currentPoint` is the current
   * pointer position in **document coords**. Mutates state directly
   * (preview); no command dispatched.
   */
  updateMove(currentPoint: Point): void {
    const ds = this._dragState();
    if (ds === null || ds.kind !== 'move') return;
    const dx = currentPoint.x - ds.startPoint.x;
    const dy = currentPoint.y - ds.startPoint.y;
    const newTransform = multiply(translate(dx, dy), ds.startTransform);
    this.applyPreviewTransform(ds.nodeId, newTransform);
    ds.currentDelta = { x: dx, y: dy };
  }

  /**
   * Finish a move gesture. Reverts the preview, then dispatches a
   * {@link MoveNodeCommand} for the final delta — single undo entry.
   * A negligible delta (below {@link CLICK_THRESHOLD_DOC_UNITS}) is
   * treated as a no-op (click without drag).
   */
  endMove(): void {
    const ds = this._dragState();
    if (ds === null || ds.kind !== 'move') return;
    const { nodeId, startTransform, currentDelta } = ds;
    this._dragState.set(null);
    this.applyPreviewTransform(nodeId, startTransform);
    if (
      Math.abs(currentDelta.x) < CLICK_THRESHOLD_DOC_UNITS &&
      Math.abs(currentDelta.y) < CLICK_THRESHOLD_DOC_UNITS
    ) {
      return;
    }
    this.bus.dispatch(new MoveNodeCommand(nodeId, currentDelta.x, currentDelta.y));
  }

  // ── Rotate gesture ───────────────────────────────────────────────

  /**
   * Begin a rotation gesture. `pivot` is the rotation pivot in document
   * coords (typically the user-edited pivot from the
   * `<svge-rotation-pivot>` overlay). `startPoint` is the pointer
   * position at gesture start.
   */
  startRotate(nodeId: NodeId, pivot: Point, startPoint: Point): void {
    if (this._dragState() !== null) return;
    if (this.layers.isLocked(nodeId)) return; // D-022 lock enforcement (Bloco 4b-Lock)
    const node = findNodeById(this.state.document().root, nodeId);
    if (node === null) return;
    this._dragState.set({
      kind: 'rotate',
      nodeId,
      startTransform: node.transform,
      pivot,
      startPoint,
      currentAngleRad: 0,
    });
  }

  /** Update an in-progress rotation gesture using the current pointer position. */
  updateRotate(currentPoint: Point): void {
    const ds = this._dragState();
    if (ds === null || ds.kind !== 'rotate') return;
    const startAngle = Math.atan2(ds.startPoint.y - ds.pivot.y, ds.startPoint.x - ds.pivot.x);
    const currentAngle = Math.atan2(currentPoint.y - ds.pivot.y, currentPoint.x - ds.pivot.x);
    const angleRad = currentAngle - startAngle;
    const newTransform = composePivotRotation(ds.startTransform, angleRad, ds.pivot);
    this.applyPreviewTransform(ds.nodeId, newTransform);
    ds.currentAngleRad = angleRad;
  }

  endRotate(): void {
    const ds = this._dragState();
    if (ds === null || ds.kind !== 'rotate') return;
    const { nodeId, startTransform, pivot, currentAngleRad } = ds;
    this._dragState.set(null);
    this.applyPreviewTransform(nodeId, startTransform);
    if (Math.abs(currentAngleRad) < 1e-4) return;
    this.bus.dispatch(new RotateNodeCommand(nodeId, currentAngleRad, pivot));
  }

  // ── Resize gesture ───────────────────────────────────────────────

  /**
   * Begin a resize gesture. `bbox` is the bounding box of the node
   * **before** the gesture, in document coords. `handle` identifies
   * which of the 8 resize anchors the user grabbed; the **opposite**
   * anchor becomes the fixed scaling pivot.
   *
   * Edge handles (TC, BC, ML, MR) constrain scaling to a single axis;
   * corner handles (TL, TR, BL, BR) scale both axes independently.
   */
  startResize(
    nodeId: NodeId,
    handle: Exclude<BBoxAnchor, 'mc'>,
    bbox: { x: number; y: number; width: number; height: number },
  ): void {
    if (this._dragState() !== null) return;
    if (this.layers.isLocked(nodeId)) return; // D-022 lock enforcement (Bloco 4b-Lock)
    const node = findNodeById(this.state.document().root, nodeId);
    if (node === null) return;
    const anchors = allAnchors(bbox);
    const opposite = OPPOSITE_ANCHOR[handle];
    this._dragState.set({
      kind: 'resize',
      nodeId,
      startTransform: node.transform,
      startNode: node, // full snapshot — enables real-time bake during drag
      anchor: anchors[opposite],
      handleStart: anchors[handle],
      scaleAxes: SCALE_AXES_FOR_HANDLE[handle],
      currentScale: { sx: 1, sy: 1 },
    });
  }

  /**
   * Update an in-progress resize gesture.
   *
   * **Bloco 4-Inspector-Polish**: previews via **geometry bake** (when
   * the node's start-transform is identity-or-translate), so the
   * inspector's `width`/`height`/`x`/`y` fields update **in real time**
   * during the drag. For rotated/skewed nodes the bake returns `null`
   * and we fall back to composing a scale matrix into the transform
   * (the previous behavior — `<svge-renderer>` directives have
   * `vector-effect="non-scaling-stroke"` so stroke still won't distort).
   *
   * The bake is always computed from `startNode` (not from the previous
   * frame's preview), so the result is the same as if the user had
   * dragged directly to `currentPoint` — no accumulation drift.
   */
  updateResize(currentPoint: Point): void {
    const ds = this._dragState();
    if (ds === null || ds.kind !== 'resize') return;
    const { anchor, handleStart, scaleAxes, startNode } = ds;
    const denomX = handleStart.x - anchor.x;
    const denomY = handleStart.y - anchor.y;
    const sx = scaleAxes.x && denomX !== 0 ? (currentPoint.x - anchor.x) / denomX : 1;
    const sy = scaleAxes.y && denomY !== 0 ? (currentPoint.y - anchor.y) / denomY : 1;
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;

    const baked = bakeScaleIntoNode(startNode, sx, sy, anchor);
    if (baked !== null) {
      this.applyPreviewNode(ds.nodeId, baked);
    } else {
      // Fallback (rotated/skewed): legacy scale-transform composition;
      // stroke distortion mitigated by `vector-effect="non-scaling-stroke"`.
      const newTransform = composeAnchoredScale(startNode.transform, sx, sy, anchor);
      this.applyPreviewTransform(ds.nodeId, newTransform);
    }
    ds.currentScale = { sx, sy };
  }

  endResize(): void {
    const ds = this._dragState();
    if (ds === null || ds.kind !== 'resize') return;
    const { nodeId, startNode, anchor, currentScale } = ds;
    this._dragState.set(null);
    // Full revert to startNode (geometry + transform) — necessary because
    // `updateResize` may have baked geometry in addition to (or instead
    // of) mutating the transform. The dispatched command re-applies the
    // final scale from this clean baseline.
    this.applyPreviewNode(nodeId, startNode);
    if (Math.abs(currentScale.sx - 1) < 1e-4 && Math.abs(currentScale.sy - 1) < 1e-4) return;
    this.bus.dispatch(new ResizeNodeCommand(nodeId, anchor, currentScale.sx, currentScale.sy));
  }

  // ── Cancel + helpers ─────────────────────────────────────────────

  /**
   * Abort any in-progress gesture, restoring the pre-gesture state
   * without dispatching a command. Wired to Esc in the playground.
   *
   * For `resize` we restore the full `startNode` (Bloco 4-Inspector-Polish
   * may have baked geometry mid-drag); for `move` / `rotate` only the
   * transform changed, so restoring `startTransform` is sufficient.
   */
  cancelGesture(): void {
    const ds = this._dragState();
    if (ds === null) return;
    if (ds.kind === 'resize') {
      this.applyPreviewNode(ds.nodeId, ds.startNode);
    } else {
      this.applyPreviewTransform(ds.nodeId, ds.startTransform);
    }
    this._dragState.set(null);
  }

  /**
   * Replace the entire node in state with `node` (same id). Used by
   * `updateResize` for live bake during drag, and by `endResize` /
   * `cancelGesture` to revert the resize preview to its start snapshot.
   * Like `applyPreviewTransform`, this bypasses the command bus — it's
   * a transient preview that the resize gesture's commit step replays
   * via a proper `ResizeNodeCommand` dispatch.
   */
  private applyPreviewNode(nodeId: NodeId, node: SvgNode): void {
    const doc = this.state.document();
    const nextRoot = updateNode<SvgNode>(doc.root, nodeId, () => node);
    if (nextRoot === doc.root) return;
    this.state.setDocument({ ...doc, root: nextRoot });
  }

  private applyPreviewTransform(nodeId: NodeId, transform: Transform): void {
    const doc = this.state.document();
    const nextRoot = updateNode<SvgNode>(doc.root, nodeId, (n) => ({ ...n, transform }));
    if (nextRoot === doc.root) return;
    this.state.setDocument({ ...doc, root: nextRoot });
  }

  private storeLocalPivot(local: Point): void {
    const mode = this.pivotMode();
    if (mode === 'single') {
      const focus = this.selection.focusId();
      if (focus === null) return;
      const next = new Map(this._customPivots());
      next.set(focus, local);
      this._customPivots.set(next);
    } else if (mode === 'multi') {
      this._multiPivotLocal.set(local);
    }
  }

  private localPivotForFocus(): Point | null {
    const focus = this.selection.focusId();
    if (focus === null) return null;
    return this._customPivots().get(focus) ?? null;
  }
}

/** Map of each non-center anchor to its opposite (scaling pivot). */
const OPPOSITE_ANCHOR: Readonly<Record<Exclude<BBoxAnchor, 'mc'>, BBoxAnchor>> = {
  tl: 'br',
  tc: 'bc',
  tr: 'bl',
  ml: 'mr',
  mr: 'ml',
  bl: 'tr',
  bc: 'tc',
  br: 'tl',
} as const;

/** Which axes are free to scale per handle: corners scale both, edges one only. */
const SCALE_AXES_FOR_HANDLE: Readonly<
  Record<Exclude<BBoxAnchor, 'mc'>, { readonly x: boolean; readonly y: boolean }>
> = {
  tl: { x: true, y: true },
  tr: { x: true, y: true },
  bl: { x: true, y: true },
  br: { x: true, y: true },
  tc: { x: false, y: true },
  bc: { x: false, y: true },
  ml: { x: true, y: false },
  mr: { x: true, y: false },
} as const;

function computeSelectionSignature(ids: ReadonlySet<NodeId>): string {
  if (ids.size === 0) return '';
  return Array.from(ids).sort().join('|');
}

function docToLocal(
  point: Point,
  bbox: { x: number; y: number; width: number; height: number },
): Point {
  if (bbox.width === 0 || bbox.height === 0) return { x: 0.5, y: 0.5 };
  return {
    x: (point.x - bbox.x) / bbox.width,
    y: (point.y - bbox.y) / bbox.height,
  };
}

function localToDoc(
  local: Point,
  bbox: { x: number; y: number; width: number; height: number },
): Point {
  return {
    x: bbox.x + local.x * bbox.width,
    y: bbox.y + local.y * bbox.height,
  };
}
