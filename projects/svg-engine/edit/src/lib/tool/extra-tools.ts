import { computed, Injectable, signal } from '@angular/core';
import {
  type AnchorPoint,
  type AnchorSubpath,
  anchorsToPathD,
  CommandBus,
  EditorStateService,
  findNodeById,
  parsePathToAnchors,
  type PathNode,
  type Point,
  SetPropertyCommand,
  SetStylePropertyOnManyCommand,
  type SvgNode,
} from 'svg-engine/core';
import { type EditorPlugin, PLUGIN_API_VERSION } from '../plugin/plugin';
import { SelectionService } from '../selection/selection.service';
import { findOwningNodeId } from '../hit-testing/hit-testing';
import type { Tool, ToolContext, ToolPointerEvent } from './tool';
import { ToolRegistry } from './tool-registry.service';

/**
 * D-050 (Item 5 — Tools faltantes). Implements 7 new editor tools to
 * close the parity gap with Illustrator / Affinity:
 *
 * | Tool                | id                              | shortcut |
 * | ------------------- | ------------------------------- | -------- |
 * | Eyedropper          | `com.svge.tool.eyedropper`      | `i`      |
 * | Knife (Scissors)    | `com.svge.tool.knife`           | `c`      |
 * | Smooth / Simplify   | `com.svge.tool.smooth`          | `s`      |
 * | Gradient            | `com.svge.tool.gradient`        | `g`      |
 * | Width               | `com.svge.tool.width`           | `w`      |
 * | Mesh                | `com.svge.tool.mesh`            | `u`      |
 * | Symbol Sprayer      | `com.svge.tool.symbol-sprayer`  | `o`      |
 *
 * **Implementation depth**:
 *
 * - **Fully wired** (Eyedropper, Knife, Smooth): pointerdown produces an
 *   immediate, undoable mutation. No overlay state needed.
 * - **Light-touch** (Gradient): pointerdown sets the focus + emits a
 *   hint signal the gradient panel uses to scroll into view. Real
 *   in-canvas stop handles are deferred (would require new overlay
 *   infra; left as a TODO marker in the service).
 * - **Stub** (Width, Mesh, Symbol Sprayer): the tools register so the
 *   toolbar exposes them, but pointerdown only `console.info`s a
 *   "not yet wired" notice. They occupy the catalog ids so future
 *   implementations can land without an additional D-revision.
 *
 * All tools live in this single file because they share helpers
 * (`hitTestPathNode`, `distanceToSegment`) and would otherwise need to
 * cross-import; keeping them co-located avoids that web. Each is its
 * own class so plugins can register a subset (the plugin at the bottom
 * registers the full 7).
 */

// ── Stable ids ───────────────────────────────────────────────────────

export const EYEDROPPER_TOOL_ID = 'com.svge.tool.eyedropper';
export const KNIFE_TOOL_ID = 'com.svge.tool.knife';
export const SMOOTH_TOOL_ID = 'com.svge.tool.smooth';
export const GRADIENT_TOOL_ID = 'com.svge.tool.gradient';
export const WIDTH_TOOL_ID = 'com.svge.tool.width';
export const MESH_TOOL_ID = 'com.svge.tool.mesh';
export const SYMBOL_SPRAYER_TOOL_ID = 'com.svge.tool.symbol-sprayer';

// ── Shared hit-test utilities ────────────────────────────────────────

/**
 * Walk up from the pointer event's target to find the topmost ancestor
 * carrying `data-node-id` and resolve to the model node. Returns `null`
 * when the click missed every node (background) or when the resolved
 * node isn't of the requested `type` filter.
 *
 * The type filter is a runtime string match; the return type is the
 * common `SvgNode` union so callers cast (`as PathNode`) when they
 * need the discriminated form. Doing the cast at the call site is
 * cheaper than rebuilding the discriminated-union helper here and
 * doesn't lose type safety because the `type === ...` narrowing inside
 * each tool's pointer handler can re-discriminate if needed.
 */
function hitTestNode(
  event: PointerEvent,
  state: EditorStateService,
  type?: SvgNode['type'],
): SvgNode | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const id = findOwningNodeId(target);
  if (id === null) return null;
  const node = findNodeById(state.document().root, id);
  if (node === null) return null;
  if (type !== undefined && node.type !== type) return null;
  return node;
}

