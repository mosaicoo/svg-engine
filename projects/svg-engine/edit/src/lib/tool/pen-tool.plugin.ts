import { CommandBus, EditorStateService, InsertNodeCommand, type Point } from 'svg-engine/core';
import { type EditorPlugin, PLUGIN_API_VERSION } from '../plugin/plugin';
import { SelectionService } from '../selection/selection.service';
import { PenToolService } from './pen-tool.service';
import type { Tool, ToolContext, ToolPointerEvent } from './tool';
import { ToolRegistry } from './tool-registry.service';

/** Stable id of the builtin Pen tool — Illustrator/Affinity convention (P shortcut). */
export const PEN_TOOL_ID = 'com.svge.tool.pen';

/**
 * Pixel distance threshold (CSS px) below which a pointerdown→pointerup
 * is treated as a CLICK (→ cusp anchor) rather than a DRAG (→ smooth
 * anchor with handles). Matches the common 3-4px "slop" used in
 * Illustrator / Figma to discriminate intent.
 *
 * Doc-space comparison is fine here because the Pen tool's gestures
 * happen at zoom = 1 in the vast majority of cases; users zooming
 * heavily would benefit from a zoom-aware version but YAGNI for v1.
 */
const DRAG_THRESHOLD_PX = 4;

/**
 * Pixel distance (CSS px / doc units at zoom = 1) within which clicking
 * the first anchor closes the path. Matches the size of the AnchorOverlay
 * squares (≈ 8 px) — clicking on the visible first-anchor square should
 * trigger the close.
 */
const SNAP_TO_FIRST_PX = 8;

/**
 * Builtin Pen tool — vector path creation via clicks (corner anchors)
 * and click-drag (smooth anchors with symmetric handles).
 *
 * **Interaction model** (Illustrator-equivalent):
 * - **Click** on the canvas → places a `cusp` anchor at the cursor.
 * - **Click + drag** → places a `symmetric` anchor at the press point;
 *   the handle is drawn out by the drag distance + direction. Release
 *   commits.
 * - **Cursor between clicks** → shows a "rubber band" preview line
 *   from the last placed anchor to the cursor (see {@link PenOverlay}).
 * - **Click on the first anchor** (within {@link SNAP_TO_FIRST_PX}) →
 *   closes the path + finalises (dispatches `InsertNodeCommand`).
 * - **Enter** → finalises the current open path.
 * - **Escape** → discards the in-progress path (no command dispatched).
 *
 * **State lives in** {@link PenToolService} so the {@link PenOverlay}
 * component can render reactive previews. The tool is a thin event
 * router that mutates the service.
 *
 * **Finalisation semantics**: `InsertNodeCommand` is dispatched with
 * the document root as parent (matches the Pencil tool convention).
 * The path inherits default style (1px black stroke, no fill). Once
 * created, the user can move/style it normally.
 */
class PenTool implements Tool {
  readonly id = PEN_TOOL_ID;
  readonly label = 'Pen';
  readonly icon = 'draw';
  readonly cursor = 'crosshair';
  readonly shortcut = 'b'; // 'p' is taken by the Pencil tool

  onActivate(ctx: ToolContext): void {
    // Clean selection + any leftover Pen state from a previous activation.
    ctx.injector.get(SelectionService).clear();
    ctx.injector.get(PenToolService).reset();
  }

  onDeactivate(ctx: ToolContext): void {
    // Switching tools mid-draft DISCARDS the in-progress path (matches
    // Illustrator behaviour — switching to Select tool mid-pen-stroke
    // doesn't auto-commit). Users who want to keep the path should
    // press Enter first to finalise.
    ctx.injector.get(PenToolService).reset();
  }

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const pen = ctx.injector.get(PenToolService);
    const anchors = pen.anchors();
    // Check close-on-first BEFORE starting a new drag — if the user
    // clicked the first anchor, we want to close + finalise instead
    // of placing yet another anchor on top of it.
    if (anchors.length >= 2) {
      const first = anchors[0]!;
      if (distance(event.docPoint, first.point) <= SNAP_TO_FIRST_PX) {
        this.finalise(ctx, /* closed */ true);
        return;
      }
    }
    pen.beginPotentialDrag(event.docPoint);
  }

  onPointerMove(event: ToolPointerEvent, ctx: ToolContext): void {
    const pen = ctx.injector.get(PenToolService);
    const ds = pen.dragState();
    if (ds !== null) {
      // Button is pressed — update the in-progress symmetric handles.
      pen.updateDrag(event.docPoint);
      return;
    }
    // No button pressed — update the rubber-band preview from last
    // anchor to cursor, and check whether the cursor is close enough
    // to the first anchor to enable the snap-to-close indicator.
    pen.updatePreview(event.docPoint);
    const anchors = pen.anchors();
    if (anchors.length >= 2) {
      const first = anchors[0]!;
      pen.setSnappingToFirst(distance(event.docPoint, first.point) <= SNAP_TO_FIRST_PX);
    } else {
      pen.setSnappingToFirst(false);
    }
  }

  onPointerUp(_event: ToolPointerEvent, ctx: ToolContext): void {
    const pen = ctx.injector.get(PenToolService);
    const ds = pen.dragState();
    if (ds === null) return;
    const dragged = distance(ds.start, ds.current);
    if (dragged < DRAG_THRESHOLD_PX) {
      // Treat as click → cusp anchor.
      pen.commitClick();
    } else {
      // Real drag → symmetric anchor with handles.
      pen.commitDrag();
    }
  }

  onPointerCancel(_event: ToolPointerEvent, ctx: ToolContext): void {
    // Touch interrupted etc — drop the in-progress drag but keep
    // anchors already placed. User can resume by tapping again.
    ctx.injector.get(PenToolService).cancelDrag();
  }

  onKeyDown(event: KeyboardEvent, ctx: ToolContext): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      // Discard the entire in-progress path without dispatching.
      ctx.injector.get(PenToolService).reset();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      // Commit as OPEN path (Enter is the "I'm done" gesture — closing
      // would be done by clicking the first anchor instead).
      this.finalise(ctx, /* closed */ false);
      return;
    }
  }

  /**
   * Build the path node from current anchors + dispatch
   * `InsertNodeCommand`, then reset the service. Used by Enter (open)
   * and close-on-first-click (closed).
   *
   * No-op when the path is degenerate (< 2 anchors) — keeps state so
   * the user can keep clicking.
   */
  private finalise(ctx: ToolContext, closed: boolean): void {
    const pen = ctx.injector.get(PenToolService);
    const node = closed ? pen.buildClosedPath() : pen.buildOpenPath();
    if (node === null) return;
    const root = ctx.injector.get(EditorStateService).document().root;
    ctx.injector.get(CommandBus).dispatch(new InsertNodeCommand(root.id, node));
    pen.reset();
  }
}

/**
 * Builtin Pen tool plugin. Registers the Pen tool that ships with the
 * library; consumers opt in by adding `provideSvgEnginePlugin(penToolPlugin)`
 * to their bootstrap providers (matches Pencil tool convention).
 */
export const penToolPlugin: EditorPlugin = {
  id: 'com.svge.tools.pen',
  name: 'Pen Tool (builtin)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  install(ctx) {
    const reg = ctx.injector.get(ToolRegistry);
    ctx.track(reg.register(new PenTool()));
  },
};

/** Pure Euclidean distance between two points (doc units). */
function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}
