import {
  type EllipseNode,
  type GroupNode,
  isGroupNode,
  type LineNode,
  type PolygonNode,
  type PolylineNode,
  type RectNode,
  type SvgDocument,
  type SvgNode,
  type SvgStyle,
  type TextNode,
} from 'svg-engine/core';
import type { Optimizer } from './optimizer';

/**
 * Round all geometric numeric values to a fixed precision (default 3
 * decimal places). Eliminates `0.30000000000000004` and friends that
 * accumulate from floating-point drag / scale gestures, without losing
 * meaningful coordinate precision.
 *
 * **Touches**: rect/ellipse/line/polygon/polyline/text/image positions
 * + sizes + radii; path `d` numeric tokens (via regex); transform
 * matrix components; style strokeWidth/opacity/fillOpacity/strokeOpacity.
 *
 * **Doesn't touch**: ids, hrefs, colors, transform STRUCTURE (only the
 * numbers inside it).
 *
 * **Order 10** — runs FIRST in the default pipeline so later passes
 * see clean rounded values.
 */
export const precisionOptimizer: Optimizer = {
  id: 'svge.builtin.optimize.precision',
  name: 'Round to precision',
  description: 'Round numeric values to 3 decimals to remove floating-point drift',
  order: 10,
  defaultEnabled: true,
  optimize(document: SvgDocument): SvgDocument {
    const root = mapNode(document.root, roundNode);
    if (root === document.root) return document;
    return { ...document, root: root as GroupNode };
  },
};

/**
 * Strip presentation-attribute values that match the SVG default
 * (e.g., `fill-opacity="1"`, `stroke-width="1"`). These attributes
 * are redundant in the output — removing them shrinks the file and
 * makes diffs less noisy.
 *
 * **Defaults handled**:
 * - `fillOpacity === 1`
 * - `strokeOpacity === 1`
 * - `opacity === 1`
 * - `visibility === 'visible'`
 *
 * **Order 50** — runs in the middle of the pipeline so precision
 * rounding (10) already cleaned the values + later passes (e.g.,
 * group pruning) see the minimized style.
 *
 * **NOT handled**: `fill === 'black'` / `stroke === 'none'` etc. Those
 * are arguably "defaults" but stripping them changes rendered output
 * if the parent specifies a different value (CSS inheritance). Safer
 * to leave color defaults explicit.
 */
export const dropDefaultsOptimizer: Optimizer = {
  id: 'svge.builtin.optimize.drop-defaults',
  name: 'Drop default values',
  description: 'Remove redundant style attributes equal to SVG defaults',
  order: 50,
  defaultEnabled: true,
  optimize(document: SvgDocument): SvgDocument {
    const root = mapNode(document.root, dropDefaultsFromNode);
    if (root === document.root) return document;
    return { ...document, root: root as GroupNode };
  },
};

/**
 * **D-072 follow-up — Strip authored-title emission preference.**
 *
 * Sets `document.exportPreferences.emitAuthoredTitles = false` so the
 * SVG exporter omits the `<title>...</title>` child element it would
 * otherwise emit for every node with `metadata.name`.
 *
 * **What it does NOT do**: remove `metadata.name` itself. The name
 * stays on the model — the layer panel still shows "Bercos", a future
 * export with the preference un-stripped (or the in-editor session)
 * still has the name available. Stripping is purely an export-side
 * decision, reversible by toggling the preference back to `true`.
 *
 * **Order 80** — runs after value-rounding (10) and default-dropping
 * (50), before group-pruning (90). Position doesn't really matter for
 * this pass (it doesn't touch the tree), but keeping it in the middle
 * makes the pipeline read top-to-bottom by "what touches what".
 *
 * **Opt-in** (`defaultEnabled: false`): the default pipeline preserves
 * authored names — stripping is for minified/production-ready output
 * where editor metadata is unwanted.
 */
