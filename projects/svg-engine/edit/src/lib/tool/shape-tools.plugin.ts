import {
  CommandBus,
  createEllipse,
  createPolygon,
  createRect,
  EditorStateService,
  InsertNodeCommand,
} from 'svg-engine/core';
import { type EditorPlugin, PLUGIN_API_VERSION } from '../plugin/plugin';
import { SelectionService } from '../selection/selection.service';
import {
  boundsOfDraft,
  DEFAULT_POLYGON_SIDES,
  regularPolygonPoints,
  type ShapeKind,
  ShapeToolService,
} from './shape-tool.service';
import type { Tool, ToolContext, ToolPointerEvent } from './tool';
import { ToolRegistry } from './tool-registry.service';

/** Stable ids — reverse-DNS, consistent with existing builtin tools. */
export const RECTANGLE_TOOL_ID = 'com.svge.tool.rectangle';
export const ELLIPSE_TOOL_ID = 'com.svge.tool.ellipse';
export const POLYGON_TOOL_ID = 'com.svge.tool.polygon';

/**
 * Minimum bounding box edge (doc units) required to commit a shape.
 * Below this the user almost certainly clicked without intending to
 * draw — we drop the gesture so the document doesn't accumulate
 * invisible 0×0 or 1×1 shapes from accidental clicks.
 */
const MIN_SHAPE_EDGE_PX = 2;

/**
 * Builtin shape tools — Rectangle, Ellipse, Polygon. Each implements
 * the same press-drag-release gesture via the shared
 * {@link ShapeToolService}, then commits one {@link InsertNodeCommand}
 * on release with the type-specific factory.
 *
 * **Interaction model** (Illustrator/Affinity convention):
 *
 * - **Press + drag + release**: defines the bounding rect; on release,
 *   a new shape is inserted at the document root with the cursor's
 *   final extent.
 * - **Shift**: constrain to square / circle / regular polygon
 *   (`min(|dx|, |dy|)` on both axes).
 * - **Alt**: interpret the press point as the CENTER of the shape
 *   rather than the top-left corner (handy when you know the center
 *   but not the size).
 * - **Esc** during drag: cancel without inserting.
 * - **Tool stays active** after release — keep drawing more shapes
 *   without re-selecting the tool, matching Illustrator's "persistent
 *   tools" UX (you have to press V/Esc/etc. to leave the tool).
 *
 * **Style of created shapes**: 1px black stroke, no fill (matches
 * Pencil tool default — consistent across all "creation" tools). The
 * user immediately can apply a fill via the Inspector after creating.
 */
class ShapeTool implements Tool {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly cursor = 'crosshair';
  readonly shortcut: string;

  constructor(
    id: string,
    label: string,
    shortcut: string,
    private readonly kind: ShapeKind,
  ) {
    this.id = id;
    this.label = label;
    this.shortcut = shortcut;
    // Material icon per shape kind — drives the tools-palette button face.
    this.icon =
      kind === 'rect' ? 'crop_square' : kind === 'ellipse' ? 'radio_button_unchecked' : 'pentagon';
  }

  onActivate(ctx: ToolContext): void {
    // Clear selection so the new shape appears unobscured by the old
    // selection's overlay. Matches Pencil/Pen convention.
    ctx.injector.get(SelectionService).clear();
    // Drop any stale draft from a previous gesture (paranoia — a
    // gesture should always end with `commit` or `cancel`, but if
    // something weird happened we don't want phantom previews).
    ctx.injector.get(ShapeToolService).cancel();
  }

  onDeactivate(ctx: ToolContext): void {
    ctx.injector.get(ShapeToolService).cancel();
  }

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const shapes = ctx.injector.get(ShapeToolService);
    shapes.begin(this.kind, event.docPoint, {
      shift: event.shiftKey,
      alt: event.altKey,
    });
  }

  onPointerMove(event: ToolPointerEvent, ctx: ToolContext): void {
    const shapes = ctx.injector.get(ShapeToolService);
    if (!shapes.isDrafting()) return;
    shapes.update(event.docPoint, {
      shift: event.shiftKey,
      alt: event.altKey,
    });
  }

  onPointerUp(_event: ToolPointerEvent, ctx: ToolContext): void {
    const shapes = ctx.injector.get(ShapeToolService);
    const draft = shapes.draft();
    if (draft === null) return;
    const bounds = boundsOfDraft(draft);
    shapes.cancel(); // always clear the draft so the overlay disappears
    // Filter degenerate shapes — accidental clicks shouldn't pollute
    // the document with invisible 0×0 / 1×1 nodes.
    if (bounds.w < MIN_SHAPE_EDGE_PX || bounds.h < MIN_SHAPE_EDGE_PX) return;
    // TOOL-OPT-B: read style + per-kind options from the service so the
    // tool-options bar's controls take effect on the next commit. Defaults
    // match the prior hardcoded values for back-compat.
    const node = buildShapeNode(this.kind, bounds, shapes);
    if (node === null) return;
    const root = ctx.injector.get(EditorStateService).document().root;
    ctx.injector.get(CommandBus).dispatch(new InsertNodeCommand(root.id, node));
  }

  onPointerCancel(_event: ToolPointerEvent, ctx: ToolContext): void {
    ctx.injector.get(ShapeToolService).cancel();
  }

  onKeyDown(event: KeyboardEvent, ctx: ToolContext): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      ctx.injector.get(ShapeToolService).cancel();
    }
  }
}

