import { DOCUMENT } from '@angular/common';
import { Directive, effect, ElementRef, inject, type OnDestroy } from '@angular/core';
import {
  type BoundingBox,
  CommandBus,
  EditorStateService,
  findNodeById,
  getPageViewBox,
  isLayer,
  isPage,
  type NodeId,
  type Point,
  RemoveNodeCommand,
} from 'svg-engine/core';
import { screenToDoc, ViewportService } from 'svg-engine/render';
import { findRenderedNode, getCombinedBBox, getRenderedNodeBBox } from '../geometry/node-bbox';
import {
  organizationalContainerPredicate,
  resolveSelectableNodeId,
  resolveSelectableNodeIdFromElement,
  type SelectableResolveOptions,
} from '../hit-testing/hit-testing';
import { geometricHitTestElement } from '../hit-testing/geometric-hit-test';
import { IsolationService } from '../isolation/isolation.service';
import { type MarqueeCandidate, nodesInsideMarquee } from '../marquee/marquee-hit-testing';
import { MarqueeService } from '../marquee/marquee.service';
import { ActivePageService } from '../pages/active-page.service';
import { isEditableTarget } from '../pointer/is-editable-target';
import { capturePointer, releasePointer } from '../pointer/capture';
import { SelectionService } from '../selection/selection.service';
import { ShortcutService } from '../shortcut/shortcut.service';
import { SnapService } from '../snap/snap.service';
import { TransformService } from '../transform/transform.service';
import { resolvePageBounds, WorkspaceService } from '../workspace/workspace.service';
import { DIRECT_SELECT_TOOL_ID, SELECT_TOOL_ID } from './builtin-tools';
import { ToolHostService } from './tool-host.service';
import type { ToolPointerEvent } from './tool';

/** Threshold (CSS px) between click-on-shape and start-of-drag-move. */
const DRAG_START_THRESHOLD_PX = 3;
/** Threshold (ms) between two clicks to count as a double-click. */
const DOUBLE_CLICK_THRESHOLD_MS = 400;

/**
 * **`[svgeShellInteractions]`** — D-039 expanded ("Shell interactions full kit").
 *
 * Attach to the host element that contains the inner `<svge-renderer>` and
 * the directive turns a "decorative shell" into a **usable editor** with
 * full pointer/keyboard semantics matching Illustrator/Affinity/Inkscape:
 *
 * | Gesture                       | Behavior                                                      |
 * | ----------------------------- | ------------------------------------------------------------- |
 * | Pointer-down on shape         | Select that shape; arm potential drag                         |
 * | Shift/Ctrl + click on shape   | Toggle in/out of selection (multi-select)                     |
 * | Pointer-down on empty canvas  | Start marquee (replace-mode); Shift = add-mode                |
 * | Drag past 3px on selected     | `TransformService.startMove` + snap via `SnapService`         |
 * | Pointer-up after drag         | `TransformService.endMove` → single undo entry                |
 * | Click on empty canvas         | Clear selection (replace-mode)                                |
 * | Double-click on a group       | `IsolationService.enter` (Affinity/Illustrator)               |
 * | Right-click                   | Handled by `[svgeContextMenu]` (separate directive)           |
 * | Pointer-down with active tool | Routed to `ToolHostService.routePointer*` (drawing tools)     |
 * | `Delete` / `Backspace`        | `RemoveNodeCommand` for each selected id                      |
 * | `Escape`                      | `cancelGesture` + `marquee.cancel` + `isolation.exitOne`      |
 * | Any other key                 | Forward to `ToolHostService.routeKeyDown`                     |
 *
 * **Replaces** the previous minimal directive (which only did tool routing
 * + click-select + Delete) introduced as the D-038 post-Phase 4 fix.
 * Migrates ~120 lines of interaction logic that used to live in
 * `custom-editor.component.ts` (ex-`playground-home`).
 *
 * **What's still consumer-owned** (NOT in this directive):
 * - Built-in shortcut REGISTRATIONS (Ctrl+Z, Ctrl+G, etc.) — directive
 *   only starts the `ShortcutService` listener; consumer registers
 *   what shortcuts mean via `ShortcutRegistry`.
 * - Per-tool key bindings (V/A/P/B/etc. activation) — forwarded as
 *   keydown to the active tool's `onKeyDown`, but a registry-driven
 *   "tool shortcuts plugin" is the cleaner way to wire activation.
 * - Right-click context menu — separate `[svgeContextMenu]` directive
 *   in `svg-engine/ui` (with hit-test-aware slot resolution to come
 *   in a future fast-follow).
 *
 * **Headless boundary (D-017)**: lives in `svg-engine/edit` —
 * Material-free.
 */
