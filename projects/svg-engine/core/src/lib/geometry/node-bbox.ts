import {
  isGroupNode,
  type EllipseNode,
  type GroupNode,
  type ImageNode,
  type LineNode,
  type PathNode,
  type PolygonNode,
  type PolylineNode,
  type RectNode,
  type SvgNode,
  type TextNode,
} from '../model';
import type { NodeId } from '../types/node-id';
import { applyTransform, IDENTITY_TRANSFORM, multiply, type Transform } from '../types/transform';
import { type BoundingBox, bbox, unionBBox } from '../types/bounding-box';
import { parsePathD } from './path-d-scaler';

/**
 * Pure, model-only bounding-box estimator for {@link SvgNode}s. Used by
 * viewport culling (Fase 6b-2) to decide whether a node's bbox overlaps
 * the visible viewBox without calling browser DOM APIs (`getBBox`,
 * `getBoundingClientRect`) — those are expensive at scale, depend on
 * the node already being in the DOM, and require layout to have settled.
 *
 * **Contract**:
 *
 * - **Input**: any {@link SvgNode} + an optional parent transform that
 *   composes ABOVE the node's own transform (used for recursion into
 *   groups; default identity).
 * - **Output**: a {@link BoundingBox} in document space that **fully
 *   contains** the rendered shape. The bbox is allowed to be larger
 *   than the true visual extent — that's the safe direction for
 *   culling (false positive = render anyway = correct output; false
 *   negative = skip rendering a visible thing = wrong).
 *
 * **Approximation strategy per type**:
 *
 * - `rect`, `image`: exact bbox of `(x, y, w, h)` corners.
 * - `ellipse`: bbox of `(cx ± rx, cy ± ry)` corners. Tighter
 *   approximations exist for rotated ellipses but the 4-corner method
 *   is a safe over-estimate.
 * - `line`, `polygon`, `polyline`: bbox of the literal vertex set.
 * - `path`: bbox of the path's command endpoints + Bezier control
 *   points (control points lie outside the curve, giving a safe
 *   over-estimate). Arcs use bounding box of start/end points
 *   (under-approximates curve sweep — see caveat below).
 * - `text`: heuristic bbox derived from `fontSize`, `content.length`,
 *   and `textAnchor`. ASCII-width assumption (0.6 × fontSize per
 *   character) plus padding for ascenders/descenders. Reasonable for
 *   culling; not for layout decisions.
 * - `group`: union of children's recursively-computed world bboxes.
 *   Empty groups get a degenerate zero-size bbox at the transform
 *   origin (won't intersect anything, so will be culled — desired).
 *
 * **Rotation/skew handling**: when the cumulative transform is non-
 * orthogonal, the AABB of the transformed shape's vertices is wider
 * than the rotated shape itself. That's fine — over-approximation is
 * safe for culling. Tighter rotated bounds would require oriented
 * bounding boxes which add complexity without changing culling
 * correctness.
 *
 * **Caveats (documented; acceptable for culling)**:
 *
 * - Arcs (`A` path command): bbox uses only start/end points, ignoring
 *   the curve sweep. An arc can extend well beyond its endpoints. In
 *   practice arcs are rare in editor output and the under-estimate is
 *   only triggered for arcs that span the viewport edge.
 * - Stroke width: bbox excludes stroke half-width. A node with a thick
 *   stroke partially out-of-viewport may be culled before the stroke
 *   itself crosses the boundary. Mitigation: add `strokeWidth / 2`
 *   margin when calling culling, OR ignore for typical 1-2px strokes
 *   where the visual error is sub-pixel.
 * - Text: width heuristic doesn't account for actual font metrics.
 *   Glyph widths vary; non-ASCII glyphs may be wider. The 0.6×
 *   factor is tuned for typical sans-serif at ASCII.
 *
 * **Performance**: O(node-vertex-count). Path `d` parsing dominates
 * for path-heavy docs; consider memoizing with a `WeakMap<SvgNode,
 * BoundingBox>` keyed by node identity (safe because nodes are
 * immutable — a new node reference means new geometry).
 */