export const stripAuthoredTitlesOptimizer: Optimizer = {
  id: 'svge.builtin.optimize.strip-authored-titles',
  name: 'Strip authored <title>',
  description:
    'Omit <title>...</title> children emitted for nodes with metadata.name. Toggles document.exportPreferences.emitAuthoredTitles.',
  order: 80,
  defaultEnabled: false,
  optimize(document: SvgDocument): SvgDocument {
    if (document.exportPreferences?.emitAuthoredTitles === false) return document;
    return {
      ...document,
      exportPreferences: {
        ...document.exportPreferences,
        emitAuthoredTitles: false,
      },
    };
  },
};

/**
 * Remove empty groups (`<g>` with no children) recursively. Common
 * after a delete-then-undo cycle or after the user ungroups+regroups.
 *
 * Preserves the document root (which is always a group) even if it
 * becomes empty — the root is a structural anchor, not a layer.
 *
 * **Order 90** — runs after value-rounding (10) and default-stripping
 * (50) so groups that became "empty" via earlier passes are picked up
 * in the same pipeline run.
 */
export const pruneEmptyGroupsOptimizer: Optimizer = {
  id: 'svge.builtin.optimize.prune-empty-groups',
  name: 'Prune empty groups',
  description: 'Remove <g> elements with no children (recursively)',
  order: 90,
  defaultEnabled: true,
  optimize(document: SvgDocument): SvgDocument {
    const rootChildren = pruneChildren(document.root.children);
    if (rootChildren === document.root.children) return document;
    return { ...document, root: { ...document.root, children: rootChildren } };
  },
};

// ── Helpers: per-pass node transforms ─────────────────────────────

const PRECISION = 3;
const FACTOR = 10 ** PRECISION;

function roundN(n: number | undefined): number | undefined {
  if (n === undefined || !Number.isFinite(n)) return n;
  return Math.round(n * FACTOR) / FACTOR;
}

function roundNode(node: SvgNode): SvgNode {
  switch (node.type) {
    case 'rect': {
      const r = node as RectNode;
      return {
        ...r,
        x: roundN(r.x)!,
        y: roundN(r.y)!,
        width: roundN(r.width)!,
        height: roundN(r.height)!,
        rx: roundN(r.rx),
        ry: roundN(r.ry),
        transform: roundTransform(r.transform),
        style: roundStyle(r.style),
      };
    }
    case 'ellipse': {
      const e = node as EllipseNode;
      return {
        ...e,
        cx: roundN(e.cx)!,
        cy: roundN(e.cy)!,
        rx: roundN(e.rx)!,
        ry: roundN(e.ry)!,
        transform: roundTransform(e.transform),
        style: roundStyle(e.style),
      };
    }
    case 'line': {
      const l = node as LineNode;
      return {
        ...l,
        x1: roundN(l.x1)!,
        y1: roundN(l.y1)!,
        x2: roundN(l.x2)!,
        y2: roundN(l.y2)!,
        transform: roundTransform(l.transform),
        style: roundStyle(l.style),
      };
    }
    case 'polygon':
    case 'polyline': {
      const p = node as PolygonNode | PolylineNode;
      return {
        ...p,
        points: p.points.map((pt) => ({ x: roundN(pt.x)!, y: roundN(pt.y)! })),
        transform: roundTransform(p.transform),
        style: roundStyle(p.style),
      };
    }
    case 'path':
      return {
        ...node,
        d: roundPathD(node.d),
        transform: roundTransform(node.transform),
        style: roundStyle(node.style),
      };
    case 'text': {
      const t = node as TextNode;
      return {
        ...t,
        x: roundN(t.x)!,
        y: roundN(t.y)!,
        fontSize: roundN(t.fontSize),
        transform: roundTransform(t.transform),
        style: roundStyle(t.style),
      };
    }
    case 'image':
      return {
        ...node,
        x: roundN(node.x)!,
        y: roundN(node.y)!,
        width: roundN(node.width)!,
        height: roundN(node.height)!,
        transform: roundTransform(node.transform),
        style: roundStyle(node.style),
      };
    case 'group':
      return { ...node, transform: roundTransform(node.transform), style: roundStyle(node.style) };
    case 'symbol-use':
      // D-059 — round x/y + optional width/height. Keep `symbolId`
      // verbatim (it's an id string, not a coord).
      return {
        ...node,
        x: roundN(node.x)!,
        y: roundN(node.y)!,
        width: roundN(node.width),
        height: roundN(node.height),
        transform: roundTransform(node.transform),
        style: roundStyle(node.style),
      };
  }
}