@Directive({
  selector: '[svgeShellInteractions]',
  standalone: true,
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(pointermove)': 'onPointerMove($event)',
    '(pointerup)': 'onPointerUp($event)',
    '(pointercancel)': 'onPointerCancel($event)',
    '(pointerleave)': 'onPointerLeave()',
    '(click)': 'onClick($event)',
  },
})
export class SvgeShellInteractions implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly document = inject(DOCUMENT);
  private readonly toolHost = inject(ToolHostService);
  private readonly selection = inject(SelectionService);
  private readonly state = inject(EditorStateService);
  private readonly bus = inject(CommandBus);
  private readonly transform = inject(TransformService);
  private readonly marquee = inject(MarqueeService);
  private readonly snap = inject(SnapService);
  // D-073-fix follow-up: passa zoom para SnapService.resolveForMove
  // converter o threshold (CSS px) em doc-units corretamente. Sem isso
  // o snap a Objects parece "não funcionar" quando o usuário está
  // zoomado (threshold em doc fica fixo em 8 enquanto deveria escalar
  // pra manter 8 CSS px na tela). Custom-editor já fazia isso desde a
  // primeira versão; shell-pro estava com paridade incompleta.
  private readonly viewport = inject(ViewportService);
  private readonly isolation = inject(IsolationService);
  // PAGES-FIX-3: pages act as an *implicit* selection scope root.
  // Without this, group-mode hit-testing would always bubble selection
  // up to the page (because the page is the direct child of the
  // document root). With pages as the scope root, clicking a shape
  // inside the active page resolves to the shape itself; clicking
  // empty page area resolves to the page (so Inspector shows page
  // props); clicking outside the page returns null (marquee).
  private readonly activePage = inject(ActivePageService);
  private readonly shortcuts = inject(ShortcutService);
  /**
   * Used by `onPointerMove` to publish doc-space cursor coordinates
   * to `<svge-status-bar>` (cursor section) and `<svge-rulers>`
   * (cursor indicator). Previously only `custom-editor` route wired
   * this manually; the shells now do it via this directive so any
   * `<svge-editor>`/`<svge-shell-pro>` consumer gets the live readout
   * for free.
   */
  private readonly workspace = inject(WorkspaceService);

  /**
   * **Grid-snap ↔ workspace-grid sync.** Mirrors the WORKSPACE grid the
   * user sees/edits (Workspace Settings ▸ Grid) into the SnapService so
   * "snap to grid" lands exactly on the drawn grid — same **spacing** and
   * same page-anchored **origin**. Reactive: re-runs whenever the grid
   * spacing or the active page's geometry changes, so the move always
   * reads the current settings (no hard-coded snap grid). Fixes the bug
   * where the snap used a fixed 10-unit lattice anchored at the document
   * origin while the visible grid used `spacing` (default 20) anchored at
   * the page — so dragging never matched the drawn grid.
   *
   * During a shape move there is no page-tool drag in flight, so we pass
   * `null` for the drag preview (page moves aren't shape moves).
   */
  private readonly _syncSnapGrid = effect(() => {
    this.snap.setGridSize(this.workspace.grid().spacing); // ignores ≤0 internally
    const active = this.activePage.activePage();
    const activeViewBox = active !== null ? getPageViewBox(active) : null;
    const pb = resolvePageBounds(
      activeViewBox,
      null,
      this.workspace.page(),
      this.viewport.contentBox(),
    );
    this.snap.setGridOrigin(pb !== null ? { x: pb.x, y: pb.y } : { x: 0, y: 0 });
  });

  /**
   * Pending drag bookkeeping. Set on pointer-down over a node; cleared
   * on pointer-up. Actual drag starts on first pointer-move past the
   * threshold so a click doesn't accidentally translate.
   */
  private potentialDrag: {
    readonly nodeId: NodeId;
    readonly startScreenX: number;
    readonly startScreenY: number;
  } | null = null;

  /**
   * Bounding box captured when the move gesture fired. For a single-node
   * drag it's that node's bbox; for a **group** drag (multi-selection)
   * it's the COMBINED bbox of all moving nodes — so snap aligns the
   * selection's envelope (Illustrator convention), not just the primary.
   * Used to compute the proposed bbox at the current pointer position
   * without re-querying the (already-previewed) DOM.
   */
  private moveStartBBox: BoundingBox | null = null;

  /**
   * Ids participating in the current move gesture. `{ primary }` for a
   * single drag; the whole selection for a group drag. Lets
   * `applySnappedMove` exclude EVERY moving node from the snap-target
   * set (a node must never snap to itself or to its co-moving peers —
   * they all translate together by the same delta).
   */
  private movingIds: ReadonlySet<NodeId> | null = null;

  /** Last-click bookkeeping for manual double-click detection. */
  private lastClickTimeMs = 0;
  private lastClickTargetId: NodeId | null = null;

  constructor() {
    // Start the global shortcut listener so plugins that register via
    // ShortcutRegistry get their keys routed. Idempotent — calling
    // multiple times is safe (the service guards internally).
    this.shortcuts.start();
    this.document.addEventListener('keydown', this.onKeyDown);
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('keydown', this.onKeyDown);
  }

  // ── Pointer-down (the big router) ────────────────────────────────

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return; // middle/right handled elsewhere

    // 0. Clear any active GUIDE selection. Guides handle their own
    //    pointerdown (GuidesOverlay) and `stopPropagation`, so reaching
    //    THIS directive means the user clicked something that is NOT a
    //    guide (a shape, the page, or empty canvas) — which deselects the
    //    guide (returning it from the orange "selected" highlight to the
    //    default style). Parity with the custom-editor playground, whose
    //    bespoke `onCanvasPointerDown` already did this; the call was not
    //    ported when the interaction logic was extracted into this shared
    //    directive (D-039), so svge-shell-pro / svge-editor kept the guide
    //    highlighted after selecting another object.
    this.workspace.selectGuide(null);

    // 1. Drawing tools (Stamp, Shape, Pen, Text, ...) consume the
    //    event first. Select / Direct-Select tools fall through.
    const activeId = this.toolHost.activeId();
    const isDrawingTool =
      activeId !== null && activeId !== SELECT_TOOL_ID && activeId !== DIRECT_SELECT_TOOL_ID;
    if (isDrawingTool) {
      const toolEvent = this.buildToolEvent(event);
      if (toolEvent !== null) {
        capturePointer(event);
        this.toolHost.routePointerDown(toolEvent);
        return;
      }
    }

    // 2. Hit-test against the document. Mode `'group'` matches Select
    //    tool's convention (clicking a child of a group selects the
    //    group, not the child); Direct-Select tool not handled in this
    //    pass — drag-to-isolate-then-edit is a Phase E concern.
    //    PAGES-FIX-3: when no isolation is active, the active page (if
    //    any) becomes the scope root so clicks resolve to shapes inside
    //    the page rather than to the page itself.
    // DOM hit (primary) + geometric tolerance fallback for unfilled /
    // near-stroke shapes (D-091). Group mode matches the Select tool's
    // convention; Layers/Pages are seen through (organizational).
    const id = this.resolveSelectionId(event);

    // 3a. Click on empty canvas → start marquee (or exit isolation).
    if (id === null) {
      // When isolated, clicking outside the isolation subtree exits
      // isolation instead of starting a marquee (Affinity convention).
      if (this.isolation.isActive()) {
        this.isolation.exit();
        this.potentialDrag = null;
        capturePointer(event);
        return;
      }
      // Start marquee.
      const start = this.toDocPoint(event);
      if (start !== null) {
        const mode = event.shiftKey ? 'add' : 'replace';
        this.marquee.start(start, mode, this.selection.selectedIds());
      }
      this.potentialDrag = null;
      capturePointer(event);
      return;
    }

    // 3b. Hit on a node. Modifier logic mirrors Figma/Affinity:
    //     Shift / Ctrl / Cmd → toggle; otherwise replace (unless already
    //     selected, in which case keep selection — enables drag-move
    //     of a multi-select).
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      this.selection.toggle(id);
    } else if (!this.selection.isSelected(id)) {
      this.selection.select(id);
    }

    // PAGES-FIX-4: page is selectable on click (so Inspector shows
    // its props), but it is NOT draggable as a unit — page is the
    // artboard, not a user object. Drag-from-page-area starts a
    // marquee (Illustrator/Affinity convention). We arm the marquee
    // immediately; if the user releases without movement, the page
    // selection sticks and marquee is canceled by the up handler.
    if (id === this.activePage.activePageId()) {
      const start = this.toDocPoint(event);
      if (start !== null) {
        const mode = event.shiftKey ? 'add' : 'replace';
        this.marquee.start(start, mode, this.selection.selectedIds());
      }
      this.potentialDrag = null;
      capturePointer(event);
      return;
    }

    // Arm a potential drag. Locked nodes can be selected but not
    // dragged (consistent with Illustrator/Affinity/Figma).
    // NB: `LayersService.isLocked` lookup happens inside the move flow;
    // suppressing arming when locked would require injecting that service.
    // For now, arm always and rely on TransformService to no-op locks.
    this.potentialDrag = {
      nodeId: id,
      startScreenX: event.clientX,
      startScreenY: event.clientY,
    };
    capturePointer(event);
  }

  // ── Pointer-move (drag detection + marquee update) ──────────────

  protected onPointerMove(event: PointerEvent): void {
    // Update the workspace ruler-cursor signal so <svge-status-bar>'s
    // cursor section (and rulers' cursor indicator) shows live doc
    // coords as the user moves the pointer over the canvas. Runs on
    // EVERY pointermove regardless of tool/drag state so the readout
    // tracks continuously. setRulerCursor de-dups identical values
    // internally — cheap. (D-043 follow-up: shells previously had no
    // updater, so the cursor section always showed `—`.)
    const cursorPoint = this.toDocPoint(event);
    this.workspace.setRulerCursor(cursorPoint);

    // Hover highlight: feed `SelectionService.hoverId` so the
    // `<svge-selection-overlay>` draws the dashed `.hover-outline` of the node
    // under the cursor. Runs every move; `updateHover` itself suppresses the
    // outline during drawing tools and active gestures. Previously only
    // `custom-editor` wired this inline — the shells (svg-studio,
    // `<svge-editor>`/`<svge-shell-pro>`) had no hover feedback at all.
    this.updateHover(event);

    // Drawing tool active → forward.
    const activeId = this.toolHost.activeId();
    const isDrawingTool =
      activeId !== null && activeId !== SELECT_TOOL_ID && activeId !== DIRECT_SELECT_TOOL_ID;
    if (isDrawingTool) {
      const toolEvent = this.buildToolEvent(event);
      if (toolEvent !== null) this.toolHost.routePointerMove(toolEvent);
      return;
    }

    // Move in progress → update with snap.
    const ds = this.transform.dragState();
    if (ds !== null && ds.kind === 'move') {
      const point = this.toDocPoint(event);
      if (point !== null) this.applySnappedMove(ds, point);
      return;
    }
    if (ds !== null) return; // other drag kinds owned by overlay handles

    // Marquee in progress → update.
    if (this.marquee.isActive()) {
      const point = this.toDocPoint(event);
      if (point !== null) {
        this.marquee.update(point);
        this.applyMarqueeSelection();
      }
      return;
    }

    // Potential drag → check threshold to promote to move.
    if (this.potentialDrag !== null) {
      const dx = event.clientX - this.potentialDrag.startScreenX;
      const dy = event.clientY - this.potentialDrag.startScreenY;
      if (dx * dx + dy * dy < DRAG_START_THRESHOLD_PX * DRAG_START_THRESHOLD_PX) return;
      const start = this.screenPointToDoc(
        this.potentialDrag.startScreenX,
        this.potentialDrag.startScreenY,
      );
      if (start === null) return;
      const svg = this.findInnerSvg();
      // **Multi-selection group move** (Illustrator/Figma/Affinity): when
      // 2+ nodes are selected AND the grabbed node is one of them, drag
      // moves the WHOLE selection together. The pointer-down handler
      // preserves a multi-selection when the user presses an
      // already-selected member (it only `select()`s on a fresh hit), so
      // by the time we promote to a move the selection still holds all
      // the intended nodes.
      const selectedIds = this.selection.selectedIds();
      const isGroupMove = selectedIds.size > 1 && selectedIds.has(this.potentialDrag.nodeId);
      if (isGroupMove) {
        this.movingIds = new Set(selectedIds);
        // Snap envelope = combined bbox of all moving nodes.
        this.moveStartBBox = svg === null ? null : getCombinedBBox(svg, selectedIds);
        this.transform.startMoveMany(Array.from(selectedIds), start);
      } else {
        this.movingIds = new Set([this.potentialDrag.nodeId]);
        this.moveStartBBox =
          svg === null ? null : getRenderedNodeBBox(svg, this.potentialDrag.nodeId);
        this.transform.startMove(this.potentialDrag.nodeId, start);
      }
      const point = this.toDocPoint(event);
      if (point !== null) {
        const newDs = this.transform.dragState();
        if (newDs !== null && newDs.kind === 'move') this.applySnappedMove(newDs, point);
      }
    }
  }

  /**
   * **Hover outline wiring (select mode).** Feeds {@link SelectionService.setHover}
   * from the node under the cursor so `<svge-selection-overlay>` draws its
   * dashed `.hover-outline`. Uses the SAME {@link resolveSelectableNodeId} as
   * click-select (group mode, isolation/page aware), so the highlight always
   * matches what a click would pick.
   *
   * **Suppressed** while a drawing tool is active or any gesture (move /
   * marquee / armed potential-drag) is in progress — an outline trailing the
   * cursor mid-gesture is noise. The active **page** is never outlined (it has
   * its own paper/brackets treatment; mirrors `SelectionOverlay`'s own
   * page-hover suppression).
   *
   * Before this, only `custom-editor` wired hover inline; the shared shells
   * (svg-studio, `<svge-editor>`, `<svge-shell-pro>`) had no hover feedback.
   */
  private updateHover(event: PointerEvent): void {
    const activeId = this.toolHost.activeId();
    const isDrawingTool =
      activeId !== null && activeId !== SELECT_TOOL_ID && activeId !== DIRECT_SELECT_TOOL_ID;
    if (
      isDrawingTool ||
      this.transform.dragState() !== null ||
      this.marquee.isActive() ||
      this.potentialDrag !== null
    ) {
      this.selection.setHover(null);
      return;
    }
    const hoverId = resolveSelectableNodeId(event, {
      mode: 'group',
      rootId: this.state.document().root.id,
      isolationRootId: this.isolation.isolationRootId() ?? this.activePage.activePageId(),
      isTransparentContainer: organizationalContainerPredicate(this.state.document().root),
    });
    this.selection.setHover(hoverId === this.activePage.activePageId() ? null : hoverId);
  }

  // ── Pointer-up (commit gestures) ────────────────────────────────

  protected onPointerUp(event: PointerEvent): void {
    const activeId = this.toolHost.activeId();
    const isDrawingTool =
      activeId !== null && activeId !== SELECT_TOOL_ID && activeId !== DIRECT_SELECT_TOOL_ID;
    if (isDrawingTool) {
      const toolEvent = this.buildToolEvent(event);
      if (toolEvent !== null) this.toolHost.routePointerUp(toolEvent);
      releasePointer(event);
      return;
    }

    // Commit move if in progress (single undo entry per gesture).
    const ds = this.transform.dragState();
    if (ds !== null && ds.kind === 'move') {
      this.transform.endMove();
      this.snap.clearActiveGuides();
      this.moveStartBBox = null;
      this.movingIds = null;
    }

    // End / cancel marquee.
    if (this.marquee.isActive()) {
      const m = this.marquee.state();
      const r = this.marquee.rect();
      // 0-size marquee on empty canvas in replace-mode → clear selection
      // (already happened on the drag-empty click, but be defensive).
      if (m !== null && r !== null && r.width === 0 && r.height === 0 && m.mode === 'replace') {
        this.selection.clear();
      }
      this.marquee.end();
    }

    this.potentialDrag = null;
    releasePointer(event);
  }

  protected onPointerCancel(event: PointerEvent): void {
    const activeId = this.toolHost.activeId();
    const isDrawingTool =
      activeId !== null && activeId !== SELECT_TOOL_ID && activeId !== DIRECT_SELECT_TOOL_ID;
    if (isDrawingTool) {
      const toolEvent = this.buildToolEvent(event);
      if (toolEvent !== null) this.toolHost.routePointerCancel(toolEvent);
    }
    // Cancel any pending move/marquee so we don't leave half-committed state.
    if (this.transform.isDragging()) {
      this.transform.cancelGesture();
      this.snap.clearActiveGuides();
      this.moveStartBBox = null;
      this.movingIds = null;
    }
    if (this.marquee.isActive()) this.marquee.cancel();
    this.potentialDrag = null;
    releasePointer(event);
  }

  protected onPointerLeave(): void {
    // Defensive: ensure no stale potentialDrag persists when the cursor
    // leaves the canvas without releasing (e.g., dragged off the window).
    // The actual gesture would still resolve via pointercancel, but this
    // covers edge cases where the browser doesn't fire it.
    // Clear the workspace ruler cursor so <svge-status-bar>'s cursor
    // section reverts to "—" when the pointer leaves (matches user
    // intuition that the readout follows the pointer's presence).
    this.workspace.setRulerCursor(null);
    // Clear the hover outline when the pointer leaves the canvas.
    this.selection.setHover(null);
  }

  // ── Click (manual dblclick detection → isolation) ───────────────

  protected onClick(event: MouseEvent): void {
    // Direct-Select tool gets no double-click → isolation behavior;
    // double-click on an anchor is a different gesture (handled by
    // AnchorOverlay) and we don't want it to also enter isolation.
    if (this.toolHost.activeId() === DIRECT_SELECT_TOOL_ID) {
      this.lastClickTimeMs = 0;
      this.lastClickTargetId = null;
      return;
    }
    const rootId = this.state.document().root.id;
    // Same DOM-hit + geometric-fallback resolution as onPointerDown so a
    // dblclick on an unfilled shape's area also enters isolation (D-091).
    const id = this.resolveSelectionId(event);
    const now = performance.now();
    const isSecondClickOnSameTarget =
      id !== null &&
      id === this.lastClickTargetId &&
      now - this.lastClickTimeMs <= DOUBLE_CLICK_THRESHOLD_MS;
    if (isSecondClickOnSameTarget) {
      this.lastClickTimeMs = 0;
      this.lastClickTargetId = null;
      if (id === rootId) return;
      const node = findNodeById(this.state.document().root, id);
      if (node === null || node.type !== 'group') return;
      // Pages AND layers are organizational containers, not isolatable
      // groups — isolation Mode + breadcrumb are exclusive to real Group
      // navigation. Dblclicking a shape whose group-resolved container is
      // a page or a layer must NOT enter isolation (it would show a
      // breadcrumb treating the layer as a group). Pages/layers are
      // navigated via their own panels. `IsolationService.enter()` guards
      // this too (single source of truth); the early return here also
      // avoids re-selecting the whole layer/page on a dblclick.
      if (isPage(node) || isLayer(node)) return;
      // DBLCLICK-FIX: bloquear o comportamento padrão do navegador
      // (que dispara o Selection Action Menu — Translate/Copy popup —
      // ao detectar um dblclick em texto na vizinhança). Não chamamos
      // stopPropagation porque outros listeners ancestrais (canvas
      // gestures, menu bar) podem precisar do evento.
      event.preventDefault();
      this.isolation.enter(id);
      this.selection.select(id);
      return;
    }
    this.lastClickTimeMs = now;
    this.lastClickTargetId = id;
  }

  // ── Keyboard (document-level) ───────────────────────────────────

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (isEditableTarget(event.target)) return;

    // Delete / Backspace — remove selected nodes (single dispatch
    // per id; consumer may want a batch command in the future).
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const ids = Array.from(this.selection.selectedIds());
      if (ids.length === 0) return;
      event.preventDefault();
      for (const id of ids) this.bus.dispatch(new RemoveNodeCommand(id));
      this.selection.clear();
      return;
    }

    // Escape — cancel hierarchy (drag → marquee → isolation).
    if (event.key === 'Escape') {
      if (this.transform.isDragging()) {
        this.transform.cancelGesture();
        this.snap.clearActiveGuides();
        this.moveStartBBox = null;
        this.movingIds = null;
        this.potentialDrag = null;
        event.preventDefault();
        return;
      }
      if (this.marquee.isActive()) {
        this.marquee.cancel();
        event.preventDefault();
        return;
      }
      if (this.isolation.isActive()) {
        this.isolation.exitOne();
        event.preventDefault();
        return;
      }
      // Fall through — let the active tool handle Esc to cancel its
      // own draft (Pen tool aborts current path, etc.).
    }

    // Forward all other keys to the active tool.
    this.toolHost.routeKeyDown(event);
  };

  // ── Snap-aware move helper ──────────────────────────────────────

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
    // Exclude EVERY moving node (the whole group, not just the primary)
    // from the snap-target set — co-moving peers translate by the same
    // delta, so snapping to them would be meaningless / jittery.
    const exclude = this.movingIds ?? new Set<NodeId>([ds.nodeId]);
    const others = this.collectStaticBBoxes(exclude);
    // Pass current zoom so SnapService converts threshold (CSS px) →
    // doc-units against the same scale the user sees. Omitting it
    // defaults zoom=1 which under-snaps when zoomed in and over-snaps
    // when zoomed out — visible mostly on "Objects" mode because
    // grid targets are dense enough to absorb the discrepancy.
    const result = this.snap.resolveForMove(proposed, others, this.viewport.zoom());
    const snapped: Point = { x: point.x + result.delta.x, y: point.y + result.delta.y };
    this.transform.updateMove(snapped);
    this.snap.setActiveGuides(result.guides);
  }

  /** Collect bboxes of all top-level children except the moving node(s). */
  private collectStaticBBoxes(
    excludeIds: ReadonlySet<NodeId>,
  ): readonly { readonly id: NodeId; readonly bbox: BoundingBox }[] {
    const svg = this.findInnerSvg();
    if (svg === null) return [];
    const out: { id: NodeId; bbox: BoundingBox }[] = [];
    for (const child of this.state.document().root.children) {
      if (excludeIds.has(child.id)) continue;
      const bb = getRenderedNodeBBox(svg, child.id);
      if (bb === null) continue;
      out.push({ id: child.id, bbox: bb });
    }
    return out;
  }

  // ── Marquee selection helper ────────────────────────────────────

  private applyMarqueeSelection(): void {
    const m = this.marquee.state();
    const r = this.marquee.rect();
    if (m === null || r === null) return;
    const svg = this.findInnerSvg();
    if (svg === null) return;

    // PAGES-FIX-4: when an active page exists, marquee operates on
    // the page's children (the actual user objects), not on the
    // document root's children (which is just `[page]` and would
    // make every marquee pick the entire page). Falls back to the
    // legacy root.children behavior for documents without pages.
    const activePageNode = this.activePage.activePage();
    const candidateParent: { readonly children: readonly { readonly id: NodeId }[] } =
      activePageNode !== null ? activePageNode : this.state.document().root;

    const candidates: MarqueeCandidate[] = [];
    for (const child of candidateParent.children) {
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

  // ── Selection resolution (DOM hit + geometric fallback) — D-091 ──

  /** Shared options for selectable-node resolution (group mode + scope). */
  private selectableOptions(): SelectableResolveOptions {
    const root = this.state.document().root;
    return {
      mode: 'group',
      rootId: root.id,
      isolationRootId: this.isolation.isolationRootId() ?? this.activePage.activePageId(),
      isTransparentContainer: organizationalContainerPredicate(root),
    };
  }

  /**
   * Resolve the node id for a pointer/click. **Primary**: native DOM hit
   * (`event.target`) — exact, z-order-correct, catches filled shapes.
   * **Fallback** (D-091): when the DOM hit lands on background or a scope
   * container (page / isolation root / document root), run a geometric
   * tolerance hit so an **unfilled** shape clicked on its area, or a click
   * a few px off a thin stroke, still selects — matching Illustrator. The
   * geometric hit is mapped through the SAME group/scope resolution so it
   * lands on the identical node a painted click would.
   */
  private resolveSelectionId(event: PointerEvent | MouseEvent): NodeId | null {
    const opts = this.selectableOptions();
    const domId = resolveSelectableNodeId(event, opts);
    if (domId !== null && !this.isScopeContainer(domId)) return domId;
    const svg = this.findInnerSvg();
    if (svg !== null) {
      const el = geometricHitTestElement(svg, event.clientX, event.clientY);
      if (el !== null) {
        const geoId = resolveSelectableNodeIdFromElement(el, opts);
        if (geoId !== null && !this.isScopeContainer(geoId)) return geoId;
      }
    }
    return domId;
  }

  /**
   * Whether `id` is a scope CONTAINER (document root / active page /
   * isolation root) rather than a target shape. A geometric hit may
   * upgrade past these; when no shape is found they're returned so the
   * existing page-marquee / background / exit-isolation logic runs.
   */
  private isScopeContainer(id: NodeId): boolean {
    return (
      id === this.state.document().root.id ||
      id === this.activePage.activePageId() ||
      id === this.isolation.isolationRootId()
    );
  }

  // ── Coord helpers ───────────────────────────────────────────────

  private findInnerSvg(): SVGSVGElement | null {
    return this.host.nativeElement.querySelector<SVGSVGElement>('svg');
  }

  private toDocPoint(event: PointerEvent): Point | null {
    return this.screenPointToDoc(event.clientX, event.clientY);
  }

  private screenPointToDoc(clientX: number, clientY: number): Point | null {
    return screenToDoc(this.findInnerSvg(), clientX, clientY);
  }

  /** Build the `ToolPointerEvent` envelope. Returns null when SVG is unreachable. */
  private buildToolEvent(event: PointerEvent): ToolPointerEvent | null {
    const docPoint = this.toDocPoint(event);
    if (docPoint === null) return null;
    return {
      raw: event,
      docPoint,
      screenX: event.clientX,
      screenY: event.clientY,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
    };
  }
}
