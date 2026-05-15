import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnDestroy,
  signal,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import {
  type BoundingBox,
  CommandBus,
  createEllipse,
  createPath,
  createRect,
  EditorStateService,
  HistoryService,
  InsertNodeCommand,
  MoveNodeCommand,
  type NodeId,
  type Point,
  RemoveNodeCommand,
} from 'svg-engine/core';
import {
  type AlignAxis,
  AlignmentService,
  type DistributeAxis,
  findRenderedNode,
  getRenderedNodeBBox,
  Marquee,
  type MarqueeCandidate,
  MarqueeService,
  type NodeBBox,
  nodesInsideMarquee,
  resolveNodeIdFromEvent,
  RotationPivot,
  SELECT_TOOL_ID,
  SelectionOverlay,
  SelectionService,
  type SnapMode,
  SnapGuides,
  SnapService,
  type ToolPointerEvent,
  ToolHostService,
  ToolRegistry,
  TransformService,
} from 'svg-engine/edit';
import { SvgeRenderer, ViewportService } from 'svg-engine/render';

type ShapeKind = 'rect' | 'ellipse' | 'path';

/** Pixel threshold below which a release is treated as a click, not a drag. */
const DRAG_START_THRESHOLD_PX = 3;

/**
 * Playground root. Consumes `svg-engine/core`, `svg-engine/render` and
 * `svg-engine/edit` exactly as a third-party application would (D-018
 * dogfooding). Bare-bones UI — no Angular Material here, on purpose:
 * validates that the library's headless boundary (D-017) holds in real
 * consumption.
 *
 * Bloco 3 wireing:
 * - Pointer-down on the canvas: select the node (or clear), and arm a
 *   "potential drag" tracker.
 * - Pointer-move beyond the threshold while a drag is potential: start
 *   a `move` gesture in `TransformService` (revert+commit pattern).
 * - Pointer-up while dragging: end the gesture (single undo entry).
 * - Pointer-up without movement: just leaves the selection in place.
 * - Esc: cancel any in-progress gesture.
 *
 * Resize/rotate gestures are wired inside `<svge-selection-overlay>`
 * (handle-bound). The body-drag for `move` lives here because it
 * concerns the canvas as a whole, not individual handles.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SvgeRenderer, SelectionOverlay, RotationPivot, Marquee, SnapGuides],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnDestroy {
  private readonly bus = inject(CommandBus);
  private readonly state = inject(EditorStateService);
  private readonly history = inject(HistoryService);
  private readonly selection = inject(SelectionService);
  private readonly transform = inject(TransformService);
  private readonly marquee = inject(MarqueeService);
  private readonly alignment = inject(AlignmentService);
  protected readonly snap = inject(SnapService);
  protected readonly viewport = inject(ViewportService);
  protected readonly toolHost = inject(ToolHostService);
  protected readonly toolRegistry = inject(ToolRegistry);

  protected readonly title = signal('SVGEngine Playground');

  protected readonly tree = computed(() => this.state.document().root);
  protected readonly viewBox = computed(() => this.state.document().viewBox);
  protected readonly nodeCount = this.state.nodeCount;
  protected readonly canUndo = this.history.canUndo;
  protected readonly canRedo = this.history.canRedo;
  protected readonly zoomPct = computed(() => `${(this.viewport.zoom() * 100).toFixed(0)}%`);
  protected readonly selectedCount = this.selection.count;
  protected readonly focusIdShort = computed(() => {
    const id = this.selection.focusId();
    return id === null ? '—' : id.slice(0, 8);
  });

  /**
   * Pending body-drag bookkeeping. Set on pointer-down over a node;
   * cleared on pointer-up. Drag actually starts on the first pointer-move
   * past `DRAG_START_THRESHOLD_PX` so a click doesn't accidentally
   * commit a tiny translation.
   */
  private potentialDrag: {
    nodeId: NodeId;
    startScreenX: number;
    startScreenY: number;
  } | null = null;

  /**
   * Bbox of the dragged node captured at the moment {@link TransformService.startMove}
   * fired. Used by snap-on-move to compute the **proposed** bbox at the
   * current pointer position without re-querying the (already-previewed)
   * rendered DOM. Cleared on `endMove`/`cancelGesture`.
   */
  private moveStartBBox: BoundingBox | null = null;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (this.transform.isDragging()) {
        this.transform.cancelGesture();
        this.snap.clearActiveGuides();
        this.moveStartBBox = null;
        this.potentialDrag = null;
        event.preventDefault();
        return;
      }
      if (this.marquee.isActive()) {
        this.marquee.cancel();
        event.preventDefault();
      }
    }
    // Single-key tool shortcuts (V/P/...) — but only when no input is focused
    // and the key isn't part of a modifier combo (Ctrl+V = paste, etc.).
    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !isEditableTarget(event.target)
    ) {
      const tool = this.toolRegistry.getByShortcut(event.key.toLowerCase());
      if (tool !== null) {
        this.toolHost.activate(tool.id);
        event.preventDefault();
        return;
      }
    }
    // Forward un-consumed keydowns to the active tool (lets the active tool
    // handle, e.g., Esc-cancel for in-progress drafts).
    this.toolHost.routeKeyDown(event);
  };

  constructor() {
    // Sync the viewport's content box with the document's viewBox so the
    // renderer pans/zooms over the actual document bounds.
    this.viewport.setContentBox(this.state.document().viewBox);
    document.addEventListener('keydown', this.onKeyDown);
    // Default tool: Select (passthrough — keeps native canvas behavior).
    // Activated after construction so the tool registry has had a chance
    // to receive the bootstrap-provided plugin entries.
    queueMicrotask(() => {
      if (this.toolRegistry.get(SELECT_TOOL_ID) !== null) {
        this.toolHost.activate(SELECT_TOOL_ID);
      }
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onKeyDown);
  }

  protected addShape(kind: ShapeKind): void {
    const x = Math.round(Math.random() * 600);
    const y = Math.round(Math.random() * 400);
    const w = 50 + Math.round(Math.random() * 100);
    const h = 50 + Math.round(Math.random() * 100);
    const fill = randomPastel();

    const node =
      kind === 'rect'
        ? createRect(
            { x, y, width: w, height: h },
            { style: { fill, stroke: '#333', strokeWidth: 1 } },
          )
        : kind === 'ellipse'
          ? createEllipse(
              { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 },
              { style: { fill, stroke: '#333', strokeWidth: 1 } },
            )
          : createPath(`M${x} ${y} L${x + w} ${y} L${x + w / 2} ${y + h} Z`, {
              style: { fill, stroke: '#333', strokeWidth: 1 },
            });

    this.bus.dispatch(new InsertNodeCommand(this.state.document().root.id, node));
  }

  protected nudgeFirst(): void {
    const first = this.firstChild();
    if (!first) return;
    this.bus.dispatch(new MoveNodeCommand(first.id, 10, 10));
  }

  protected removeFirst(): void {
    const first = this.firstChild();
    if (!first) return;
    this.bus.dispatch(new RemoveNodeCommand(first.id));
  }

  protected undo(): void {
    this.bus.undo();
  }

  protected redo(): void {
    this.bus.redo();
  }

  protected zoomIn(): void {
    this.viewport.zoomIn();
  }

  protected zoomOut(): void {
    this.viewport.zoomOut();
  }

  protected resetView(): void {
    this.viewport.reset();
  }

  protected toggleSnap(): void {
    this.snap.setEnabled(!this.snap.enabled());
  }

  protected setSnapMode(mode: SnapMode): void {
    this.snap.setMode(mode);
  }

  protected activateTool(id: string): void {
    this.toolHost.activate(id);
  }

  /**
   * Route a canvas pointer event to the currently active tool when it
   * isn't the passthrough Select. Returns `true` when the tool handled
   * the event (caller should skip the native canvas logic).
   *
   * The Select tool intentionally leaves canvas events to the playground's
   * existing select/marquee/body-drag pipeline — migrating that logic
   * into a real `SelectTool` implementation is a follow-up refactor
   * (orthogonal to validating the Tool API itself).
   */
  private routeToActiveTool(event: PointerEvent, kind: 'down' | 'move' | 'up'): boolean {
    const tool = this.toolHost.activeTool();
    if (tool === null || tool.id === SELECT_TOOL_ID) return false;
    const docPoint = this.screenToDoc(event.clientX, event.clientY);
    if (docPoint === null) return true; // tool is active but coords unresolvable; still suppress native
    const toolEvent: ToolPointerEvent = {
      raw: event,
      docPoint,
      screenX: event.clientX,
      screenY: event.clientY,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    };
    if (kind === 'down') this.toolHost.routePointerDown(toolEvent);
    else if (kind === 'move') this.toolHost.routePointerMove(toolEvent);
    else this.toolHost.routePointerUp(toolEvent);
    return true;
  }

  /** Align ≥ 2 selected nodes need; otherwise the toolbar buttons are disabled. */
  protected readonly canAlign = computed(() => this.selection.count() >= 2);

  /** Distribute ≥ 3 selected nodes (with a center spread). */
  protected readonly canDistribute = computed(() => this.selection.count() >= 3);

  protected alignSelection(axis: AlignAxis): void {
    const items = this.collectSelectionBBoxes();
    if (items.length < 2) return;
    this.alignment.align(items, axis);
  }

  protected distributeSelection(axis: DistributeAxis): void {
    const items = this.collectSelectionBBoxes();
    if (items.length < 3) return;
    this.alignment.distribute(items, axis);
  }

  /**
   * Read the rendered bbox of every currently-selected node. Skips ids
   * that don't resolve to a measurable bbox (e.g., empty groups). Used
   * by `alignSelection` / `distributeSelection` to feed the
   * {@link AlignmentService}.
   */
  private collectSelectionBBoxes(): readonly NodeBBox[] {
    const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
    if (svg === null) return [];
    const out: NodeBBox[] = [];
    for (const id of this.selection.selectedIds()) {
      const bb = getRenderedNodeBBox(svg, id);
      if (bb === null) continue;
      out.push({ id, bbox: bb });
    }
    return out;
  }

  /**
   * Pointer-down on the canvas:
   *  - Click on a node → select it (single-select), arm body-drag.
   *  - Click on background → start a marquee gesture (drag-to-select).
   *    Shift held = additive (preserves the current selection); plain
   *    click = will end as `clear()` if the user never drags.
   *  - Click on overlay handle / pivot → those components stop
   *    propagation, so this handler does not fire.
   */
  protected onCanvasPointerDown(event: PointerEvent): void {
    // If a non-Select tool is active, route to it and skip the native
    // selection/marquee path. Select is "passthrough" — we keep running
    // the existing canvas logic when it (or no tool) is active.
    if (this.routeToActiveTool(event, 'down')) {
      capturePointer(event);
      return;
    }
    const id = resolveNodeIdFromEvent(event);
    if (id === null) {
      const start = this.screenToDoc(event.clientX, event.clientY);
      if (start !== null) {
        const mode = event.shiftKey ? 'add' : 'replace';
        this.marquee.start(start, mode, this.selection.selectedIds());
      }
      this.potentialDrag = null;
      capturePointer(event);
      return;
    }
    if (!this.selection.isSelected(id)) {
      this.selection.select(id);
    }
    this.potentialDrag = {
      nodeId: id,
      startScreenX: event.clientX,
      startScreenY: event.clientY,
    };
    capturePointer(event);
  }

  /**
   * Pointer-move on the canvas:
   *  - If a body-drag gesture is already active in `TransformService`,
   *    forward the pointer position to `updateMove`.
   *  - If a marquee gesture is active, update its trailing edge and
   *    recompute the selection live (so the highlight follows the box).
   *  - If a drag is potential and the pointer moved beyond threshold,
   *    open the move gesture (`startMove` + initial `updateMove`).
   *  - Otherwise (no drag at all): publish hover state for the overlay.
   */
  protected onCanvasPointerMove(event: PointerEvent): void {
    if (this.routeToActiveTool(event, 'move')) return;
    const ds = this.transform.dragState();
    if (ds !== null && ds.kind === 'move') {
      const point = this.screenToDoc(event.clientX, event.clientY);
      if (point !== null) this.applySnappedMove(ds, point);
      return;
    }
    if (ds !== null) {
      // Resize/rotate gestures are owned by the overlay handles —
      // do nothing here so we don't fight pointer routing.
      return;
    }

    if (this.marquee.isActive()) {
      const point = this.screenToDoc(event.clientX, event.clientY);
      if (point !== null) {
        this.marquee.update(point);
        this.applyMarqueeSelection();
      }
      return;
    }

    if (this.potentialDrag !== null) {
      const dx = event.clientX - this.potentialDrag.startScreenX;
      const dy = event.clientY - this.potentialDrag.startScreenY;
      if (dx * dx + dy * dy >= DRAG_START_THRESHOLD_PX * DRAG_START_THRESHOLD_PX) {
        const start = this.screenToDoc(
          this.potentialDrag.startScreenX,
          this.potentialDrag.startScreenY,
        );
        if (start !== null) {
          // Capture the moving node's bbox BEFORE the gesture starts —
          // snap-on-move needs a stable reference (the rendered bbox
          // becomes the previewed one once startMove runs).
          const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
          this.moveStartBBox =
            svg === null ? null : getRenderedNodeBBox(svg, this.potentialDrag.nodeId);
          this.transform.startMove(this.potentialDrag.nodeId, start);
          const point = this.screenToDoc(event.clientX, event.clientY);
          if (point !== null) {
            const newDs = this.transform.dragState();
            if (newDs !== null && newDs.kind === 'move') {
              this.applySnappedMove(newDs, point);
            }
          }
        }
      }
      return;
    }

    // No drag at all → hover handling
    this.selection.setHover(resolveNodeIdFromEvent(event));
  }

  /**
   * Apply snap to a body-drag move: predict where the rect would land
   * at `point` (using `moveStartBBox + delta`), ask the {@link SnapService}
   * for an adjustment, then call `updateMove` with the **snapped** point
   * so the gesture preview lands aligned. Publishes the active guides
   * to the overlay.
   *
   * Falls back to plain `updateMove(point)` (no snap) when no start
   * bbox is available (e.g., the node's bbox couldn't be measured at
   * gesture start).
   */
  private applySnappedMove(
    ds: { readonly kind: 'move'; readonly nodeId: NodeId; readonly startPoint: Point },
    point: Point,
  ): void {
    if (!this.snap.enabled() || this.moveStartBBox === null) {
      this.transform.updateMove(point);
      return;
    }
    const dx = point.x - ds.startPoint.x;
    const dy = point.y - ds.startPoint.y;
    const proposed: BoundingBox = {
      x: this.moveStartBBox.x + dx,
      y: this.moveStartBBox.y + dy,
      width: this.moveStartBBox.width,
      height: this.moveStartBBox.height,
    };
    const others = this.collectStaticBBoxes(ds.nodeId);
    const result = this.snap.resolveForMove(proposed, others, this.viewport.zoom());
    const snapped: Point = {
      x: point.x + result.delta.x,
      y: point.y + result.delta.y,
    };
    this.transform.updateMove(snapped);
    this.snap.setActiveGuides(result.guides);
  }

  /**
   * Collect rendered bboxes of every top-level child **except** `excludeId`
   * — the snap candidate set. We exclude the moving node so it does not
   * snap to itself (which would make the gesture lock in place).
   */
  private collectStaticBBoxes(
    excludeId: NodeId,
  ): readonly { readonly id: NodeId; readonly bbox: BoundingBox }[] {
    const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
    if (svg === null) return [];
    const out: { id: NodeId; bbox: BoundingBox }[] = [];
    for (const child of this.tree().children) {
      if (child.id === excludeId) continue;
      const bb = getRenderedNodeBBox(svg, child.id);
      if (bb === null) continue;
      out.push({ id: child.id, bbox: bb });
    }
    return out;
  }

  /**
   * Pointer-up: commit any active body-drag (single undo entry), close
   * any active marquee gesture (the selection has already been built
   * progressively in `onCanvasPointerMove` via `applyMarqueeSelection`;
   * a zero-area marquee — i.e. a click without drag in `'replace'` mode
   * — clears the selection), and clear the potential-drag bookkeeping.
   * Resize/rotate are committed by their own handlers in the overlay.
   */
  protected onCanvasPointerUp(event: PointerEvent): void {
    if (this.routeToActiveTool(event, 'up')) {
      releasePointer(event);
      return;
    }
    const ds = this.transform.dragState();
    if (ds !== null && ds.kind === 'move') {
      this.transform.endMove();
      this.snap.clearActiveGuides();
      this.moveStartBBox = null;
    }
    if (this.marquee.isActive()) {
      const m = this.marquee.state();
      const r = this.marquee.rect();
      // Zero-area marquee = click without drag. In 'replace' mode this
      // means "click on background → clear selection"; in 'add' mode
      // the user just shift-clicked without dragging (no-op).
      if (m !== null && r !== null && r.width === 0 && r.height === 0 && m.mode === 'replace') {
        this.selection.clear();
      }
      this.marquee.end();
    }
    this.potentialDrag = null;
    releasePointer(event);
  }

  /** Clear hover when the cursor leaves the canvas region entirely. */
  protected onCanvasPointerLeave(): void {
    this.selection.setHover(null);
  }

  private firstChild() {
    return this.tree().children.at(0) ?? null;
  }

  /**
   * Compute the live marquee selection from the current rect and push
   * it into `SelectionService`. Called every `pointermove` while the
   * marquee is active so the highlight tracks the box without lag.
   *
   * Candidate set = top-level children of the document root (we do not
   * recurse into groups for now — group selection semantics are a
   * Bloco-4c follow-up). Each candidate's bbox is read from the rendered
   * DOM via `getRenderedNodeBBox` (same source the overlay uses).
   *
   * In `'add'` mode the result is unioned with the snapshot taken at
   * marquee-start, so pre-existing members are never lost mid-drag.
   */
  private applyMarqueeSelection(): void {
    const m = this.marquee.state();
    const r = this.marquee.rect();
    if (m === null || r === null) return;
    const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
    if (svg === null) return;

    const candidates: MarqueeCandidate[] = [];
    for (const child of this.tree().children) {
      // Only enumerate children that are actually rendered; skip nodes
      // without a measurable bbox (empty groups, unrendered text).
      if (findRenderedNode(svg, child.id) === null) continue;
      const bb = getRenderedNodeBBox(svg, child.id);
      if (bb === null) continue;
      candidates.push({ id: child.id, bbox: bb });
    }
    const hits = nodesInsideMarquee(r, candidates, 'intersect');

    if (m.mode === 'add') {
      const next = new Set(m.initialSelection);
      for (const id of hits) next.add(id);
      this.selection.selectMany(next);
    } else {
      this.selection.selectMany(hits);
    }
  }

  /**
   * Convert CSS pixel coordinates (e.g. from `event.clientX/Y`) into
   * the user-coordinate space of the renderer's `<svg>` (the same
   * coord system as the document `viewBox`). Returns `null` when the
   * SVG is not yet in the DOM or has no current transformation matrix.
   */
  private screenToDoc(clientX: number, clientY: number): Point | null {
    const svg = document.querySelector('svge-renderer svg');
    if (svg === null) return null;
    const svgRoot = svg as unknown as SVGSVGElement;
    const ctm = svgRoot.getScreenCTM();
    if (ctm === null) return null;
    const inverse = ctm.inverse();
    const pt = svgRoot.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const userSpace = pt.matrixTransform(inverse);
    return { x: userSpace.x, y: userSpace.y };
  }
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

function randomPastel(): string {
  const hue = Math.floor(Math.random() * 360);
  return `hsl(${hue} 60% 75%)`;
}

/**
 * True when the event target is a text-editing element (input, textarea,
 * contenteditable). Used to gate single-key tool shortcuts so typing in
 * a future inspector field doesn't accidentally swap tools.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}
