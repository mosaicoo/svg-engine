import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  type OnDestroy,
  signal,
} from '@angular/core';
import {
  type BoundingBox,
  CommandBus,
  createEllipse,
  createPath,
  createRect,
  EditorStateService,
  findNodeById,
  generateNodeId,
  GroupSelectionCommand,
  HistoryService,
  InsertNodeCommand,
  MoveNodeCommand,
  type NodeId,
  type Point,
  RemoveNodeCommand,
  type ReorderDirection,
  ReorderNodeCommand,
  UngroupCommand,
} from 'svg-engine/core';
import {
  type AlignAxis,
  AlignmentService,
  type DistributeAxis,
  findRenderedNode,
  getRenderedNodeBBox,
  GridOverlay,
  GuidesOverlay,
  LayersFilter,
  LayersService,
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
  ShortcutRegistry,
  ShortcutService,
  type SnapMode,
  SnapGuides,
  SnapService,
  type ToolPointerEvent,
  ToolHostService,
  ToolRegistry,
  TransformService,
  WorkspaceBackground,
  WorkspaceService,
} from 'svg-engine/edit';
import { SvgeRenderer, ViewportService } from 'svg-engine/render';
import { LayersPanel, SvgeInspector, SvgeRulers, SvgeThemeToggle } from 'svg-engine/ui';

type ShapeKind = 'rect' | 'ellipse' | 'path';

/** Pixel threshold below which a release is treated as a click, not a drag. */
const DRAG_START_THRESHOLD_PX = 3;

/**
 * Playground "home" page — full editor harness using the headless
 * primitives directly (D-018 dogfooding). Now also embeds the Material
 * panels (`<svge-layers-panel>` left, `<svge-inspector>` right) as
 * sidebars so the panels are reachable end-to-end without needing the
 * `<svge-editor>` shell.
 *
 * **Why panels here, not in the shell**: the shell (`<svge-editor>`,
 * Bloco 4a) is the "easy mode" composition for consumers. The home
 * playground deliberately uses primitives so we keep proving the
 * headless boundary works in raw form. A separate `/shell-demo` route
 * (created with this same refactor) demonstrates the shell.
 *
 * Wireing summary (unchanged from previous iterations — just relocated
 * from `App`):
 * - Pointer-down on the canvas: select the node (or open marquee).
 * - Drag past threshold: open `move` gesture in `TransformService`.
 * - Pointer-up: end the gesture (single undo entry).
 * - Esc: cancel any in-progress gesture.
 * - Body-drag (`move`) lives here; resize/rotate gestures are owned by
 *   the overlay handles.
 */