/**
 * Build a `SvgNode` of the right type from the gesture's final
 * bounding box. Returns `null` for degenerate inputs (caller already
 * filters those, but defensive). TOOL-OPT-B: reads style + per-kind
 * options from the ShapeToolService so the options bar's choices
 * take effect on the next commit. Defaults preserve the prior
 * `fill:none + stroke:#000000 + strokeWidth:1` look.
 */
function buildShapeNode(
  kind: ShapeKind,
  bounds: { x: number; y: number; w: number; h: number },
  prefs: ShapeToolService,
): import('svg-engine/core').SvgNode | null {
  const style = {
    fill: prefs.fill(),
    stroke: prefs.stroke(),
    strokeWidth: prefs.strokeWidth(),
  };
  switch (kind) {
    case 'rect': {
      const r = prefs.cornerRadius();
      const rectArgs: {
        x: number;
        y: number;
        width: number;
        height: number;
        rx?: number;
        ry?: number;
      } = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.w,
        height: bounds.h,
      };
      if (r > 0) {
        rectArgs.rx = r;
        rectArgs.ry = r;
      }
      return createRect(rectArgs, { style });
    }
    case 'ellipse':
      return createEllipse(
        {
          cx: bounds.x + bounds.w / 2,
          cy: bounds.y + bounds.h / 2,
          rx: bounds.w / 2,
          ry: bounds.h / 2,
        },
        { style },
      );
    case 'polygon': {
      const sides = prefs.polygonSides();
      const points = prefs.starMode()
        ? regularStarPoints(bounds, sides, prefs.starInnerRadius())
        : regularPolygonPoints(bounds, sides);
      if (points.length === 0) return null;
      return createPolygon(points, { style });
    }
  }
}

/**
 * Generate the vertices of a regular star polygon — alternating
 * between outer (bounds-inscribed) and inner (scaled by `innerFrac`)
 * radii. Used when ShapeToolService.starMode() is true. `innerFrac`
 * is clamped to [0.1, 0.95] for sane visuals.
 */
function regularStarPoints(
  bounds: { x: number; y: number; w: number; h: number },
  outerSides: number,
  innerFrac: number,
): readonly import('svg-engine/core').Point[] {
  const n = Math.max(3, Math.min(32, Math.round(outerSides)));
  if (bounds.w === 0 || bounds.h === 0) return [];
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const rxOuter = bounds.w / 2;
  const ryOuter = bounds.h / 2;
  const inner = Math.max(0.1, Math.min(0.95, innerFrac));
  const rxInner = rxOuter * inner;
  const ryInner = ryOuter * inner;
  const out: import('svg-engine/core').Point[] = [];
  for (let i = 0; i < n * 2; i++) {
    const angle = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    const useOuter = i % 2 === 0;
    const rx = useOuter ? rxOuter : rxInner;
    const ry = useOuter ? ryOuter : ryInner;
    out.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) });
  }
  return out;
}

/**
 * Builtin shape-tools plugin. Registers all three tools as a paired
 * set — same convention as the select plugin (V + A registered
 * together). Consumers opt in once via
 * `provideSvgEnginePlugin(shapeToolsPlugin)`.
 */
export const shapeToolsPlugin: EditorPlugin = {
  id: 'com.svge.tools.shapes',
  name: 'Shape Tools (builtin)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  install(ctx) {
    const reg = ctx.injector.get(ToolRegistry);
    ctx.track(reg.register(new ShapeTool(RECTANGLE_TOOL_ID, 'Rectangle', 'r', 'rect')));
    ctx.track(reg.register(new ShapeTool(ELLIPSE_TOOL_ID, 'Ellipse', 'e', 'ellipse')));
    ctx.track(reg.register(new ShapeTool(POLYGON_TOOL_ID, 'Polygon', 'y', 'polygon')));
  },
};

/** Re-exported helpers for caller-side tests + the overlay. */
export { boundsOfDraft, DEFAULT_POLYGON_SIDES, regularPolygonPoints, type ShapeKind };