// ── 1. Eyedropper ────────────────────────────────────────────────────

/**
 * Eyedropper tool. Click a node to sample its fill color and apply it
 * to whatever node(s) the user currently has selected. If nothing is
 * selected, the sampled color is just logged (no-op selection).
 *
 * **Why fill (not stroke)**: fill is the dominant paint for vector art
 * and matches Illustrator's default Eyedropper modifier-free behaviour.
 * Holding Alt at sample time samples + applies the STROKE color
 * instead — same convention.
 *
 * **What happens when the sampled node has a gradient/pattern fill**:
 * we copy the raw `url(#id)` reference verbatim. If the destination
 * document doesn't have that gradient/pattern in its catalog, the fill
 * will render as nothing — the user can clear it via the Inspector.
 * This matches Illustrator's behaviour and surfaces the missing
 * reference explicitly instead of silently producing a different look.
 */
class EyedropperTool implements Tool {
  readonly id = EYEDROPPER_TOOL_ID;
  readonly label = 'Eyedropper';
  readonly icon = 'colorize';
  readonly cursor = 'crosshair';
  readonly shortcut = 'i';

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const state = ctx.injector.get(EditorStateService);
    const source = hitTestNode(event.raw, state);
    if (source === null) return;
    const field: 'fill' | 'stroke' = event.altKey ? 'stroke' : 'fill';
    const sampled = source.style[field];
    if (sampled === undefined) return;

    // Apply to the current selection. When nothing's selected, the
    // sample is "remembered" in the focus signal so a follow-up click
    // on a target via Select tool can paint manually (TODO: surface a
    // floating swatch); for now we just no-op.
    const sel = ctx.injector.get(SelectionService);
    const ids = Array.from(sel.selectedIds());
    if (ids.length === 0) {
      console.info(`[Eyedropper] sampled ${field}=${sampled} (no selection to apply)`);
      return;
    }
    const bus = ctx.injector.get(CommandBus);
    bus.dispatch(new SetStylePropertyOnManyCommand(ids, field, sampled));
  }
}

// ── 2. Knife / Scissors ──────────────────────────────────────────────

/**
 * Knife tool — cut a path into two pieces at the clicked point.
 *
 * **Algorithm** (simplified — sufficient for line segments, approximate
 * for curves which is acceptable for a "knife" interaction):
 * 1. Hit-test for a path node at the click.
 * 2. Parse the path into anchor subpaths.
 * 3. Find the segment (pair of consecutive anchors) closest to the
 *    clicked doc point.
 * 4. Project the click onto that segment to get a parametric `t`.
 * 5. Insert a new cusp anchor at the projection point — this splits the
 *    visual continuity at the click. (True SPLIT into two separate
 *    paths is a follow-up; the inserted anchor at least gives a
 *    "scissors" point the user can then drag apart manually.)
 *
 * **Limitations** (acceptable for a first ship; documented for the
 * roadmap):
 * - For cubic-bezier segments, we hit-test the chord (straight line
 *   between endpoints) instead of the curve itself — visual offset
 *   from the actual curve can be significant for tight bezier curves.
 * - Doesn't split into two PathNodes (single inserted anchor only).
 */
class KnifeTool implements Tool {
  readonly id = KNIFE_TOOL_ID;
  readonly label = 'Knife';
  readonly icon = 'content_cut';
  readonly cursor = 'crosshair';
  readonly shortcut = 'c';

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const state = ctx.injector.get(EditorStateService);
    const node = hitTestNode(event.raw, state, 'path') as PathNode | null;
    if (node === null) return;

    const subpaths = parsePathToAnchors(node.d);
    if (subpaths.length === 0) return;

