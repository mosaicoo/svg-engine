import {
  CommandBus,
  createPath,
  EditorStateService,
  InsertNodeCommand,
  type Point,
} from 'svg-engine/core';
import {
  BrushLibraryService,
  BrushSelectionService,
} from '../library/brushes/brush-library.service';
import { expandStrokeWithProfile } from '../library/brushes/expand-stroke';
import { type EditorPlugin, PLUGIN_API_VERSION } from '../plugin/plugin';
import { SelectionService } from '../selection/selection.service';
import { PencilToolService } from './pencil-tool.service';
import type { Tool, ToolContext, ToolPointerEvent } from './tool';
import { ToolRegistry } from './tool-registry.service';

/**
 * Stable id of the builtin Select tool — **group-aware** (Illustrator
 * convention: black arrow / V). Clicking a leaf inside a group selects
 * the group as a unit. To drill into the group, use the Direct Select
 * tool (see {@link DIRECT_SELECT_TOOL_ID}) or double-click to enter
 * isolation mode.
 *
 * Default tool on canvas mount.
 *
 * **Why select is a "passthrough" for now**: the existing select +
 * marquee + body-drag + snap logic in the playground is already proven.
 * Migrating it INTO a SelectTool implementation is a worthwhile
 * refactor but orthogonal to the goal of this block (validate the
 * plugin/tool API). The Select tool entry exists so the toolbar shows
 * a "Select" option that's consistent with how Pencil etc work, and so
 * that hot-loaded plugins can reset back to a known default.
 */
export const SELECT_TOOL_ID = 'com.svge.tool.select';

/**
 * Stable id of the builtin Direct Select tool — **deep select**
 * (Illustrator convention: white arrow / A). Clicking a leaf selects
 * the leaf itself, ignoring group boundaries. Matches the original
 * SVGEngine click semantics from before isolation mode was added.
 *
 * Toggleable from the toolbar or the `a` shortcut.
 */
export const DIRECT_SELECT_TOOL_ID = 'com.svge.tool.direct-select';

/** Stable id of the builtin Pencil tool. */
export const PENCIL_TOOL_ID = 'com.svge.tool.pencil';

/**
 * Builtin Select tool — a no-op tool that signals "use the default
 * canvas behavior" (selection, marquee, body-drag, snap). The host
 * routes events here; the consumer can check `activeId === SELECT_TOOL_ID`
 * to know the canvas should run its native handlers.
 *
 * Future work: migrate the select + marquee + body-drag + snap pipeline
 * into this tool's `onPointerDown/Move/Up`. Removes the `activeId`
 * branch from consumers entirely.
 */
class SelectTool implements Tool {
  readonly id = SELECT_TOOL_ID;
  readonly label = 'Select';
  // `near_me` is in the legacy Material Icons font (loaded via Google
  // Fonts `family=Material+Icons` link). Earlier attempt used
  // `arrow_selector_tool` which is part of Material Symbols (newer
  // variable-font set) — NOT in the classic Icons file — so it
  // rendered as a blank circle in apps that haven't opted into
  // Symbols. `near_me` is the closest "selection arrow" glyph that
  // ships with the baseline classic icons.
  readonly icon = 'near_me';
  readonly cursor = 'default';
  readonly shortcut = 'v';
}

/**
 * Builtin Direct Select tool — passthrough sibling of SelectTool that
 * signals "deep-select mode" to the canvas. The host treats it like
 * SelectTool except for the hit-test resolution mode (see playground
 * `onCanvasPointerDown`).
 */
class DirectSelectTool implements Tool {
  readonly id = DIRECT_SELECT_TOOL_ID;
  readonly label = 'Direct Select';
  readonly icon = 'ads_click';
  readonly cursor = 'default';
  readonly shortcut = 'a';
}

/**
 * Builtin Pencil tool — freehand path drawing. Records pointer
 * positions during a press-drag-release gesture into
 * {@link PencilToolService}, then commits a single
 * {@link InsertNodeCommand} on release with a path built from the
 * recorded points.
 *
 * **Live preview**: state lives in `PencilToolService` so
 * {@link PencilOverlay} can render the in-progress stroke reactively
 * as the user drags. Before {@link PencilToolService} existed the
 * preview was missing — release was the only moment the user saw
 * what they drew.
 *
 * **Threshold of 2 points**: a single click (no drag) produces no
 * path — releasing without movement is treated as a no-op so
 * accidental clicks don't pollute the document with degenerate paths.
 * The overlay's `hasDraft` computed enforces the same threshold for
 * the preview (matches the commit semantics — what the user sees is
 * what gets inserted).
 */
class PencilTool implements Tool {
  readonly id = PENCIL_TOOL_ID;
  readonly label = 'Pencil';
  readonly icon = 'edit';
  readonly cursor = 'crosshair';
  readonly shortcut = 'p';