export function getNodeBBox(
  node: SvgNode,
  parentTransform: Transform = IDENTITY_TRANSFORM,
): BoundingBox {
  const t =
    parentTransform === IDENTITY_TRANSFORM
      ? node.transform
      : multiply(parentTransform, node.transform);
  switch (node.type) {
    case 'rect':
      return bboxOfRect(node, t);
    case 'ellipse':
      return bboxOfEllipse(node, t);
    case 'line':
      return bboxOfLine(node, t);
    case 'polygon':
      return bboxOfPolygon(node, t);
    case 'polyline':
      return bboxOfPolyline(node, t);
    case 'path':
      return bboxOfPath(node, t);
    case 'text':
      return bboxOfText(node, t);
    case 'image':
      return bboxOfImage(node, t);
    case 'group':
      return bboxOfGroup(node, t);
    case 'symbol-use':
      // D-059 — symbol instance. We don't have the master's geometry
      // here (the catalog lives in /edit), so use the explicit
      // width/height when set, else fall back to a default 100×100
      // (matches the SVG `<symbol viewBox>` default). The DOM-based
      // `getRenderedNodeBBox` in /edit gives the precise bbox at
      // render time for interactive editing; this is the
      // geometry-only fallback for headless / pre-render use cases.
      return aabbOfPoints(t, [
        [node.x, node.y],
        [node.x + (node.width ?? 100), node.y],
        [node.x + (node.width ?? 100), node.y + (node.height ?? 100)],
        [node.x, node.y + (node.height ?? 100)],
      ]);
  }
}

// ── Per-type implementations ────────────────────────────────────────

function bboxOfRect(node: RectNode, t: Transform): BoundingBox {
  return aabbOfPoints(t, [
    [node.x, node.y],
    [node.x + node.width, node.y],
    [node.x + node.width, node.y + node.height],
    [node.x, node.y + node.height],
  ]);
}

function bboxOfEllipse(node: EllipseNode, t: Transform): BoundingBox {
  // Use the inscribing-rectangle's 4 corners. For a rotated ellipse the
  // AABB of the actual curve is tighter than the AABB of the corners,
  // but both are safe over-estimates for culling.
  return aabbOfPoints(t, [
    [node.cx - node.rx, node.cy - node.ry],
    [node.cx + node.rx, node.cy - node.ry],
    [node.cx + node.rx, node.cy + node.ry],
    [node.cx - node.rx, node.cy + node.ry],
  ]);
}

function bboxOfLine(node: LineNode, t: Transform): BoundingBox {
  return aabbOfPoints(t, [
    [node.x1, node.y1],
    [node.x2, node.y2],
  ]);
}

function bboxOfPolygon(node: PolygonNode, t: Transform): BoundingBox {
  if (node.points.length === 0) return degenerateAt(t);
  return aabbOfPoints(
    t,
    node.points.map((p) => [p.x, p.y]),
  );
}

function bboxOfPolyline(node: PolylineNode, t: Transform): BoundingBox {
  if (node.points.length === 0) return degenerateAt(t);
  return aabbOfPoints(
    t,
    node.points.map((p) => [p.x, p.y]),
  );
}

function bboxOfPath(node: PathNode, t: Transform): BoundingBox {
  const segs = parsePathD(node.d);
  const points: [number, number][] = [];
  let cx = 0;
  let cy = 0;
  let startX = 0;
  let startY = 0;
  for (const seg of segs) {
    const c = seg.cmd;
    const isRel = c === c.toLowerCase() && c !== c.toUpperCase();
    const a = seg.args;
    switch (c.toUpperCase()) {
      case 'M':
      case 'L':
      case 'T':
        for (let i = 0; i + 1 < a.length; i += 2) {
          const x = isRel ? cx + (a[i] ?? 0) : (a[i] ?? 0);
          const y = isRel ? cy + (a[i + 1] ?? 0) : (a[i + 1] ?? 0);
          points.push([x, y]);
          cx = x;
          cy = y;
          if (c.toUpperCase() === 'M' && i === 0) {
            startX = x;
            startY = y;
          }
        }
        break;
      case 'H':
        for (const arg of a) {
          const x = isRel ? cx + arg : arg;
          points.push([x, cy]);
          cx = x;
        }
        break;
      case 'V':
        for (const arg of a) {
          const y = isRel ? cy + arg : arg;
          points.push([cx, y]);
          cy = y;
        }
        break;
      case 'C':
        for (let i = 0; i + 5 < a.length; i += 6) {
          // Control points 1 & 2 + endpoint. Control points safely
          // over-estimate cubic Bezier curve bounds.
          const x1 = isRel ? cx + (a[i] ?? 0) : (a[i] ?? 0);
          const y1 = isRel ? cy + (a[i + 1] ?? 0) : (a[i + 1] ?? 0);
          const x2 = isRel ? cx + (a[i + 2] ?? 0) : (a[i + 2] ?? 0);
          const y2 = isRel ? cy + (a[i + 3] ?? 0) : (a[i + 3] ?? 0);
          const x = isRel ? cx + (a[i + 4] ?? 0) : (a[i + 4] ?? 0);
          const y = isRel ? cy + (a[i + 5] ?? 0) : (a[i + 5] ?? 0);
          points.push([x1, y1], [x2, y2], [x, y]);
          cx = x;
          cy = y;
        }
        break;
      case 'S':
      case 'Q':
        for (let i = 0; i + 3 < a.length; i += 4) {
          const x1 = isRel ? cx + (a[i] ?? 0) : (a[i] ?? 0);
          const y1 = isRel ? cy + (a[i + 1] ?? 0) : (a[i + 1] ?? 0);
          const x = isRel ? cx + (a[i + 2] ?? 0) : (a[i + 2] ?? 0);
          const y = isRel ? cy + (a[i + 3] ?? 0) : (a[i + 3] ?? 0);
          points.push([x1, y1], [x, y]);
          cx = x;
          cy = y;
        }
        break;
      case 'A':
        // Arc: endpoint only (under-approximation; documented caveat).
        // 7 args per arc: rx ry x-axis-rot large-arc sweep x y.
        for (let i = 0; i + 6 < a.length; i += 7) {
          const x = isRel ? cx + (a[i + 5] ?? 0) : (a[i + 5] ?? 0);
          const y = isRel ? cy + (a[i + 6] ?? 0) : (a[i + 6] ?? 0);
          points.push([x, y]);
          cx = x;
          cy = y;
        }
        break;
      case 'Z':
        cx = startX;
        cy = startY;
        break;
    }
  }
  if (points.length === 0) return degenerateAt(t);
  return aabbOfPoints(t, points);
}

