import type {
  EllipseNode,
  GroupNode,
  ImageNode,
  LineNode,
  PathNode,
  PolygonNode,
  PolylineNode,
  RectNode,
  SvgNode,
  TextNode,
} from '../model';
import type { Point } from '../types/point';
import type { Transform } from '../types/transform';
import { bakePathD } from './path-d-scaler';

/**
 * **Geometry baking** primitives — pure functions that take a node's
 * geometry fields and produce the equivalent fields after applying a
 * scale `(sx, sy)` around a fixed `anchor` (in document coordinates).
 *
 * **Why this exists** (Bloco 4-Resize-Proper, in response to user
 * report): the original `ResizeNodeCommand` composed `S(sx,sy)` into
 * the node's `transform` matrix. This had two market-anomalous effects:
 *
 * 1. **Stroke distortion**: a transform-scale multiplies everything
 *    inside, including the stroke width. Affinity/Illustrator/Figma
 *    all keep stroke at its declared width during resize because they
 *    modify `width`/`height`/`x`/`y` directly.
 * 2. **Inspector mismatch**: the model `width` stayed at `100` while
 *    the rendered rect visually showed `200` (under `scale(2)`). User
 *    saw a value that didn't reflect what they were looking at.
 *
 * These helpers fix both by computing the **post-scale geometry**
 * directly, leaving the transform alone (or only adjusting its
 * translation component, which is invariant under scale-around-anchor).
 *
 * **Negative scale** handled correctly: dragging a handle past its
 * opposite anchor produces `sx < 0` (or `sy < 0`). Helpers normalize
 * to a positive-dimension result with the position adjusted to the
 * "other side" of the anchor — visually equivalent to a flipped scale.
 *
 * **When this CAN'T be applied** (caller's responsibility to check via
 * {@link canBakeScaleIntoNode}): when the node has a rotation in its
 * `transform`, a document-space scale cannot be cleanly expressed as
 * a change to its native (pre-transform) geometry. The smart resize
 * command falls back to the legacy scale-transform composition in
 * those cases.
 */

// ── Axis primitives ────────────────────────────────────────────────

/**
 * Scale a 1-D interval `[start, start + length]` around `anchor` by
 * `scale`. Returns `{ start, length }` with `length >= 0` even when
 * `scale < 0` (negative scale flips the interval to the other side
 * of the anchor, but the result is always reported as a positive-
 * length interval).
 *
 * Examples:
 * - `scaleAxisInterval(10, 20, 10, 2)` → `{ start: 10, length: 40 }`
 * - `scaleAxisInterval(10, 20, 10, -1)` → `{ start: -10, length: 20 }`
 *   (the interval was 10..30; mirrored around anchor 10 it maps to
 *   10..-10 — i.e. -10..10 once sorted — hence start=-10, length=20.)
 */
export function scaleAxisInterval(
  start: number,
  length: number,
  anchor: number,
  scale: number,
): { readonly start: number; readonly length: number } {
  const a = anchor + (start - anchor) * scale;
  const b = anchor + (start + length - anchor) * scale;
  return { start: Math.min(a, b), length: Math.abs(b - a) };
}

/**
 * Scale a 2-D point around an anchor with possibly-asymmetric scale.
 * Signed scale handled — `scalePoint({x:5, y:5}, {x:0, y:0}, -1, -1)`
 * returns `{x:-5, y:-5}` (mirrored through origin).
 */
export function scalePoint(p: Point, anchor: Point, sx: number, sy: number): Point {
  return {
    x: anchor.x + (p.x - anchor.x) * sx,
    y: anchor.y + (p.y - anchor.y) * sy,
  };
}

// ── Per-type bake ──────────────────────────────────────────────────

