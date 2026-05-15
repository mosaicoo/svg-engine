import {
  CommandBus,
  createPath,
  EditorStateService,
  InsertNodeCommand,
  type Point,
} from 'svg-engine/core';
import { type EditorPlugin, PLUGIN_API_VERSION } from '../plugin/plugin';
import { SelectionService } from '../selection/selection.service';
import type { Tool, ToolContext, ToolPointerEvent } from './tool';
import { ToolRegistry } from './tool-registry.service';

/**
 * Stable id of the builtin Select tool. Exported so consumers (the
 * playground) can branch on `activeId === SELECT_TOOL_ID` to keep
 * running their existing select-mode handlers without re-implementing
 * everything inside the tool.
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
  readonly cursor = 'default';
  readonly shortcut = 'v';
}

/**
 * Builtin Pencil tool — freehand path drawing. Records pointer positions
 * during a press-drag-release gesture, then commits a single
 * {@link InsertNodeCommand} on release with a path built from the
 * recorded points.
 *
 * **No live preview** in this reference implementation: the path
 * appears on `pointerup`. Live preview is a future polish (would
 * require either inserting a placeholder node and mutating its `d` on
 * each move, or rendering an out-of-document overlay). Kept simple
 * here to validate the Tool API end-to-end — production tools can
 * follow the same pattern with an extra preview layer.
 *
 * **Threshold of 2 points**: a single click (no drag) produces no
 * path — releasing without movement is treated as a no-op so accidental
 * clicks don't pollute the document with degenerate paths.
 */
class PencilTool implements Tool {
  readonly id = PENCIL_TOOL_ID;
  readonly label = 'Pencil';
  readonly cursor = 'crosshair';
  readonly shortcut = 'p';

  private points: Point[] = [];
  private drawing = false;

  onActivate(ctx: ToolContext): void {
    // Clear selection so the new path appears unobscured by the old
    // selection overlay.
    ctx.injector.get(SelectionService).clear();
  }

  onDeactivate(): void {
    this.drawing = false;
    this.points = [];
  }

  onPointerDown(event: ToolPointerEvent): void {
    this.points = [event.docPoint];
    this.drawing = true;
  }

  onPointerMove(event: ToolPointerEvent): void {
    if (!this.drawing) return;
    this.points.push(event.docPoint);
  }

  onPointerUp(_event: ToolPointerEvent, ctx: ToolContext): void {
    if (!this.drawing) return;
    const captured = this.points;
    this.drawing = false;
    this.points = [];
    if (captured.length < 2) return;

    const d = pointsToPathD(captured);
    const node = createPath(d, {
      style: { fill: 'none', stroke: '#000000', strokeWidth: 2 },
    });
    const root = ctx.injector.get(EditorStateService).document().root;
    ctx.injector.get(CommandBus).dispatch(new InsertNodeCommand(root.id, node));
  }

  onPointerCancel(): void {
    this.drawing = false;
    this.points = [];
  }
}

/**
 * Builtin Select tool plugin. Registers a single passthrough
 * {@link SelectTool} entry and tracks it for cleanup.
 */
export const selectToolPlugin: EditorPlugin = {
  id: 'com.svge.tools.select',
  name: 'Select Tool (builtin)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  install(ctx) {
    const reg = ctx.injector.get(ToolRegistry);
    ctx.track(reg.register(new SelectTool()));
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
