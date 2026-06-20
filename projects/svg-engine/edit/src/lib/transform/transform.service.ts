import { computed, inject, Injectable, signal } from '@angular/core';
import {
  applyTransform,
  bakeScaleIntoNode,
  CommandBus,
  composeAnchoredScale,
  composePivotRotation,
  EditorStateService,
  findNodeById,
  invert,
  multiply,
  MoveNodeCommand,
  type NodeId,
  type Point,
  ResizeNodeCommand,
  ResizeNodesCommand,
  type ResizeNodesEntry,
  RotateNodeCommand,
  RotateNodesCommand,
  type RotateNodesEntry,
  type SvgNode,
  type Transform,
  translate,
  TranslateManyCommand,
  updateNode,
} from 'svg-engine/core';

/**
 * Local copy of `isIdentityOrTranslate` (mirrors the one in
 * `scale-bake.ts`) — kept here to avoid a circular dep on the core
 * geometry module from a service that also imports `bakeScaleIntoNode`.
 * Both versions check the same 4 matrix slots with the same epsilon.
 */
function isIdentityOrTranslateLocal(transform: Transform): boolean {
  const [a, b, c, d] = transform;
  const eps = 1e-9;
  return Math.abs(a - 1) < eps && Math.abs(b) < eps && Math.abs(c) < eps && Math.abs(d - 1) < eps;
}
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
      /**
       * Multi-selection group move (Illustrator/Figma/Affinity convention).
       * When present, the same `(dx, dy)` delta is previewed on these extra
       * nodes too, and the commit dispatches a `MoveNodesCommand` covering
       * `[nodeId, ...extraNodes]` for a single group undo entry.
       *
       * **Additive + optional**: omitted for the 1-node case so every
       * existing `kind === 'move'` consumer (snap-aware move in
       * `[svgeShellInteractions]`) keeps working unchanged — the `kind`
       * stays `'move'`; only the preview/commit fan out to the extras.
       * Each entry carries its own `startTransform` so the per-node preview
       * math is independent (nodes inside rotated groups, etc.).
       */
      readonly extraNodes?: readonly { readonly id: NodeId; readonly startTransform: Transform }[];
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
      /**
       * Composed matrix of the node's ANCESTORS (excluding self) — maps
       * the node's parent-local frame → document space. `null` when the
       * node sits directly under the SVG root. Captured at gesture start
       * via `getRenderedParentMatrix(svgRoot, nodeId)` so resize math
       * inside a translated/rotated group works correctly. Passed to
       * `ResizeNodeCommand` on commit.
       */
      readonly parentMatrix: Transform | null;
      /**
       * When the parent has a rotation/scale (non-identity-or-translate),
       * `updateResize` projects anchor + pointer into the local frame and
       * stashes the projected anchor here for `endResize` to dispatch the
       * command with already-local coords + `parentMatrix=null` (so the
       * command doesn't re-adjust). `null` when the parent is identity-
       * or-translate and the legacy anchor-adjust path is in use.
       */
      bakeLocalAnchor: Point | null;
    }
  | {
      /**
       * **D-141 — OBB resize** (single rotated node). Kept fully separate
       * from the axis-aligned `'resize'` path so the well-tested bake path
       * is untouched. The handle anchors live in the node's LOCAL geometry
       * frame; the pointer is projected through `invMatrix` (doc → local)
       * so scaling happens along the object's OWN axes, and the commit
       * composes the anchored scale onto the right of the node's transform
       * (keeps the rotation — see `ResizeNodeCommand` `localFrame` mode).
       */
      readonly kind: 'resize-obb';
      readonly nodeId: NodeId;
      readonly startTransform: Transform;
      /** Inverse of the node's full matrix (own × ancestors): doc → local. */
      readonly invMatrix: Transform;
      /** Fixed pivot = the local anchor opposite the dragged handle (LOCAL coords). */
      readonly localAnchor: Point;
      /** Dragged handle's local-frame position at gesture start. */
      readonly localHandle: Point;
      /** Which axes scale (corner: both; edge: one). */
      readonly scaleAxes: { readonly x: boolean; readonly y: boolean };
      currentScale: { readonly sx: number; readonly sy: number };
    }
  | {
      /**
       * **Group resize** (multi-selection). A dedicated kind kept fully
       * separate from the single-node `'resize'` so the well-tested
       * geometry-bake path is never touched. Uses the pure matrix
       * approach: the same anchored scale about the shared `anchor`
       * applied to every entry's transform (see `ResizeNodesCommand`).
       */
      readonly kind: 'resize-many';
      /**
       * Each selected node: id + transform snapshot at gesture start +
       * ancestor matrix (lets `composeAnchoredScale` project the shared
       * doc-space anchor into each node's own parent frame).
       */
      readonly entries: readonly {
        readonly id: NodeId;
        readonly startTransform: Transform;
        readonly parentMatrix: Transform | null;
      }[];
      /** Fixed scaling pivot = union-bbox anchor opposite the dragged handle (doc coords). */
      readonly anchor: Point;
      /** Dragged handle's union-bbox corner at gesture start (doc coords). */
      readonly handleStart: Point;
      /** Which axes scale (corner handle: both; edge handle: one). */
      readonly scaleAxes: { readonly x: boolean; readonly y: boolean };
      currentScale: { readonly sx: number; readonly sy: number };
    }
  | {
      /**
       * **Group rotation** (multi-selection). Dedicated kind kept fully
       * separate from the single-node `'rotate'` so that path is never
       * touched. Pure matrix approach: the same pivot rotation about the
       * shared `pivot` applied to every entry's transform (see
       * `RotateNodesCommand`) — the visual result equals grouping +
       * rotating + ungrouping.
       */
      readonly kind: 'rotate-many';
      /**
       * Each selected node: id + transform snapshot at gesture start +
       * ancestor matrix (lets `composePivotRotation` project the shared
       * doc-space pivot into each node's own parent frame).
       */
      readonly entries: readonly {
        readonly id: NodeId;
        readonly startTransform: Transform;
        readonly parentMatrix: Transform | null;
      }[];
      /** Shared rotation pivot = centre of the combined bbox (doc coords). */
      readonly pivot: Point;
      /** Pointer position (doc coords) at gesture start — defines the 0° baseline. */
      readonly startPoint: Point;
      currentAngleRad: number;
    };