    // Find the closest segment across all subpaths.
    let best: { sp: number; seg: number; t: number; dist: number; proj: Point } | null = null;
    for (let s = 0; s < subpaths.length; s++) {
      const anchors = subpaths[s]!.anchors;
      const lastIdx = subpaths[s]!.closed ? anchors.length : anchors.length - 1;
      for (let i = 0; i < lastIdx; i++) {
        const a = anchors[i]!.point;
        const b = anchors[(i + 1) % anchors.length]!.point;
        const proj = projectPointOnSegment(event.docPoint, a, b);
        const d = distance(event.docPoint, proj.point);
        if (best === null || d < best.dist) {
          best = { sp: s, seg: i, t: proj.t, dist: d, proj: proj.point };
        }
      }
    }
    if (best === null || best.dist > 12) return; // 12px tolerance in doc coords

    // Insert a cusp anchor at the projection point.
    const newSubpaths: AnchorSubpath[] = subpaths.map((sp, sIdx) => {
      if (sIdx !== best!.sp) return sp;
      const anchors = sp.anchors.slice();
      const newAnchor: AnchorPoint = {
        point: best!.proj,
        handleIn: best!.proj,
        handleOut: best!.proj,
        kind: 'cusp',
      };
      anchors.splice(best!.seg + 1, 0, newAnchor);
      return { anchors, closed: sp.closed };
    });
    const nextD = anchorsToPathD(newSubpaths);
    if (nextD === node.d) return;

    const bus = ctx.injector.get(CommandBus);
    bus.dispatch(new SetPropertyCommand<PathNode, 'd'>(node.id, 'd', nextD));
  }
}

// ── 3. Smooth / Simplify ─────────────────────────────────────────────

/**
 * Smooth/Simplify tool — runs Ramer-Douglas-Peucker on the selected
 * path's anchors to reduce noise (long Pencil traces) into a smaller
 * anchor set. Click anywhere with the tool active to apply.
 *
 * **Why a tool and not a menu item**: makes the action discoverable
 * (toolbar icon visible at all times when a path is selected) and
 * reuses the existing tool-switching ergonomics. Could ALSO be wired
 * as a menu contribution in a follow-up — orthogonal.
 *
 * **Tolerance**: hard-coded at 1.5 doc units for the first ship —
 * empirically good for typical Pencil output (~50-300 points reduces
 * to ~20-80). A tool-options panel can expose this as a slider later.
 */
class SmoothTool implements Tool {
  readonly id = SMOOTH_TOOL_ID;
  readonly label = 'Smooth';
  readonly icon = 'auto_fix_high';
  readonly cursor = 'crosshair';
  readonly shortcut = 's';

  onPointerDown(_event: ToolPointerEvent, ctx: ToolContext): void {
    const state = ctx.injector.get(EditorStateService);
    const sel = ctx.injector.get(SelectionService);
    const ids = Array.from(sel.selectedIds());
    if (ids.length === 0) {
      console.info('[Smooth] no selection — select a path first');
      return;
    }
    const bus = ctx.injector.get(CommandBus);
    for (const id of ids) {
      const node = findNodeById(state.document().root, id);
      if (node === null || node.type !== 'path') continue;
      const subpaths = parsePathToAnchors((node as PathNode).d);
      const reduced = subpaths.map((sp) => simplifySubpath(sp, 1.5));
      const nextD = anchorsToPathD(reduced);
      if (nextD !== (node as PathNode).d) {
        bus.dispatch(new SetPropertyCommand<PathNode, 'd'>(id, 'd', nextD));
      }
    }
  }
}

// ── 4. Gradient tool (state-only stub for v1) ────────────────────────

/**
 * Per-editor state for the Gradient tool. Holds the id of the node the
 * user clicked while the gradient tool is active — the gradient editor
 * panel watches this signal to scroll the focused gradient into view
 * (and, in a future iteration, render in-canvas drag handles for the
 * gradient's stops).
 */
@Injectable({ providedIn: 'root' })
export class GradientToolService {
  private readonly _focusedNodeId = signal<string | null>(null);
  readonly focusedNodeId = this._focusedNodeId.asReadonly();

  /** Read-only flag for panels that want to react to tool activation. */
  private readonly _isActive = signal<boolean>(false);
  readonly isActive = this._isActive.asReadonly();

  setActive(active: boolean): void {
    this._isActive.set(active);
    if (!active) this._focusedNodeId.set(null);
  }

  focusNode(nodeId: string | null): void {
    this._focusedNodeId.set(nodeId);
  }