@Component({
  selector: 'app-pg-home',
  standalone: true,
  imports: [
    SvgeRenderer,
    SelectionOverlay,
    RotationPivot,
    Marquee,
    SnapGuides,
    WorkspaceBackground,
    LayersFilter,
    LayersPanel,
    SvgeInspector,
    GridOverlay,
    GuidesOverlay,
    SvgeRulers,
    SvgeThemeToggle,
  ],
  templateUrl: './playground-home.component.html',
  styleUrl: './playground-home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaygroundHome implements OnDestroy {
  private readonly bus = inject(CommandBus);
  private readonly state = inject(EditorStateService);
  private readonly history = inject(HistoryService);
  protected readonly selection = inject(SelectionService);
  private readonly transform = inject(TransformService);
  private readonly marquee = inject(MarqueeService);
  private readonly alignment = inject(AlignmentService);
  private readonly layers = inject(LayersService);
  protected readonly snap = inject(SnapService);
  protected readonly viewport = inject(ViewportService);
  protected readonly toolHost = inject(ToolHostService);
  protected readonly toolRegistry = inject(ToolRegistry);
  protected readonly workspace = inject(WorkspaceService);
  /** Short alias for template ergonomics — `ws.grid()`, `ws.guides()`, etc. */
  protected readonly ws = this.workspace;
  private readonly shortcuts = inject(ShortcutRegistry);
  private readonly shortcutService = inject(ShortcutService);

  protected readonly title = signal('SVGEngine Playground');

  protected readonly tree = computed(() => this.state.document().root);
  protected readonly viewBox = computed(() => this.state.document().viewBox);
  protected readonly nodeCount = this.state.nodeCount;
  protected readonly canUndo = this.history.canUndo;
  protected readonly canRedo = this.history.canRedo;

  /**
   * Whether the current focus is a group (so the Ungroup button can
   * enable). Mirrors the same guard used by the Ctrl+Shift+G handler.
   */
  protected readonly canUngroupFocus = computed(() => {
    if (this.selection.count() !== 1) return false;
    const focus = this.selection.focusId();
    if (focus === null) return false;
    const node = findNodeById(this.state.document().root, focus);
    return node?.type === 'group';
  });
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
    // (Group / Ungroup shortcuts are now contributed via ShortcutRegistry —
    // see constructor — and dispatched by ShortcutService. Esc and the
    // single-key tool shortcuts remain inline because they're tied to
    // gesture state / ToolHost which lives in this component.)

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

  /**
   * Wrap the current selection in a new group. No-op when 0 nodes are
   * selected; for 2+ nodes, requires a common parent (the command itself
   * fails gracefully on cross-parent selections — UX could surface a
   * toast in a future block).
   */
  protected groupSelection(): void {
    const ids = Array.from(this.selection.selectedIds());
    if (ids.length === 0) return;
    // Pre-allocate the new group's id so we can select it after the
    // command runs (without needing to introspect the resulting tree).
    // Matches Figma/Affinity UX — after Cmd+G, the new group is the
    // single selected node and the panel scrolls to it.
    const newGroupId = generateNodeId();
    const result = this.bus.dispatch(new GroupSelectionCommand(ids, newGroupId));
    if (result.ok) this.selection.select(newGroupId);
  }

  /**
   * Dissolve the focused group (if exactly one group is selected). For
   * non-group selections or multi-selections, no-op — Affinity-style
   * (Figma asks the user to pick which group to ungroup; we keep it
   * simple for v1).
   */
  protected ungroupSelection(): void {
    if (this.selection.count() !== 1) return;
    const focus = this.selection.focusId();
    if (focus === null) return;
    const node = findNodeById(this.state.document().root, focus);
    if (node === null || node.type !== 'group') return;
    // Capture the children ids BEFORE the command runs so we can
    // re-select them after the group is dissolved (Figma/Affinity UX —
    // the promoted children become the new selection).
    const childIds = node.children.map((c) => c.id);
    const result = this.bus.dispatch(new UngroupCommand(focus));
    if (result.ok) this.selection.selectMany(childIds);
  }

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

    // Fase 4 Bloco 4g — register group / ungroup shortcuts with the
    // ShortcutRegistry. Disposables tracked so navigating away (and
    // back) doesn't accumulate duplicate registrations — see
    // ngOnDestroy. ShortcutRegistry throws on duplicate id, so without
    // proper cleanup the second mount of this page errored.
    this.shortcutDisposables.push(
      this.shortcuts.register({
        id: 'playground.group',
        combo: 'CmdOrCtrl+G',
        description: 'Group selection',
        run: (event) => {
          event.preventDefault();
          this.groupSelection();
        },
      }),
    );
    this.shortcutDisposables.push(
      this.shortcuts.register({
        id: 'playground.ungroup',
        combo: 'CmdOrCtrl+Shift+G',
        description: 'Ungroup selection',
        run: (event) => {
          event.preventDefault();
          this.ungroupSelection();
        },
      }),
    );
    this.shortcutService.start();
  }

  /** Disposables for shortcuts registered in the constructor. */
  private readonly shortcutDisposables: import('svg-engine/edit').Disposable[] = [];

  /**
   * Z-order operation enabled when exactly one node is selected
   * (multi-node z-order would need to decide ordering among the
   * selected set — deferred). Matches Figma/Affinity: bring-to-front
   * etc. typically apply to single-node selections.
   */
  protected readonly canReorder = computed(() => {
    if (this.selection.count() !== 1) return false;
    const focus = this.selection.focusId();
    if (focus === null) return false;
    // Cannot reorder the document root (= focusId equals root id).
    return focus !== this.state.document().root.id;
  });

  /** Dispatch a z-order command for the currently focused node. */
  protected reorder(direction: ReorderDirection): void {
    const focus = this.selection.focusId();
    if (focus === null) return;
    this.bus.dispatch(new ReorderNodeCommand(focus, direction));
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    // Dispose shortcut contributions so re-mounting the page (e.g.,
    // navigation Shell-demo → Home) doesn't throw "already registered".
    for (const d of this.shortcutDisposables) d.dispose();
    this.shortcutDisposables.length = 0;
    this.shortcutService.stop();
  }

  // Fase 4 Bloco 4f — guide helpers (called from the View toolbar).

  /** Add a horizontal guide at the current viewBox vertical center. */
  protected addHGuide(): void {
    const vb = this.viewport.viewBox();
    this.ws.addGuide('h', vb.y + vb.height / 2);
  }

  /** Add a vertical guide at the current viewBox horizontal center. */
  protected addVGuide(): void {
    const vb = this.viewport.viewBox();
    this.ws.addGuide('v', vb.x + vb.width / 2);
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

  /** Quick presets for the workspace background fieldset. */
  protected readonly bgPresets: readonly {
    label: string;
    value: 'transparent' | 'white' | 'lightgray' | 'darkslate';
  }[] = [
    { label: 'Transparent', value: 'transparent' },
    { label: 'White', value: 'white' },
    { label: 'Light Gray', value: 'lightgray' },
    { label: 'Dark', value: 'darkslate' },
  ];

  protected setBackgroundPreset(value: 'transparent' | 'white' | 'lightgray' | 'darkslate'): void {
    if (value === 'transparent') {
      this.workspace.resetBackground();
    } else if (value === 'white') {
      this.workspace.setBackground({ kind: 'solid', color: '#ffffff' });
    } else if (value === 'lightgray') {
      this.workspace.setBackground({ kind: 'solid', color: '#eeeeee' });
    } else {
      this.workspace.setBackground({ kind: 'solid', color: '#2c3e50' });
    }
  }

  /** Active preset id (matches the active background variant) — drives [class.active]. */
  protected isBgActive(value: 'transparent' | 'white' | 'lightgray' | 'darkslate'): boolean {
    const bg = this.workspace.background();
    if (value === 'transparent') return bg.kind === 'transparent';
    if (bg.kind !== 'solid') return false;
    if (value === 'white') return bg.color.toLowerCase() === '#ffffff';
    if (value === 'lightgray') return bg.color.toLowerCase() === '#eeeeee';
    return bg.color.toLowerCase() === '#2c3e50';
  }

  protected setCustomBackground(color: string): void {
    if (color.length === 0) return;
    this.workspace.setBackground({ kind: 'solid', color });
  }

  /**
   * Route a canvas pointer event to the currently active tool when it
   * isn't the passthrough Select. Returns `true` when the tool handled
   * the event (caller should skip the native canvas logic).
   */
  private routeToActiveTool(event: PointerEvent, kind: 'down' | 'move' | 'up'): boolean {
    const tool = this.toolHost.activeTool();
    if (tool === null || tool.id === SELECT_TOOL_ID) return false;
    const docPoint = this.screenToDoc(event.clientX, event.clientY);
    if (docPoint === null) return true;
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

  protected onCanvasPointerDown(event: PointerEvent): void {
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
    // Shift/Ctrl click = additive (toggle); otherwise replace selection
    // unless already selected. Standard Figma/Affinity/Illustrator UX.
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      this.selection.toggle(id);
    } else if (!this.selection.isSelected(id)) {
      this.selection.select(id);
    }
    // Locked nodes are still selectable (consistent with Illustrator/
    // Affinity/Figma) but the body-drag is suppressed — the cursor
    // stays in default mode and TransformService.startMove would
    // refuse anyway. Not arming `potentialDrag` keeps the playground
    // consistent (no fake "grabbing" cursor on a node that won't move).
    if (!this.layers.isLocked(id)) {
      this.potentialDrag = {
        nodeId: id,
        startScreenX: event.clientX,
        startScreenY: event.clientY,
      };
    } else {
      this.potentialDrag = null;
    }
    capturePointer(event);
  }

  protected onCanvasPointerMove(event: PointerEvent): void {
    if (this.routeToActiveTool(event, 'move')) return;
    const ds = this.transform.dragState();
    if (ds !== null && ds.kind === 'move') {
      const point = this.screenToDoc(event.clientX, event.clientY);
      if (point !== null) this.applySnappedMove(ds, point);
      return;
    }
    if (ds !== null) return;

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

    this.selection.setHover(resolveNodeIdFromEvent(event));
  }

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
      if (m !== null && r !== null && r.width === 0 && r.height === 0 && m.mode === 'replace') {
        this.selection.clear();
      }
      this.marquee.end();
    }
    this.potentialDrag = null;
    releasePointer(event);
  }

  protected onCanvasPointerLeave(): void {
    this.selection.setHover(null);
  }

  private firstChild() {
    return this.tree().children.at(0) ?? null;
  }

  private applyMarqueeSelection(): void {
    const m = this.marquee.state();
    const r = this.marquee.rect();
    if (m === null || r === null) return;
    const svg = document.querySelector<SVGSVGElement>('svge-renderer svg');
    if (svg === null) return;

    const candidates: MarqueeCandidate[] = [];
    for (const child of this.tree().children) {
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
 * the inspector doesn't accidentally swap tools.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}