export function bakeRect(node: RectNode, sx: number, sy: number, anchor: Point): RectNode {
  const xi = scaleAxisInterval(node.x, node.width, anchor.x, sx);
  const yi = scaleAxisInterval(node.y, node.height, anchor.y, sy);
  return {
    ...node,
    x: xi.start,
    y: yi.start,
    width: xi.length,
    height: yi.length,
    // Corner radii scale by absolute magnitude on their respective axes.
    // SVG rejects negative radii — `Math.abs` keeps us safe regardless
    // of sign convention.
    rx: node.rx !== undefined ? Math.abs(node.rx * sx) : node.rx,
    ry: node.ry !== undefined ? Math.abs(node.ry * sy) : node.ry,
  };
}

export function bakeEllipse(node: EllipseNode, sx: number, sy: number, anchor: Point): EllipseNode {
  // Ellipse center scales as a point; radii are always positive
  // (negative scale just relocates the center, ellipse shape is
  // symmetric so visual is identical to positive-scale variant).
  const c = scalePoint({ x: node.cx, y: node.cy }, anchor, sx, sy);
  return {
    ...node,
    cx: c.x,
    cy: c.y,
    rx: Math.abs(node.rx * sx),
    ry: Math.abs(node.ry * sy),
  };
}

export function bakeLine(node: LineNode, sx: number, sy: number, anchor: Point): LineNode {
  const p1 = scalePoint({ x: node.x1, y: node.y1 }, anchor, sx, sy);
  const p2 = scalePoint({ x: node.x2, y: node.y2 }, anchor, sx, sy);
  return { ...node, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
}

export function bakePolygon(node: PolygonNode, sx: number, sy: number, anchor: Point): PolygonNode {
  return { ...node, points: node.points.map((p) => scalePoint(p, anchor, sx, sy)) };
}

export function bakePolyline(
  node: PolylineNode,
  sx: number,
  sy: number,
  anchor: Point,
): PolylineNode {
  return { ...node, points: node.points.map((p) => scalePoint(p, anchor, sx, sy)) };
}

/**
 * Image baking: same axis-interval treatment as rect, plus the href
 * stays as-is. `preserveAspectRatio` is preserved (the SVG renderer
 * decides how to fit content to the new bbox).
 */
export function bakeImage(node: ImageNode, sx: number, sy: number, anchor: Point): ImageNode {
  const xi = scaleAxisInterval(node.x, node.width, anchor.x, sx);
  const yi = scaleAxisInterval(node.y, node.height, anchor.y, sy);
  return {
    ...node,
    x: xi.start,
    y: yi.start,
    width: xi.length,
    height: yi.length,
  };
}

/**
 * Text baking:
 * - `x`/`y` scale as a point (signed).
 * - `fontSize` is scaled only when the scale is **uniform** (|sx| ≈ |sy|).
 *   Non-uniform scale of text doesn't map to a single font size; the
 *   geometric "stretch" would require an additional transform that
 *   defeats the point of baking. We preserve fontSize in that case
 *   and document the limitation — users wanting stretched text can
 *   convert to path (future capability).
 *
 * The uniform-ness check uses a relative tolerance of `1e-9` to handle
 * floating-point noise from typical drag gestures.
 */
export function bakeText(node: TextNode, sx: number, sy: number, anchor: Point): TextNode {
  const p = scalePoint({ x: node.x, y: node.y }, anchor, sx, sy);
  const uniform = Math.abs(Math.abs(sx) - Math.abs(sy)) < 1e-9;
  const nextFontSize =
    uniform && node.fontSize !== undefined ? Math.abs(node.fontSize * sx) : node.fontSize;
  // D-100 — per-run fontSize scales on the same uniform-only rule as the
  // node-level fontSize, so a rich-text node baked at 2× keeps each run's
  // relative size. Runs without an explicit fontSize inherit (left as-is).
  const nextRuns =
    uniform && node.runs !== undefined
      ? node.runs.map((r) =>
          r.fontSize !== undefined ? { ...r, fontSize: Math.abs(r.fontSize * sx) } : r,
        )
      : node.runs;
  return { ...node, x: p.x, y: p.y, fontSize: nextFontSize, runs: nextRuns };
}

/**
 * Group baking: recursively bake the same `(sx, sy, anchor)` into
 * every child. The group's own `transform` is unchanged — the visual
 * effect of "scale the group around anchor" is produced by scaling
 * each child's geometry.
 *
 * **Caveat — rotated children**: a child whose `transform` includes
 * rotation cannot have a document-space scale baked into its native
 * geometry (the result wouldn't be axis-aligned). For such children
 * the bake function returns `null`; this helper preserves the
 * unchanged child but the visual result will be off. Group resize is
 * therefore most accurate for groups of identity/translate-only
 * children. Documented limitation; revisit in a future block if
 * demand exists (would require converting rotated children to paths
 * on bake).
 *
 * `bakeChild` is provided as an explicit dependency to avoid a
 * circular import with `bakeScaleIntoNode` (defined in the same module
 * but invoked through this hook for testability + extensibility).
 */
export function bakeGroup(
  node: GroupNode,
  sx: number,
  sy: number,
  anchor: Point,
  bakeChild: (child: GroupNode['children'][number]) => GroupNode['children'][number] | null,
): GroupNode {
  const nextChildren = node.children.map((child) => bakeChild(child) ?? child);
  return { ...node, children: nextChildren };
}

// ── Transform inspection (can we bake?) ────────────────────────────

/**
 * True when `transform` is identity or a pure translation (no
 * rotation, no embedded scale, no skew). Pre-condition for safely
 * baking a document-space scale into a node's native geometry: the
 * scale and the transform's rotation/scale components would
 * otherwise interact non-trivially.
 *
 * Transform matrix layout (per `core/types/transform.ts`):
 * `[a, b, c, d, e, f]` = `[[a,c,e],[b,d,f],[0,0,1]]` column-major.
 * Identity-or-translate iff `a === 1 && b === 0 && c === 0 && d === 1`.
 * `e`/`f` are the translation components — free to be anything.
 *
 * Tolerance `1e-9` accounts for matrix multiplication noise from
 * earlier operations (e.g., a rotate-then-rotate-back round-trip).
 */
export function isIdentityOrTranslate(transform: Transform): boolean {
  const [a, b, c, d] = transform;
  return (
    Math.abs(a - 1) < 1e-9 && Math.abs(b) < 1e-9 && Math.abs(c) < 1e-9 && Math.abs(d - 1) < 1e-9
  );
}

/**
 * Bake a path node by parsing + scaling + re-serializing its `d`
 * attribute. See {@link bakePathD} for command-by-command treatment
 * and arc-rotation limitations.
 */
export function bakePath(node: PathNode, sx: number, sy: number, anchor: Point): PathNode {
  return { ...node, d: bakePathD(node.d, sx, sy, anchor) };
}

/**
 * Unified bake entry — dispatches per-type to the right helper and
 * returns the new node. Returns `null` when the node's transform isn't
 * identity-or-pure-translate: a document-space scale can't be cleanly
 * baked into the native geometry of a rotated/skewed node, and the
 * caller should fall back to composing a scale matrix into the
 * transform (the legacy behavior).
 *
 * **Coordinate-system note (critical for correctness)**: `anchor` is
 * accepted in **document space** (matches `TransformService` /
 * `SelectionOverlay`, which derive the anchor from the rendered bbox).
 * The per-type bake helpers, however, operate on the node's **local**
 * (pre-transform) geometry. When the node carries a non-zero translate
 * (`e`, `f` in the transform matrix), we MUST subtract that translation
 * from the anchor before dispatching, otherwise the post-bake geometry
 * is shifted by `(e, f)` relative to where the user expected the fixed
 * pivot to land. Pre-fix this manifested as: "after moving a shape,
 * dragging any resize edge made the opposite edge drift" — see the bug
 * report fixed in 4-IP-FixBugs.
 *
 * Group bake is recursive: each child is baked individually. A child
 * that itself fails the bake check (because its own transform has
 * rotation) is preserved unchanged — visually slightly off, but
 * documented limitation (would require converting that child to a path).
 *
 * **Cost notes**: O(geometry size) per node. Path bake parses + re-
 * serializes the entire `d` string; for thousand-vertex paths that's
 * sub-millisecond on modern hardware but worth knowing.
 */
export function bakeScaleIntoNode(
  node: SvgNode,
  sx: number,
  sy: number,
  anchor: Point,
  parentMatrix: Transform | null = null,
): SvgNode | null {
  if (!isIdentityOrTranslate(node.transform)) return null;
  // **Ancestor transforms**: when the node is a child of one or more
  // groups that carry their own transform, the `anchor` and `sx`/`sy`
  // arriving here are expected to be ALREADY in the node's parent-
  // local frame (the caller — `TransformService` — projects pointer
  // + anchor via the inverse of the composed ancestor matrix, then
  // derives sx/sy from local-frame deltas).
  //
  // For backward compatibility, when `parentMatrix` is passed AND it
  // is identity-or-translate, we still adjust the anchor here (legacy
  // callers may pass doc-space). For rotated/scaled parents, callers
  // MUST pre-project and pass `parentMatrix = null` (or identity) —
  // otherwise the math is wrong.
  let frameAnchor: Point = anchor;
  if (parentMatrix !== null && isIdentityOrTranslate(parentMatrix)) {
    // Inverse of [1,0,0,1,tx,ty] is [1,0,0,1,-tx,-ty]. Apply to anchor.
    frameAnchor = {
      x: anchor.x - parentMatrix[4],
      y: anchor.y - parentMatrix[5],
    };
  }
  // Anchor is now in the parent's local frame; convert to the node's
  // local space (pre-transform) by subtracting the node's own translate.
  const localAnchor: Point = {
    x: frameAnchor.x - node.transform[4],
    y: frameAnchor.y - node.transform[5],
  };
  switch (node.type) {
    case 'rect':
      return bakeRect(node, sx, sy, localAnchor);
    case 'ellipse':
      return bakeEllipse(node, sx, sy, localAnchor);
    case 'line':
      return bakeLine(node, sx, sy, localAnchor);
    case 'polygon':
      return bakePolygon(node, sx, sy, localAnchor);
    case 'polyline':
      return bakePolyline(node, sx, sy, localAnchor);
    case 'path':
      return bakePath(node, sx, sy, localAnchor);
    case 'text':
      return bakeText(node, sx, sy, localAnchor);
    case 'image':
      return bakeImage(node, sx, sy, localAnchor);
    case 'group':
      // Group bake recurses with the SAME parentMatrix (children of the
      // group live in the group's LOCAL frame, which is what `frameAnchor`
      // represents AFTER the parent-adjust above). The recursion uses
      // `frameAnchor` (the anchor already in the group's frame) as the
      // doc-equivalent for each child — they'll further adjust by their
      // own translate via this same code path.
      return bakeGroup(node, sx, sy, frameAnchor, (child) =>
        bakeScaleIntoNode(child, sx, sy, localAnchor, null),
      );
    case 'symbol-use':
      // D-059 — symbol instance. Scale the box dimensions (width/height)
      // and reposition x/y around the anchor. Default width/height of
      // 100 mirrors the bbox fallback. Translation in node.transform is
      // preserved by the base shape pattern (anchor-shift baked into
      // x/y, scale baked into width/height).
      return {
        ...node,
        x: localAnchor.x + (node.x - localAnchor.x) * sx,
        y: localAnchor.y + (node.y - localAnchor.y) * sy,
        width: (node.width ?? 100) * sx,
        height: (node.height ?? 100) * sy,
      };
  }
}