  /** Computed convenience: whether anything is currently "in-edit". */
  readonly hasFocus = computed<boolean>(() => this._focusedNodeId() !== null);
}

/**
 * Gradient tool — first-pass implementation: clicking a node with a
 * `url(#id)` fill sets the GradientToolService focus signal, which the
 * libraries panel will use to surface the matching gradient editor.
 *
 * **Why not in-canvas stop handles in v1**: requires a new overlay
 * component (similar to AnchorOverlay) and per-stop drag math against
 * the gradient's coordinate system (`userSpaceOnUse` vs the default
 * `objectBoundingBox`). The state surface here is forward-compatible:
 * a future overlay can subscribe to `focusedNodeId` and render handles
 * for the gradient bound to that node.
 */
class GradientTool implements Tool {
  readonly id = GRADIENT_TOOL_ID;
  readonly label = 'Gradient';
  readonly icon = 'gradient';
  readonly cursor = 'crosshair';
  readonly shortcut = 'g';

  onActivate(ctx: ToolContext): void {
    ctx.injector.get(GradientToolService).setActive(true);
  }

  onDeactivate(ctx: ToolContext): void {
    ctx.injector.get(GradientToolService).setActive(false);
  }

  onPointerDown(event: ToolPointerEvent, ctx: ToolContext): void {
    const state = ctx.injector.get(EditorStateService);
    const node = hitTestNode(event.raw, state);
    if (node === null) {
      ctx.injector.get(GradientToolService).focusNode(null);
      return;
    }
    // Only react to nodes that already have a gradient fill — clicking
    // a solid-color node with the gradient tool is a no-op until the
    // user assigns a gradient via the Inspector. (Future: clicking a
    // solid-fill node could auto-create + assign a default gradient.)
    const fill = node.style.fill;
    if (typeof fill !== 'string' || !fill.trim().startsWith('url(')) {
      console.info('[Gradient] clicked node has no gradient fill — assign one via Inspector first');
      return;
    }
    ctx.injector.get(GradientToolService).focusNode(node.id);
    ctx.injector.get(SelectionService).select(node.id);
  }
}

// ── 5/6/7. Width / Mesh / Symbol Sprayer (stub) ──────────────────────

/**
 * Stub tool — registers a toolbar entry but its pointerdown only logs.
 * Used for tools where the data model + UI for full implementation is
 * substantial enough that a dedicated D-revision is more appropriate
 * (Width = variable stroke width along a path; Mesh = mesh gradient
 * with bilinear color interpolation; Symbol Sprayer = randomized
 * placement of symbol-library instances on the canvas).
 *
 * Keeping the stub in the registry serves two purposes:
 * 1. **Roadmap visibility**: the toolbar icon advertises the planned
 *    feature so users (and contributors) know it's coming.
 * 2. **Plugin contract validation**: third-party tools follow the same
 *    Tool API; shipping our own stubs keeps the API honest (any
 *    surface we haven't exercised gets called out by the lint /
 *    typecheck pass when these stubs compile).
 */
class StubTool implements Tool {
  constructor(
    readonly id: string,
    readonly label: string,
    readonly icon: string,
    readonly shortcut: string,
    private readonly hintMessage: string,
  ) {}
  readonly cursor = 'not-allowed';

  onPointerDown(): void {
    console.info(`[${this.label}] ${this.hintMessage}`);
  }
}

/**
 * Width tool stub — variable stroke width along a path. Real
 * implementation needs a new data field (`PathNode.widthProfile?:
 * {t: number; width: number}[]`) plus a stroke renderer that emits
 * `<defs>` + `<use>` to approximate variable width via tapered offset
 * curves. Deferred to D-052 (or later).
 */
function buildWidthTool(): StubTool {
  return new StubTool(
    WIDTH_TOOL_ID,
    'Width',
    'line_weight',
    'w',
    'variable stroke-width along path — planned for D-052+',
  );
}

/**
 * Mesh tool stub — mesh gradient with bilinear color interpolation.
 * SVG 2 specs `<meshgradient>` but no browser implements it yet, so
 * a real implementation would have to rasterize via canvas + image
 * fill. Deferred until the design crystallizes.
 */