function bboxOfText(node: TextNode, t: Transform): BoundingBox {
  // Heuristic: 0.6 × fontSize per character horizontally, 1.2 × fontSize
  // vertically (ascent + descent + leading). textAnchor shifts the
  // origin horizontally.
  const fontSize = node.fontSize ?? 16;
  const width = Math.max(1, node.content.length) * fontSize * 0.6;
  const height = fontSize * 1.2;
  const anchorOffset =
    node.textAnchor === 'middle' ? width / 2 : node.textAnchor === 'end' ? width : 0;
  const x0 = node.x - anchorOffset;
  const y0 = node.y - fontSize;
  return aabbOfPoints(t, [
    [x0, y0],
    [x0 + width, y0],
    [x0 + width, y0 + height],
    [x0, y0 + height],
  ]);
}

function bboxOfImage(node: ImageNode, t: Transform): BoundingBox {
  return aabbOfPoints(t, [
    [node.x, node.y],
    [node.x + node.width, node.y],
    [node.x + node.width, node.y + node.height],
    [node.x, node.y + node.height],
  ]);
}

function bboxOfGroup(node: GroupNode, t: Transform): BoundingBox {
  if (!isGroupNode(node) || node.children.length === 0) return degenerateAt(t);
  let union: BoundingBox | null = null;
  for (const child of node.children) {
    const childBox = getNodeBBox(child, t);
    union = union === null ? childBox : unionBBox(union, childBox);
  }
  return union ?? degenerateAt(t);
}

// ── Helpers ─────────────────────────────────────────────────────────

/** AABB of a point set after applying the cumulative transform. */
function aabbOfPoints(t: Transform, points: readonly [number, number][]): BoundingBox {
  if (points.length === 0) return degenerateAt(t);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    const p = applyTransform(t, x, y);
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return bbox(minX, minY, maxX - minX, maxY - minY);
}

/** Zero-size bbox at the transform's translation component. */
function degenerateAt(t: Transform): BoundingBox {
  return bbox(t[4], t[5], 0, 0);
}

/**
 * **D-118** — union of the WORLD (document-space) bounding boxes of every node
 * in `root`'s subtree whose id is in `ids`. Composes the ancestor transform
 * chain, so a node nested inside translated/rotated groups frames correctly.
 *
 * Pure + model-only (same over-estimate caveats as {@link getNodeBBox} — safe
 * for "fit to selection" / culling). Returns `null` when no id resolves (empty
 * or stale selection). A selected node short-circuits the walk into its own
 * subtree: its bbox already contains every descendant.
 */
export function getNodesWorldBBox(root: SvgNode, ids: ReadonlySet<NodeId>): BoundingBox | null {
  if (ids.size === 0) return null;
  let union: BoundingBox | null = null;
  const collect = (node: SvgNode, parentTransform: Transform): void => {
    if (ids.has(node.id)) {
      const box = getNodeBBox(node, parentTransform);
      union = union === null ? box : unionBBox(union, box);
      return; // node's bbox already covers its whole subtree
    }
    if (isGroupNode(node)) {
      const childTransform =
        node.transform === IDENTITY_TRANSFORM
          ? parentTransform
          : multiply(parentTransform, node.transform);
      for (const child of node.children) collect(child, childTransform);
    }
  };
  collect(root, IDENTITY_TRANSFORM);
  return union;
}