function roundTransform(
  t: readonly number[],
): readonly [number, number, number, number, number, number] {
  return [
    roundN(t[0])!,
    roundN(t[1])!,
    roundN(t[2])!,
    roundN(t[3])!,
    roundN(t[4])!,
    roundN(t[5])!,
  ] as [number, number, number, number, number, number];
}

/**
 * SvgStyle fields are readonly; we use a `-readonly` mutable view to
 * patch numeric fields then return as immutable.
 */
type MutableStyle = { -readonly [K in keyof SvgStyle]: SvgStyle[K] };

function roundStyle(style: SvgStyle): SvgStyle {
  const next: MutableStyle = { ...style };
  if (next.strokeWidth !== undefined) next.strokeWidth = roundN(next.strokeWidth)!;
  if (next.opacity !== undefined) next.opacity = roundN(next.opacity)!;
  if (next.fillOpacity !== undefined) next.fillOpacity = roundN(next.fillOpacity)!;
  if (next.strokeOpacity !== undefined) next.strokeOpacity = roundN(next.strokeOpacity)!;
  return next;
}

/**
 * Round numeric tokens inside a path `d` string. Regex matches
 * signed decimals (including scientific notation) — fast + correct
 * enough for our model where paths come from createPath/bake/import
 * (not hand-crafted with exotic spacing).
 */
function roundPathD(d: string): string {
  return d.replace(/-?\d+\.?\d*(?:[eE][+-]?\d+)?/g, (match) => {
    const n = Number.parseFloat(match);
    if (!Number.isFinite(n)) return match;
    const r = Math.round(n * FACTOR) / FACTOR;
    return Object.is(r, -0) ? '0' : String(r);
  });
}

function dropDefaultsFromNode(node: SvgNode): SvgNode {
  const next: MutableStyle = { ...node.style };
  let changed = false;
  if (next.fillOpacity === 1) {
    delete next.fillOpacity;
    changed = true;
  }
  if (next.strokeOpacity === 1) {
    delete next.strokeOpacity;
    changed = true;
  }
  if (next.opacity === 1) {
    delete next.opacity;
    changed = true;
  }
  if (next.visibility === 'visible') {
    delete next.visibility;
    changed = true;
  }
  return changed ? { ...node, style: next } : node;
}

/**
 * Recursively prune empty groups from a children array. Returns the
 * same reference when nothing changed — lets callers detect no-op.
 */
function pruneChildren(children: readonly SvgNode[]): readonly SvgNode[] {
  const out: SvgNode[] = [];
  let changed = false;
  for (const child of children) {
    if (isGroupNode(child)) {
      const prunedSub = pruneChildren(child.children);
      if (prunedSub.length === 0) {
        // Drop empty group entirely.
        changed = true;
        continue;
      }
      if (prunedSub !== child.children) {
        out.push({ ...child, children: prunedSub });
        changed = true;
      } else {
        out.push(child);
      }
    } else {
      out.push(child);
    }
  }
  return changed ? out : children;
}

/**
 * Walk a node tree, replacing each node by `fn(node)`. For groups,
 * the children are also recursed before the parent is mapped. Returns
 * the same reference if no transform produced a change.
 */
function mapNode(node: SvgNode, fn: (n: SvgNode) => SvgNode): SvgNode {
  if (isGroupNode(node)) {
    let childrenChanged = false;
    const nextChildren: SvgNode[] = [];
    for (const child of node.children) {
      const mapped = mapNode(child, fn);
      if (mapped !== child) childrenChanged = true;
      nextChildren.push(mapped);
    }
    const base: GroupNode = childrenChanged ? { ...node, children: nextChildren } : node;
    const mappedSelf = fn(base);
    return mappedSelf;
  }
  return fn(node);
}