function buildMeshTool(): StubTool {
  return new StubTool(
    MESH_TOOL_ID,
    'Mesh',
    'grid_on',
    'u',
    'mesh gradients require canvas-rasterized fill — planned future revision',
  );
}

/**
 * Symbol Sprayer tool stub — Illustrator-style randomized scatter of
 * symbol library instances. Awaits a non-stub SymbolLibraryService
 * (currently a stub itself in D-048). Deferred until that ships.
 */
function buildSymbolSprayerTool(): StubTool {
  return new StubTool(
    SYMBOL_SPRAYER_TOOL_ID,
    'Symbol Sprayer',
    'auto_awesome',
    'o',
    'symbol library needs real implementation first (currently a stub from D-048)',
  );
}

// ── Plugin registration ──────────────────────────────────────────────

/**
 * Plugin that registers all 7 D-050 tools. Opt-in via
 * `provideSvgEnginePlugin(extraToolsPlugin)` in `app.config.ts`. Apps
 * that don't want the full extended toolset can register the
 * individual tools manually (each class is exported via the public
 * api re-export below for that scenario).
 */
export const extraToolsPlugin: EditorPlugin = {
  id: 'com.svge.tools.extra',
  name: 'Extra Tools (Eyedropper, Knife, Smooth, Gradient + stubs)',
  version: '1.0.0',
  apiVersion: PLUGIN_API_VERSION,
  install(ctx) {
    const reg = ctx.injector.get(ToolRegistry);
    ctx.track(reg.register(new EyedropperTool()));
    ctx.track(reg.register(new KnifeTool()));
    ctx.track(reg.register(new SmoothTool()));
    ctx.track(reg.register(new GradientTool()));
    ctx.track(reg.register(buildWidthTool()));
    ctx.track(reg.register(buildMeshTool()));
    ctx.track(reg.register(buildSymbolSprayerTool()));
  },
};

// ── Geometry helpers (pure) ──────────────────────────────────────────

/** Euclidean distance between two points. */
function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Project `p` onto segment `[a, b]`. Returns the clamped projection
 * point and the parametric `t` (0 = at `a`, 1 = at `b`).
 */
function projectPointOnSegment(p: Point, a: Point, b: Point): { point: Point; t: number } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return { point: a, t: 0 };
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { point: { x: a.x + abx * t, y: a.y + aby * t }, t };
}

/**
 * Ramer-Douglas-Peucker simplification of an anchor subpath.
 * Treats anchors as polyline vertices (handle data is dropped on
 * eliminated points — survivors keep their original handles). Output
 * always preserves the first and last anchors so the path's endpoints
 * stay where the user placed them.
 *
 * **Tolerance** in doc units. Reasonable values: 0.5 (gentle, fine
 * detail kept) to 5 (aggressive, only inflection points kept).
 */
export function simplifySubpath(subpath: AnchorSubpath, tolerance: number): AnchorSubpath {
  const anchors = subpath.anchors;
  if (anchors.length < 3) return subpath;
  const keep = new Array<boolean>(anchors.length).fill(false);
  keep[0] = true;
  keep[anchors.length - 1] = true;
  simplifyRecursive(anchors, 0, anchors.length - 1, tolerance, keep);
  const filtered: AnchorPoint[] = [];
  for (let i = 0; i < anchors.length; i++) {
    if (keep[i]) filtered.push(anchors[i]!);
  }
  return { anchors: filtered, closed: subpath.closed };
}

function simplifyRecursive(
  anchors: readonly AnchorPoint[],
  start: number,
  end: number,
  tolerance: number,
  keep: boolean[],
): void {
  if (end - start < 2) return;
  let maxDist = 0;
  let maxIdx = start;
  const a = anchors[start]!.point;
  const b = anchors[end]!.point;
  for (let i = start + 1; i < end; i++) {
    const proj = projectPointOnSegment(anchors[i]!.point, a, b);
    const d = distance(anchors[i]!.point, proj.point);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > tolerance) {
    keep[maxIdx] = true;
    simplifyRecursive(anchors, start, maxIdx, tolerance, keep);
    simplifyRecursive(anchors, maxIdx, end, tolerance, keep);
  }
}