  onActivate(ctx: ToolContext): void {
    // Clear selection so the new path appears unobscured by the old
    // selection overlay; reset any stale draft from a prior session.
    ctx.injector.get(SelectionService).clear();
    ctx.injector.get(PencilToolService).reset();
  }

  onDeactivate(ctx: ToolContext): void {
    // Switching tools mid-stroke DISCARDS the in-progress trace —
    // matches PenTool / ShapeTool convention (no auto-commit when
    // user moves away).
    ctx.injector.get(PencilToolService).reset();
  }

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    ctx.injector.get(PencilToolService).begin(event.docPoint);
  }

  onPointerMove(event: ToolPointerEvent, ctx: ToolContext): void {
    ctx.injector.get(PencilToolService).append(event.docPoint);
  }

  onPointerUp(_event: ToolPointerEvent, ctx: ToolContext): void {
    const pencil = ctx.injector.get(PencilToolService);
    if (!pencil.drawing()) return;
    const captured = pencil.finish();
    if (captured.length < 2) return;

    // **D-060** — Brush integration. When a brush is selected via
    // BrushSelectionService, expand the captured polyline through
    // the brush's widthProfile to a filled-outline path (variable
    // width along the stroke). When no brush is active (or the
    // selected id doesn't resolve in the catalog — defensive against
    // a brush being unregistered mid-session), fall back to the
    // standard centerline + stroke output (backward-compat, zero
    // regression for apps that don't install builtinBrushesPlugin).
    const brushSel = ctx.injector.get(BrushSelectionService);
    const brushId = brushSel.selectedBrushId();
    if (brushId !== null) {
      const brush = ctx.injector.get(BrushLibraryService).get(brushId);
      if (brush !== null) {
        const baseWidth = brush.baseWidth ?? 8;
        const expanded = expandStrokeWithProfile(captured, baseWidth, brush.widthProfile);
        if (expanded.length > 0) {
          const node = createPath(expanded, {
            // Brush stroke = filled polygon outline. No stroke
            // (the outline IS the stroke). Black fill matches the
            // default centerline color.
            style: { fill: '#000000', stroke: 'none' },
          });
          const root = ctx.injector.get(EditorStateService).document().root;
          ctx.injector.get(CommandBus).dispatch(new InsertNodeCommand(root.id, node));
          return;
        }
        // Empty `expanded` (degenerate stroke) falls through to the
        // centerline emit below — better than dropping the user's
        // gesture entirely.
      }
    }

    // TOOL-OPT-B: read style + closePath from PencilToolService so the
    // tool-options bar drives the next commit. Defaults match the prior
    // hardcoded `fill:none + stroke:#000000 + strokeWidth:2 + open path`.
    const d = pointsToPathD(captured) + (pencil.closePath() ? ' Z' : '');
    const node = createPath(d, {
      style: {
        fill: pencil.fill(),
        stroke: pencil.stroke(),
        strokeWidth: pencil.strokeWidth(),
      },
    });
    const root = ctx.injector.get(EditorStateService).document().root;
    ctx.injector.get(CommandBus).dispatch(new InsertNodeCommand(root.id, node));
  }

  onPointerCancel(_event: ToolPointerEvent, ctx: ToolContext): void {
    ctx.injector.get(PencilToolService).cancel();
  }
}

/**
 * Builtin Select tool plugin. Registers BOTH the group-aware
 * {@link SelectTool} (V — default) and the deep
 * {@link DirectSelectTool} (A) as a paired set. Tracking both as a
 * single plugin keeps the toolbar layout predictable (always either
 * "both registered" or "none") and lets a consumer disable the pair
 * with one toggle.
 */
export const selectToolPlugin: EditorPlugin = {
  id: 'com.svge.tools.select',
  name: 'Select Tools (builtin)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  install(ctx) {
    const reg = ctx.injector.get(ToolRegistry);
    ctx.track(reg.register(new SelectTool()));
    ctx.track(reg.register(new DirectSelectTool()));
  },
};

/**
 * Builtin Pencil tool plugin. Registers a freehand drawing tool that
 * commits a single `<path>` per gesture via `InsertNodeCommand`.
 *
 * **Reference implementation**: every third-party Tool plugin can copy
 * this template — implement a `Tool`, register it from `install`,
 * track the disposable. No DI quirks, no global state.
 */
export const pencilToolPlugin: EditorPlugin = {
  id: 'com.svge.tools.pencil',
  name: 'Pencil Tool (builtin)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  install(ctx) {
    const reg = ctx.injector.get(ToolRegistry);
    ctx.track(reg.register(new PencilTool()));
  },
};

/**
 * Convert a sequence of points to an SVG path `d` attribute. First
 * point is `M`, subsequent are `L`. Coords are rounded to 1 decimal
 * for compactness (sub-pixel precision is irrelevant for freehand).
 *
 * Exported for test convenience.
 */
export function pointsToPathD(points: readonly Point[]): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
  }
  return parts.join(' ');
}
