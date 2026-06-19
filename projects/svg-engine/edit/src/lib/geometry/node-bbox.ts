import {
  applyTransform,
  bbox,
  type BoundingBox,
  IDENTITY_TRANSFORM,
  multiply,
  type NodeId,
  type Transform,
} from 'svg-engine/core';
import { parseTransformAttr } from './transform-attr-parser';

/**
 * Locate the rendered SVG element corresponding to a given {@link NodeId}.
 *
 * The dispatcher in `svg-engine/render` puts `data-node-id="<id>"` on the
 * `<svg:g>` host of every node, so a single `querySelector` is enough.
 *
 * @returns the matching element, or `null` if the node has not been
 * rendered yet (e.g., the document was just loaded and CD did not run).
 */
export function findRenderedNode(
  svgRoot: SVGSVGElement,
  nodeId: NodeId,
): SVGGraphicsElement | null {
  return svgRoot.querySelector<SVGGraphicsElement>(`[data-node-id="${nodeId}"]`);
}

/**
 * Compute the axis-aligned bounding box of a rendered node in the SVG
 * root's user-coordinate system (i.e., the same coord system as the
 * `viewBox`). Suitable for placing overlay handles in the same `<svg>`.
 *
 * Why DOM-based instead of model-based: SVG's `getBBox()` works for
 * **every** node type (including paths, text, groups) without us having
 * to parse path data or measure font glyphs. A future model-based variant
 * (Phase 5 / `svg-engine/optimize`) can replace this for headless usage.
 *
 * Why we parse `transform` attributes ourselves instead of using
 * `el.transform.baseVal.consolidate()`: jsdom (the test env) does not
 * implement that API reliably, and we want bbox math to be testable in
 * headless. We use the SVG-1.1 transform-attribute parser in
 * `transform-attr-parser.ts` and matrix helpers from `svg-engine/core`.
 *
 * Returns `null` when the element is missing or has zero geometry (e.g.,
 * empty group, untextured `<text>`).
 */
export function getRenderedNodeBBox(svgRoot: SVGSVGElement, nodeId: NodeId): BoundingBox | null {
  const el = findRenderedNode(svgRoot, nodeId);
  if (el === null) return null;
  return computeBBoxInRoot(el, svgRoot);
}

/**
 * **D-109** — bounding box of a rendered node in its **parent's** coordinate
 * space: `el.getBBox()` (geometry, before the node's own `transform`) with the
 * node's OWN transform applied, but **not** the ancestor chain. Distinct from
 * {@link getRenderedNodeBBox}, which composes ALL ancestors up to the root.
 *
 * Used by *Object ▸ Rasterize*: the parent-local box is both the `viewBox` to
 * render the node in isolation AND the `x/y/width/height` for the replacement
 * `<image>` — inserting that image into the SAME parent makes the (unchanged)
 * ancestor transforms place it exactly where the vector was, with no
 * inverse-matrix math.
 *
 * Returns `null` when the element is missing or has zero geometry.
 */
export function getRenderedNodeLocalBBox(
  svgRoot: SVGSVGElement,
  nodeId: NodeId,
): BoundingBox | null {
  const el = findRenderedNode(svgRoot, nodeId);
  if (el === null) return null;
  let local: DOMRect;
  try {
    local = el.getBBox();
  } catch {
    return null;
  }
  if (
    !Number.isFinite(local.x) ||
    !Number.isFinite(local.y) ||
    !Number.isFinite(local.width) ||
    !Number.isFinite(local.height) ||
    (local.width === 0 && local.height === 0)
  ) {
    return null;
  }
  const own = parseTransformAttr(el.getAttribute('transform'));
  const corners: readonly { readonly x: number; readonly y: number }[] = [
    { x: local.x, y: local.y },
    { x: local.x + local.width, y: local.y },
    { x: local.x + local.width, y: local.y + local.height },
    { x: local.x, y: local.y + local.height },
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    const p = applyTransform(own, c.x, c.y);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return bbox(minX, minY, maxX - minX, maxY - minY);
}

/**
 * **D-141** — the node's **oriented** bounding box source: its LOCAL
 * (pre-transform) geometry bbox PLUS the full matrix that maps that local
 * frame into the SVG root's user space (the node's OWN `transform` AND its
 * whole ancestor chain). Distinct from {@link getRenderedNodeBBox}, which
 * collapses the transformed corners into an axis-aligned (AABB) box and so
 * discards the orientation.
 *
 * Consumers (the selection overlay) render the selection chrome inside a
 * `<g transform="matrix(...)">` using `matrix`, drawing the box + handles
 * in `localBBox` coordinates — so the whole transform widget rotates WITH
 * the object (Illustrator/Figma/Affinity-style OBB) instead of snapping to
 * the axis-aligned enclosure. The resize math projects the pointer through
 * `invert(matrix)` to scale along the object's LOCAL axes.
 *
 * Returns `null` when the element is missing or has zero geometry.
 */
export interface RenderedOBB {
  /** The node's local, axis-aligned geometry bbox (before any transform). */
  readonly localBBox: BoundingBox;
  /** Maps the node's local coords → SVG root user space (own transform × ancestors). */
  readonly matrix: Transform;
}

export function getRenderedNodeOBB(svgRoot: SVGSVGElement, nodeId: NodeId): RenderedOBB | null {
  const el = findRenderedNode(svgRoot, nodeId);
  if (el === null) return null;
  let local: DOMRect;
  try {
    local = el.getBBox();
  } catch {
    return null;
  }
  if (
    !Number.isFinite(local.x) ||
    !Number.isFinite(local.y) ||
    !Number.isFinite(local.width) ||
    !Number.isFinite(local.height) ||
    (local.width === 0 && local.height === 0)
  ) {
    return null;
  }
  const matrix = composedAncestorMatrix(el, svgRoot);
  if (matrix === null) return null;
  return { localBBox: bbox(local.x, local.y, local.width, local.height), matrix };
}

/**
 * Compute a single bounding box that contains every rendered node in
 * `nodeIds`. Returns `null` when none of the ids resolve to a rendered
 * element. Used for multi-selection overlay (one bbox around the whole
 * selection).
 */
export function getCombinedBBox(
  svgRoot: SVGSVGElement,
  nodeIds: Iterable<NodeId>,
): BoundingBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let any = false;

  for (const id of nodeIds) {
    const b = getRenderedNodeBBox(svgRoot, id);
    if (b === null) continue;
    any = true;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }

  if (!any) return null;
  return bbox(minX, minY, maxX - minX, maxY - minY);
}