/**
 * Editor-side transformation state. **Bloco 3** adds interactive gesture
 * management (drag/resize/rotate) on top of the Bloco-2 pivot skeleton.
 *
 * **Pivot model (D-022 Affinity-grade; D-142 OBB-aware)**:
 * - Default pivot for any selection = center of its bounding box.
 * - Per-node custom pivots in `customPivots` (keyed by `NodeId`), stored as
 *   a **fraction (0..1) of the node's box**.
 * - **Single node** resolves through {@link resolvePivotForNode} /
 *   {@link setPivotDocForNode}: the fraction is interpreted in the node's
 *   LOCAL geometry frame and mapped through its full matrix (own ×
 *   ancestors), so the pivot stays glued to the object and rotates/scales
 *   WITH it. {@link resolvePivot}/{@link setPivot} interpret the same
 *   fraction against an axis-aligned bbox — correct for multi-selection and
 *   non-rotated nodes, but they drift on a rotated node (the AABB is not
 *   stable under rotation), which is why single-node callers use the
 *   OBB-aware pair.
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

  // ── OBB-aware single-node pivot (D-142) ──────────────────────────

  /**
   * **D-142 — OBB-aware pivot resolution for a single node.** Maps the
   * stored pivot (a fraction of the node's box) through the node's full
   * `matrix` (own transform × ancestors) **after** placing it in the
   * node's LOCAL geometry frame (`localBBox`). The result is the pivot in
   * document coordinates, **glued to the object** — it rotates/scales WITH
   * the node.
   *
   * Contrast with {@link resolvePivot}, which interprets the same fraction
   * against an **axis-aligned** bbox: that drifts the moment the node is
   * rotated, because the AABB is not stable under rotation (its corners
   * move and resize as the object turns). This method is the fix for the
   * "rotation pivot doesn't stay where I put it" bug.
   *
   * `localBBox` + `matrix` come from `getRenderedNodeOBB`. With no custom
   * pivot the default is the local-bbox centre — which maps to the object's
   * visual centre under any transform (and equals the AABB centre, since
   * rotation preserves the centre). Used by the rotation-pivot crosshair,
   * the canvas rotation/scale gestures, and the Inspector.
   */
  resolvePivotForNode(
    nodeId: NodeId,
    localBBox: { x: number; y: number; width: number; height: number },
    matrix: Transform,
  ): Point {
    const frac = this._customPivots().get(nodeId) ?? { x: 0.5, y: 0.5 };
    const localPoint = localToDoc(frac, localBBox); // fraction → local-frame point
    return applyTransform(matrix, localPoint.x, localPoint.y);
  }

  /**
   * **D-142** — OBB-aware free placement (inverse of
   * {@link resolvePivotForNode}). Projects a DOCUMENT-space `point` into the
   * node's local frame via `invert(matrix)`, converts it to a fraction of
   * `localBBox`, and stores it for `nodeId`. Because the fraction lives in
   * the object's own frame, the pivot then follows the node through later
   * rotations/scales. No-op if `matrix` is non-invertible (degenerate).
   */
  setPivotDocForNode(
    nodeId: NodeId,
    point: Point,
    localBBox: { x: number; y: number; width: number; height: number },
    matrix: Transform,
  ): void {
    let inv: Transform;
    try {
      inv = invert(matrix);
    } catch {
      return;
    }
    const localPoint = applyTransform(inv, point.x, point.y);
    const frac = docToLocal(localPoint, localBBox);
    const next = new Map(this._customPivots());
    next.set(nodeId, frac);
    this._customPivots.set(next);
  }

  /** **D-142** — restore a previously-captured fraction for `nodeId` (Esc-cancel). */
  setPivotFractionForNode(nodeId: NodeId, fraction: Point): void {
    const next = new Map(this._customPivots());
    next.set(nodeId, fraction);
    this._customPivots.set(next);
  }

  /** **D-142** — remove the custom pivot of a specific node (Esc-cancel to default). */
  clearPivotForNode(nodeId: NodeId): void {
    if (!this._customPivots().has(nodeId)) return;
    const next = new Map(this._customPivots());
    next.delete(nodeId);
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
   * Begin a **group** move gesture for multiple nodes (multi-selection
   * drag — Illustrator/Figma/Affinity/Inkscape: dragging any selected
   * shape moves the whole selection together, no modifier needed).
   *
   * Locked nodes are filtered out (parity with {@link startMove}'s lock
   * guard). Degrades gracefully:
   * - 0 movable nodes → no-op.
   * - 1 movable node → delegates to {@link startMove} (single-node path,
   *   smaller commit, no `extraNodes` overhead).
   * - 2+ movable → seeds a `'move'` drag state with the focus node as the
   *   primary (`nodeId`) and the rest as `extraNodes`. The commit
   *   dispatches one `MoveNodesCommand`.
   *
   * **Primary selection**: the focus id when it's part of the movable set
   * (so snap/preview anchor on the user's "active" node); otherwise the
   * first movable id. The choice is cosmetic — the delta is identical for
   * all nodes — but keeping the focus as primary matches the overlay's
   * focus-driven chrome.
   */
  startMoveMany(nodeIds: readonly NodeId[], startPoint: Point): void {
    if (this._dragState() !== null) return;
    const movable = nodeIds.filter((id) => !this.layers.isLocked(id));
    if (movable.length === 0) return;
    if (movable.length === 1) {
      this.startMove(movable[0]!, startPoint);
      return;
    }
    const root = this.state.document().root;
    const focus = this.selection.focusId();
    const primaryId = focus !== null && movable.includes(focus) ? focus : movable[0]!;
    const primaryNode = findNodeById(root, primaryId);
    if (primaryNode === null) return;
    const extraNodes: { id: NodeId; startTransform: Transform }[] = [];
    for (const id of movable) {
      if (id === primaryId) continue;
      const node = findNodeById(root, id);
      if (node === null) continue;
      extraNodes.push({ id, startTransform: node.transform });
    }
    this._dragState.set({
      kind: 'move',
      nodeId: primaryId,
      startTransform: primaryNode.transform,
      startPoint,
      currentDelta: { x: 0, y: 0 },
      extraNodes,
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
    this.applyPreviewTransform(ds.nodeId, multiply(translate(dx, dy), ds.startTransform));
    // Group move (multi-selection): apply the SAME delta to every extra
    // node, each composed onto its own start transform so nodes inside
    // rotated/translated groups preview correctly.
    if (ds.extraNodes !== undefined) {
      for (const extra of ds.extraNodes) {
        this.applyPreviewTransform(extra.id, multiply(translate(dx, dy), extra.startTransform));
      }
    }
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
    const { nodeId, startTransform, currentDelta, extraNodes } = ds;
    this._dragState.set(null);
    // Revert the preview for the primary AND every extra node before
    // dispatching — the command re-applies the final delta from the
    // clean pre-gesture baseline (revert-then-dispatch invariant so
    // undo restores the pre-gesture state, not the previewed one).
    this.applyPreviewTransform(nodeId, startTransform);
    if (extraNodes !== undefined) {
      for (const extra of extraNodes) {
        this.applyPreviewTransform(extra.id, extra.startTransform);
      }
    }
    if (
      Math.abs(currentDelta.x) < CLICK_THRESHOLD_DOC_UNITS &&
      Math.abs(currentDelta.y) < CLICK_THRESHOLD_DOC_UNITS
    ) {
      return;
    }
    // Single node → MoveNodeCommand (smaller label, no Map). Group move →
    // TranslateManyCommand with the SAME delta for every node, one undo
    // entry for the whole group (Illustrator/Figma/Affinity convention).
    if (extraNodes !== undefined && extraNodes.length > 0) {
      const deltas = new Map<NodeId, Point>();
      deltas.set(nodeId, { x: currentDelta.x, y: currentDelta.y });
      for (const extra of extraNodes) {
        deltas.set(extra.id, { x: currentDelta.x, y: currentDelta.y });
      }
      this.bus.dispatch(new TranslateManyCommand(deltas, `Move ${deltas.size} nodes`));
    } else {
      this.bus.dispatch(new MoveNodeCommand(nodeId, currentDelta.x, currentDelta.y));
    }
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
    /**
     * Composed transform of `nodeId`'s ancestors (excluding self),
     * captured by the caller (typically `SelectionOverlay` via
     * `getRenderedParentMatrix(svgRoot, nodeId)`). Pass `null` (or
     * omit) when the node sits directly under the SVG root or when
     * ancestor adjustment isn't needed.
     *
     * Why the caller captures this and not the service: this service
     * has no `svgRoot` reference (kept DOM-free for headless usage);
     * the overlay already has the SVG element to read transforms
     * from. Backward compatible — callers that don't pass anything
     * preserve the pre-fix behavior.
     */
    parentMatrix: Transform | null = null,
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
      parentMatrix,
      bakeLocalAnchor: null,
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
    const { anchor, handleStart, scaleAxes, startNode, parentMatrix } = ds;

    // **Rotated/scaled parent**: project anchor, handleStart and
    // currentPoint into the parent-local frame BEFORE computing
    // sx/sy. Without this, sx/sy computed in doc-space don't map
    // onto the rotated local axes — the resize would "shear" the
    // shape (left edge moves when right handle is dragged). See
    // backlog item "Resize transform-aware em grupo rotacionado".
    const useLocalFrame = parentMatrix !== null && !isIdentityOrTranslateLocal(parentMatrix);
    let anchorEff: Point = anchor;
    let handleStartEff: Point = handleStart;
    let currentPointEff: Point = currentPoint;
    if (useLocalFrame && parentMatrix !== null) {
      let parentInv: Transform;
      try {
        parentInv = invert(parentMatrix);
      } catch {
        // Non-invertible parent — bail to legacy fallback (geometry
        // stays unchanged this frame; preview safely no-ops).
        return;
      }
      anchorEff = applyTransform(parentInv, anchor.x, anchor.y);
      handleStartEff = applyTransform(parentInv, handleStart.x, handleStart.y);
      currentPointEff = applyTransform(parentInv, currentPoint.x, currentPoint.y);
    }

    const denomX = handleStartEff.x - anchorEff.x;
    const denomY = handleStartEff.y - anchorEff.y;
    const sx = scaleAxes.x && denomX !== 0 ? (currentPointEff.x - anchorEff.x) / denomX : 1;
    const sy = scaleAxes.y && denomY !== 0 ? (currentPointEff.y - anchorEff.y) / denomY : 1;
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;

    // Bake uses the LOCAL anchor when in local-frame mode (parentMatrix
    // is set to null below because we already projected); otherwise the
    // legacy translate-only adjust in bakeScaleIntoNode handles it.
    const bakeAnchor = useLocalFrame ? anchorEff : anchor;
    const bakeParentMatrix = useLocalFrame ? null : parentMatrix;
    const baked = bakeScaleIntoNode(startNode, sx, sy, bakeAnchor, bakeParentMatrix);
    if (baked !== null) {
      this.applyPreviewNode(ds.nodeId, baked);
    } else {
      // Fallback (rotated/skewed NODE — distinct from rotated parent):
      // legacy scale-transform composition. Stroke distortion mitigated
      // by `vector-effect="non-scaling-stroke"` in renderer directives.
      const newTransform = composeAnchoredScale(startNode.transform, sx, sy, anchor);
      this.applyPreviewTransform(ds.nodeId, newTransform);
    }
    ds.currentScale = { sx, sy };
    ds.bakeLocalAnchor = useLocalFrame ? bakeAnchor : null;
  }

  endResize(): void {
    const ds = this._dragState();
    if (ds === null || ds.kind !== 'resize') return;
    const { nodeId, startNode, anchor, currentScale, parentMatrix, bakeLocalAnchor } = ds;
    this._dragState.set(null);
    // Full revert to startNode (geometry + transform) — necessary because
    // `updateResize` may have baked geometry in addition to (or instead
    // of) mutating the transform. The dispatched command re-applies the
    // final scale from this clean baseline.
    this.applyPreviewNode(nodeId, startNode);
    if (Math.abs(currentScale.sx - 1) < 1e-4 && Math.abs(currentScale.sy - 1) < 1e-4) return;
    // When `bakeLocalAnchor` is set, `updateResize` ran in local-frame
    // mode — dispatch the command with the already-projected anchor and
    // `parentMatrix=null` so the command's own adjust path doesn't
    // re-translate. Otherwise keep the legacy path (doc-space anchor +
    // identity-or-translate parentMatrix handled by bakeScaleIntoNode).
    const finalAnchor = bakeLocalAnchor ?? anchor;
    const finalParentMatrix = bakeLocalAnchor !== null ? null : parentMatrix;
    this.bus.dispatch(
      new ResizeNodeCommand(
        nodeId,
        finalAnchor,
        currentScale.sx,
        currentScale.sy,
        finalParentMatrix,
      ),
    );
  }

  // ── OBB resize gesture (single rotated node, D-141) ─────────────

  /**
   * Begin an **oriented** resize gesture for a single rotated node.
   * `localBBox` is the node's own (pre-transform) geometry bbox and
   * `matrix` maps that local frame → document space (the node's own
   * transform composed with its ancestors — i.e. `getRenderedNodeOBB`).
   * `handle` is the grabbed anchor; the OPPOSITE local anchor is the
   * fixed scaling pivot.
   *
   * Unlike {@link startResize}, all anchors stay in the node's LOCAL
   * frame and the pointer is projected via `invMatrix` so scaling runs
   * along the object's own (rotated) axes.
   */
  startResizeObb(
    nodeId: NodeId,
    handle: Exclude<BBoxAnchor, 'mc'>,
    localBBox: { x: number; y: number; width: number; height: number },
    matrix: Transform,
  ): void {
    if (this._dragState() !== null) return;
    if (this.layers.isLocked(nodeId)) return;
    const node = findNodeById(this.state.document().root, nodeId);
    if (node === null) return;
    let invMatrix: Transform;
    try {
      invMatrix = invert(matrix);
    } catch {
      return; // non-invertible — bail (no gesture)
    }
    const anchors = allAnchors(localBBox);
    this._dragState.set({
      kind: 'resize-obb',
      nodeId,
      startTransform: node.transform,
      invMatrix,
      localAnchor: anchors[OPPOSITE_ANCHOR[handle]],
      localHandle: anchors[handle],
      scaleAxes: SCALE_AXES_FOR_HANDLE[handle],
      currentScale: { sx: 1, sy: 1 },
    });
  }

  /**
   * Update an OBB resize. Projects the doc-space pointer into the node's
   * LOCAL frame, derives `sx/sy` from the local-anchor → local-handle
   * span, and previews by composing the anchored scale onto the RIGHT of
   * the node's start transform (rotation preserved).
   */
  updateResizeObb(currentPoint: Point): void {
    const ds = this._dragState();
    if (ds === null || ds.kind !== 'resize-obb') return;
    const { invMatrix, localAnchor, localHandle, scaleAxes, startTransform, nodeId } = ds;
    const cursorLocal = applyTransform(invMatrix, currentPoint.x, currentPoint.y);
    const denomX = localHandle.x - localAnchor.x;
    const denomY = localHandle.y - localAnchor.y;
    const sx = scaleAxes.x && denomX !== 0 ? (cursorLocal.x - localAnchor.x) / denomX : 1;
    const sy = scaleAxes.y && denomY !== 0 ? (cursorLocal.y - localAnchor.y) / denomY : 1;
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
    const next = multiply(
      startTransform,
      composeAnchoredScale(translate(0, 0), sx, sy, localAnchor),
    );
    this.applyPreviewTransform(nodeId, next);
    ds.currentScale = { sx, sy };
  }

  /**
   * Finish an OBB resize: revert the preview, then dispatch ONE
   * {@link ResizeNodeCommand} in `localFrame` mode (anchor already local,
   * scale composed onto the transform). Negligible scale is a no-op.
   */
  endResizeObb(): void {
    const ds = this._dragState();
    if (ds === null || ds.kind !== 'resize-obb') return;
    const { nodeId, startTransform, localAnchor, currentScale } = ds;
    this._dragState.set(null);
    this.applyPreviewTransform(nodeId, startTransform);
    if (Math.abs(currentScale.sx - 1) < 1e-4 && Math.abs(currentScale.sy - 1) < 1e-4) return;
    this.bus.dispatch(
      new ResizeNodeCommand(nodeId, localAnchor, currentScale.sx, currentScale.sy, null, true),
    );
  }

  // ── Group resize gesture (multi-selection) ──────────────────────

  /**
   * Begin a GROUP resize gesture. `entries` = the selected nodes (id +
   * ancestor matrix), captured by the caller (the selection overlay,
   * which has the SVG element) so the anchored scale lands in each node's
   * parent frame. `unionBBox` is the combined selection bbox in doc
   * coords; `handle` is the grabbed corner/edge — the OPPOSITE union-bbox
   * anchor becomes the fixed scaling pivot.
   *
   * Locked nodes are filtered out (parity with `startResize`/
   * `startMoveMany`). Fewer than 2 remaining entries → no-op (the overlay
   * only calls this for genuine multi-selections; single uses `startResize`).
   */
  startResizeMany(
    entries: readonly ResizeNodesEntry[],
    handle: Exclude<BBoxAnchor, 'mc'>,
    unionBBox: { x: number; y: number; width: number; height: number },
  ): void {
    if (this._dragState() !== null) return;
    const root = this.state.document().root;
    const captured: {
      id: NodeId;
      startTransform: Transform;
      parentMatrix: Transform | null;
    }[] = [];
    for (const e of entries) {
      if (this.layers.isLocked(e.id)) continue;
      const node = findNodeById(root, e.id);
      if (node === null) continue;
      captured.push({ id: e.id, startTransform: node.transform, parentMatrix: e.parentMatrix });
    }
    if (captured.length < 2) return; // not a group → let the single path handle it
    const anchors = allAnchors(unionBBox);
    this._dragState.set({
      kind: 'resize-many',
      entries: captured,
      anchor: anchors[OPPOSITE_ANCHOR[handle]],
      handleStart: anchors[handle],
      scaleAxes: SCALE_AXES_FOR_HANDLE[handle],
      currentScale: { sx: 1, sy: 1 },
    });
  }

  /**
   * Update an in-progress group resize. Computes `sx`/`sy` in DOC space
   * from the union-bbox anchor + handle + current pointer (the selection's
   * nodes have different parents, so there is no single local frame), then
   * previews each node via `composeAnchoredScale` about the shared anchor —
   * each node's own `parentMatrix` maps that doc-space pivot into its frame.
   */
  updateResizeMany(currentPoint: Point): void {
    const ds = this._dragState();
    if (ds === null || ds.kind !== 'resize-many') return;
    const { anchor, handleStart, scaleAxes, entries } = ds;
    const denomX = handleStart.x - anchor.x;
    const denomY = handleStart.y - anchor.y;
    const sx = scaleAxes.x && denomX !== 0 ? (currentPoint.x - anchor.x) / denomX : 1;
    const sy = scaleAxes.y && denomY !== 0 ? (currentPoint.y - anchor.y) / denomY : 1;
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
    // Doc-space anchored scale built once; each node conjugates by its
    // own parentMatrix so the shared doc-space scale acts correctly in
    // that node's parent frame (identical math to ResizeNodesCommand, so
    // the live preview matches the committed result exactly).
    const m = composeAnchoredScale([1, 0, 0, 1, 0, 0], sx, sy, anchor);
    for (const e of entries) {
      let next: Transform;
      if (e.parentMatrix === null) {
        next = multiply(m, e.startTransform);
      } else {
        try {
          const inv = invert(e.parentMatrix);
          next = multiply(inv, multiply(m, multiply(e.parentMatrix, e.startTransform)));
        } catch {
          next = multiply(m, e.startTransform);
        }
      }
      this.applyPreviewTransform(e.id, next);
    }
    ds.currentScale = { sx, sy };
  }

  /**
   * Finish a group resize. Reverts every node's preview to its start
   * transform, then dispatches ONE {@link ResizeNodesCommand} (single
   * undo for the whole group). Negligible scale (~1×1) is a no-op
   * (handle clicked without a drag).
   */
  endResizeMany(): void {
    const ds = this._dragState();
    if (ds === null || ds.kind !== 'resize-many') return;
    const { entries, anchor, currentScale } = ds;
    this._dragState.set(null);
    for (const e of entries) this.applyPreviewTransform(e.id, e.startTransform);
    if (Math.abs(currentScale.sx - 1) < 1e-4 && Math.abs(currentScale.sy - 1) < 1e-4) return;
    const cmdEntries: ResizeNodesEntry[] = entries.map((e) => ({
      id: e.id,
      parentMatrix: e.parentMatrix,
    }));
    this.bus.dispatch(new ResizeNodesCommand(cmdEntries, anchor, currentScale.sx, currentScale.sy));
  }

  // ── Group rotation gesture (multi-selection) ────────────────────

  /**
   * Begin a GROUP rotation gesture. `entries` = the selected nodes (id +
   * ancestor matrix), captured by the caller (the selection overlay,
   * which has the SVG element). `pivot` is the shared rotation pivot in
   * doc coords (centre of the combined bbox — same role the single-node
   * rotation's pivot plays). `startPoint` is the pointer position at
   * gesture start (defines the 0° baseline).
   *
   * Locked nodes are filtered out (parity with `startResizeMany`). Fewer
   * than 2 remaining entries → no-op (the overlay only calls this for
   * genuine multi-selections; single uses `startRotate`).
   */
  startRotateMany(entries: readonly RotateNodesEntry[], pivot: Point, startPoint: Point): void {
    if (this._dragState() !== null) return;
    const root = this.state.document().root;
    const captured: {
      id: NodeId;
      startTransform: Transform;
      parentMatrix: Transform | null;
    }[] = [];
    for (const e of entries) {
      if (this.layers.isLocked(e.id)) continue;
      const node = findNodeById(root, e.id);
      if (node === null) continue;
      captured.push({ id: e.id, startTransform: node.transform, parentMatrix: e.parentMatrix });
    }
    if (captured.length < 2) return; // not a group → let the single path handle it
    this._dragState.set({
      kind: 'rotate-many',
      entries: captured,
      pivot,
      startPoint,
      currentAngleRad: 0,
    });
  }

  /**
   * Update an in-progress group rotation. The angle is the difference
   * between the pointer's current bearing and its start bearing, both
   * measured from the shared pivot (identical to single-node
   * `updateRotate`). Each node is previewed via the shared doc-space pivot
   * rotation, conjugated by its own `parentMatrix` — the SAME math as
   * `RotateNodesCommand`, so the live preview matches the committed result.
   */
  updateRotateMany(currentPoint: Point): void {
    const ds = this._dragState();
    if (ds === null || ds.kind !== 'rotate-many') return;
    const { pivot, startPoint, entries } = ds;
    const startAngle = Math.atan2(startPoint.y - pivot.y, startPoint.x - pivot.x);
    const currentAngle = Math.atan2(currentPoint.y - pivot.y, currentPoint.x - pivot.x);
    const angleRad = currentAngle - startAngle;
    if (!Number.isFinite(angleRad)) return;
    // Doc-space pivot rotation built once; each node conjugates by its own
    // parentMatrix (identical math to RotateNodesCommand).
    const m = composePivotRotation([1, 0, 0, 1, 0, 0], angleRad, pivot);
    for (const e of entries) {
      let next: Transform;
      if (e.parentMatrix === null) {
        next = multiply(m, e.startTransform);
      } else {
        try {
          const inv = invert(e.parentMatrix);
          next = multiply(inv, multiply(m, multiply(e.parentMatrix, e.startTransform)));
        } catch {
          next = multiply(m, e.startTransform);
        }
      }
      this.applyPreviewTransform(e.id, next);
    }
    ds.currentAngleRad = angleRad;
  }

  /**
   * Finish a group rotation. Reverts every node's preview to its start
   * transform, then dispatches ONE {@link RotateNodesCommand} (single
   * undo for the whole group). Negligible angle (~0) is a no-op (handle
   * clicked without a drag).
   */
  endRotateMany(): void {
    const ds = this._dragState();
    if (ds === null || ds.kind !== 'rotate-many') return;
    const { entries, pivot, currentAngleRad } = ds;
    this._dragState.set(null);
    for (const e of entries) this.applyPreviewTransform(e.id, e.startTransform);
    if (Math.abs(currentAngleRad) < 1e-4) return;
    const cmdEntries: RotateNodesEntry[] = entries.map((e) => ({
      id: e.id,
      parentMatrix: e.parentMatrix,
    }));
    this.bus.dispatch(new RotateNodesCommand(cmdEntries, pivot, currentAngleRad));
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
    } else if (ds.kind === 'resize-many' || ds.kind === 'rotate-many') {
      // Group resize / rotation: revert every node's matrix preview to its
      // snapshot (both kinds carry `entries`, neither has a top-level
      // `nodeId`/`startTransform`).
      for (const e of ds.entries) this.applyPreviewTransform(e.id, e.startTransform);
    } else {
      this.applyPreviewTransform(ds.nodeId, ds.startTransform);
      // Group move (multi-selection): revert every extra node too, else
      // an Esc mid-drag would leave the extras stranded at their preview
      // position (only the primary would snap back).
      if (ds.kind === 'move' && ds.extraNodes !== undefined) {
        for (const extra of ds.extraNodes) {
          this.applyPreviewTransform(extra.id, extra.startTransform);
        }
      }
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
