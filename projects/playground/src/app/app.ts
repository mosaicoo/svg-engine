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
  findRenderedNode,
  getRenderedNodeBBox,
  Marquee,
  type MarqueeCandidate,
  MarqueeService,
  nodesInsideMarquee,
  resolveNodeIdFromEvent,
  RotationPivot,
  SelectionOverlay,
  SelectionService,
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
  imports: [RouterOutlet, SvgeRenderer, SelectionOverlay, RotationPivot, Marquee],
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
  protected readonly viewport = inject(ViewportService);

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

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      if (this.transform.isDragging()) {
        this.transform.cancelGesture();
        this.potentialDrag = null;
        event.preventDefault();
        return;
      }
      if (this.marquee.isActive()) {
        this.marquee.cancel();
        event.preventDefault();
      }
    }
  };

  constructor() {
    // Sync the viewport's content box with the document's viewBox so the
    // renderer pans/zooms over the actual document bounds.
    this.viewport.setContentBox(this.state.document().viewBox);
    document.addEventListener('keydown', this.onKeyDown);
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
    const ds = this.transform.dragState();
    if (ds !== null && ds.kind === 'move') {
      const point = this.screenToDoc(event.clientX, event.clientY);
      if (point !== null) this.transform.updateMove(point);
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
          this.transform.startMove(this.potentialDrag.nodeId, start);
          const point = this.screenToDoc(event.clientX, event.clientY);
          if (point !== null) this.transform.updateMove(point);
        }
      }
      return;
    }

    // No drag at all → hover handling
    this.selection.setHover(resolveNodeIdFromEvent(event));
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
    const ds = this.transform.dragState();
    if (ds !== null && ds.kind === 'move') {
      this.transform.endMove();
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