/**
 * Compute the axis-aligned bounding box of `el` expressed in the user
 * coordinate system of `root`. We start from `el.getBBox()` (which is
 * **before** the element's own `transform` attribute is applied — SVG
 * spec) and walk up the ancestor chain composing each transform until
 * we reach `root`.
 */
function computeBBoxInRoot(el: SVGGraphicsElement, root: SVGSVGElement): BoundingBox | null {
  let local: DOMRect;
  try {
    local = el.getBBox();
  } catch {
    return null;
  }
  if (
    !Number.isFinite(local.x) ||
    !Number.isFinite(local.y) ||
    !Number.isFinite(local.width) ||
    !Number.isFinite(local.height)
  ) {
    return null;
  }
  if (local.width === 0 && local.height === 0) {
    // Some nodes (empty groups, unrendered text) report zero geometry —
    // treat as "no overlay-worthy bbox" rather than as a degenerate point.
    return null;
  }

  const matrix = composedAncestorMatrix(el, root);
  if (matrix === null) return null;

  // Transform the four corners of the local bbox and AABB the result.
  const corners: readonly { readonly x: number; readonly y: number }[] = [
    { x: local.x, y: local.y },
    { x: local.x + local.width, y: local.y },
    { x: local.x + local.width, y: local.y + local.height },
    { x: local.x, y: local.y + local.height },
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of corners) {
    const p = applyTransform(matrix, c.x, c.y);
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return bbox(minX, minY, maxX - minX, maxY - minY);
}

/**
 * Composed transform of `nodeId`'s ANCESTORS (NOT including the node
 * itself). Returns the matrix that maps coordinates from the node's
 * parent-local frame into the SVG root's user space.
 *
 * Used by `TransformService.startResize` to give `ResizeNodeCommand`
 * the context it needs to convert doc-space anchors into the node's
 * parent frame — without this, resizing a shape inside a translated/
 * rotated group "drifts" because the anchor is interpreted in the
 * wrong coordinate system.
 *
 * Returns `null` when the node isn't rendered, lives directly under
 * the SVG root (no ancestor chain to compose), or some ancestor lacks
 * a valid transform attribute. Callers treat `null` as "no ancestor
 * adjust needed" (identity).
 */
export function getRenderedParentMatrix(svgRoot: SVGSVGElement, nodeId: NodeId): Transform | null {
  const el = findRenderedNode(svgRoot, nodeId);
  if (el === null) return null;
  const parent = el.parentElement;
  if (parent === null) return null;
  // `el.parentElement === svgRoot` returns false-positive at the type
  // level because parentElement's static type is HTMLElement | null even
  // though it's an SVG element here. Compare via the underlying Node
  // identity via `isSameNode` (works across HTMLElement/SVG type silo).
  if (parent.isSameNode(svgRoot)) return null;
  // Walk from the parent (inclusive) up to root, composing transforms.
  return composedAncestorMatrix(parent as unknown as SVGGraphicsElement, svgRoot);
}

/**
 * Walk up from `el` (inclusive) toward `root` composing each ancestor's
 * `transform` attribute. Returns the matrix that maps coordinates from
 * `el`'s local user space into `root`'s user space.
 */
function composedAncestorMatrix(el: SVGGraphicsElement, root: SVGSVGElement): Transform | null {
  let acc: Transform = IDENTITY_TRANSFORM;
  let current: Element | null = el;
  while (current !== null && current !== root) {
    const attr = current.getAttribute('transform');
    const local = parseTransformAttr(attr);
    // The local transform applies to coordinates inside `current`, so
    // composition is `ancestor * descendantAccum`.
    acc = multiply(local, acc);
    current = current.parentElement;
  }
  if (current !== root) return null;
  return acc;
}
