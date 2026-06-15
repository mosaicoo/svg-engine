import type { BoundingBox, NodeId, Point } from 'svg-engine/core';

/**
 * Alignment axis. Six standard operations matching Illustrator,
 * Affinity Designer, Figma, Inkscape:
 *
 * - `'left'`     — every bbox's `x` becomes the leftmost `x` of the set.
 * - `'center-x'` — every bbox's center-X aligns with the union bbox's center-X.
 * - `'right'`    — every bbox's `x + width` becomes the rightmost edge of the set.
 * - `'top'`      — every bbox's `y` becomes the topmost `y`.
 * - `'center-y'` — every bbox's center-Y aligns with the union bbox's center-Y.
 * - `'bottom'`   — every bbox's `y + height` becomes the bottommost edge.
 *
 * The "anchor" for center alignments is the **union bbox** of the
 * selection (matches Affinity / Figma defaults). Some tools use "key
 * object" anchoring (Illustrator's "Align to Key Object") — that's a
 * straightforward extension to add later.
 */
export type AlignAxis = 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom';

/**
 * Distribution axis. Standard "distribute centers" semantics:
 *
 * - `'horizontal'` — sort by center-X, evenly space the inner items'
 *   centers between the leftmost-center and rightmost-center.
 * - `'vertical'`   — same, but on the Y axis.
 *
 * The two extremes (leftmost / rightmost on the chosen axis) keep their
 * positions and define the bounds. Requires at least **3 nodes** —
 * fewer than 3 yields an empty deltas map (no-op).
 *
 * "Distribute equal spacing" (gap-based, not center-based) ships
 * separately as {@link computeDistributeSpacingDeltas} (D-095) — Affinity
 * exposes both modes; centers came first as the most-used in practice.
 */
export type DistributeAxis = 'horizontal' | 'vertical';

/** Pair of `(id, bbox)` consumed by the alignment helpers. */
export interface NodeBBox {
  readonly id: NodeId;
  readonly bbox: BoundingBox;
}

/**
 * Compute the per-node `(dx, dy)` translation needed to align every
 * item to the chosen axis. Returns an empty map when:
 * - `items.length < 2` (alignment of one is a no-op).
 * - any computed delta is exactly `(0, 0)` for every item (already
 *   aligned) — those entries are *omitted* (cleaner undo: "translate
 *   many" of size 0 is a true no-op rather than a bunch of zero-deltas).
 *
 * Non-affected axis is always `0` — alignment never moves on the
 * orthogonal axis.
 *
 * **Pure**: no DOM, no signals. Caller passes bboxes (typically read
 * from rendered DOM via `getRenderedNodeBBox`).
 */
export function computeAlignDeltas(
  items: readonly NodeBBox[],
  axis: AlignAxis,
): ReadonlyMap<NodeId, Point> {
  if (items.length < 2) return new Map();
  const target = computeAlignTarget(items, axis);
  const out = new Map<NodeId, Point>();
  for (const { id, bbox } of items) {
    const delta = deltaForAlign(bbox, axis, target);
    if (delta.x !== 0 || delta.y !== 0) out.set(id, delta);
  }
  return out;
}

/**
 * Compute the per-node `(dx, dy)` translation needed to align every
 * item to the chosen axis **relative to an explicit `reference` bbox**
 * (instead of the selection's union bbox). This is the "align to key
 * object / artboard" variant: the reference is fixed and never moves —
 * every item is shifted so its chosen edge/center matches the
 * reference's.
 *
 * The canonical use is **single-object align to the active page**: pass
 * `[theObject]` as `items` and the page's viewBox as `reference`, so
 * e.g. `center-x` centres the object horizontally on the page and
 * `left` snaps it to the page's left edge. It also works for ≥ 2 items
 * (aligns each to the reference rather than to each other), which is the
 * "Align to Page" mode pro tools expose for multi-selection.
 *
 * Returns an empty map when `items` is empty, or when every computed
 * delta is `(0, 0)` (already aligned — omitted for a clean no-op undo).
 *
 * **Pure**: no DOM, no signals.
 */
export function computeAlignToReferenceDeltas(
  items: readonly NodeBBox[],
  axis: AlignAxis,
  reference: BoundingBox,
): ReadonlyMap<NodeId, Point> {
  if (items.length === 0) return new Map();
  const target = alignTargetForBBox(reference, axis);
  const out = new Map<NodeId, Point>();
  for (const { id, bbox } of items) {
    const delta = deltaForAlign(bbox, axis, target);
    if (delta.x !== 0 || delta.y !== 0) out.set(id, delta);
  }
  return out;
}

/**
 * **D-094** — resolve which **reference bbox** the 6 align operations
 * should use, implementing the "Align To" mode selection:
 *
 * - **Key Object** — when `keyObjectId` is set AND present among `items`
 *   AND there are ≥ 2 items, the reference is that object's bbox (it
 *   stays put while everything else aligns to it). Illustrator's
 *   "Align to Key Object".
 * - **Page / Artboard** — a lone selected object (`items.length === 1`)
 *   aligns to the `page` reference (nothing else to align to).
 * - **Selection** — ≥ 2 items with no key object → returns `null`,
 *   meaning the caller aligns to the selection's **union** bbox via
 *   {@link computeAlignDeltas} (`AlignmentService.align`).
 *
 * Centralizes the branching previously duplicated across the menu,
 * Inspector and Select tool-options align handlers. Returns the bbox to
 * pass to {@link computeAlignToReferenceDeltas} (`alignToReference`), or
 * `null` to use union alignment.
 *
 * **Pure**: no DOM, no signals.
 */
export function resolveAlignReference(
  items: readonly NodeBBox[],
  keyObjectId: NodeId | null,
  page: BoundingBox,
): BoundingBox | null {
  if (keyObjectId !== null && items.length >= 2) {
    const key = items.find((i) => i.id === keyObjectId);
    if (key !== undefined) return key.bbox;
  }
  if (items.length === 1) return page;
  return null;
}

/**
 * Compute the per-node `(dx, dy)` to evenly distribute centers along
 * the chosen axis. Returns an empty map when:
 * - `items.length < 3` (distribute needs an "inner" item to space).
 * - the leftmost and rightmost items are already coincident on the
 *   axis (degenerate — no spacing to enforce).
 *
 * Edge items keep their position (delta `(0, 0)` and are omitted from
 * the result map). Inner items move to evenly partition the span.
 *
 * **Pure**: no DOM, no signals.
 */
export function computeDistributeDeltas(
  items: readonly NodeBBox[],
  axis: DistributeAxis,
): ReadonlyMap<NodeId, Point> {
  if (items.length < 3) return new Map();
  const isHorizontal = axis === 'horizontal';
  // Sort by center on the axis. Use a stable copy to avoid mutating caller's array.
  const sorted = [...items].sort(
    (a, b) => centerOn(a.bbox, isHorizontal) - centerOn(b.bbox, isHorizontal),
  );
  const first = centerOn(sorted[0]!.bbox, isHorizontal);
  const last = centerOn(sorted[sorted.length - 1]!.bbox, isHorizontal);
  if (last === first) return new Map();
  const step = (last - first) / (sorted.length - 1);
  const out = new Map<NodeId, Point>();
  for (let i = 1; i < sorted.length - 1; i++) {
    const item = sorted[i]!;
    const targetCenter = first + i * step;
    const currentCenter = centerOn(item.bbox, isHorizontal);
    const delta = targetCenter - currentCenter;
    if (delta === 0) continue;
    out.set(item.id, isHorizontal ? { x: delta, y: 0 } : { x: 0, y: delta });
  }
  return out;
}

/**
 * **D-095** — Average edge-to-edge gap currently between `items` along the
 * axis. Used to pre-fill the "Spacing…" dialog so applying with no change
 * equalizes to the current average (the Illustrator "Auto" feel).
 *
 * `gap = (extentSpan − Σ sizes) / (n − 1)`, where `extentSpan` spans the
 * first leading edge to the last trailing edge (items sorted on the axis).
 * Returns `null` for fewer than 3 items (nothing to average) or a
 * degenerate extent (all stacked → span ≤ 0). May be negative when items
 * currently overlap — a faithful readout of the present state.
 *
 * **Pure**: no DOM, no signals.
 */
export function computeAverageGap(items: readonly NodeBBox[], axis: DistributeAxis): number | null {
  if (items.length < 3) return null;
  const isHorizontal = axis === 'horizontal';
  const lead = (b: BoundingBox): number => (isHorizontal ? b.x : b.y);
  const size = (b: BoundingBox): number => (isHorizontal ? b.width : b.height);
  const sorted = [...items].sort((a, b) => lead(a.bbox) - lead(b.bbox));
  const first = sorted[0]!.bbox;
  const last = sorted[sorted.length - 1]!.bbox;
  const span = lead(last) + size(last) - lead(first);
  if (span <= 0) return null;
  let sumSizes = 0;
  for (const { bbox } of sorted) sumSizes += size(bbox);
  return (span - sumSizes) / (sorted.length - 1);
}

/**
 * **D-095** — Compute the per-node `(dx, dy)` to distribute `items` with an
 * EQUAL edge-to-edge `gap` along the axis (Illustrator/Affinity "Distribute
 * Spacing"). Unlike {@link computeDistributeDeltas} (which equalizes
 * CENTERS), this equalizes the GAPS, so objects of different sizes end up
 * with identical visual spacing between them.
 *
 * The first item on the axis stays fixed; each subsequent item is moved so
 * its leading edge sits `gap` past the previous item's trailing edge.
 * Movement is constrained to the axis (cross-axis delta is 0). A negative
 * `gap` packs items into overlap (valid). Items already in place are
 * omitted (zero delta). Returns an empty map for fewer than 2 items.
 *
 * **Pure**: no DOM, no signals.
 */
export function computeDistributeSpacingDeltas(
  items: readonly NodeBBox[],
  axis: DistributeAxis,
  gap: number,
): ReadonlyMap<NodeId, Point> {
  if (items.length < 2) return new Map();
  const isHorizontal = axis === 'horizontal';
  const lead = (b: BoundingBox): number => (isHorizontal ? b.x : b.y);
  const size = (b: BoundingBox): number => (isHorizontal ? b.width : b.height);
  const sorted = [...items].sort((a, b) => lead(a.bbox) - lead(b.bbox));
  const out = new Map<NodeId, Point>();
  let cursor = lead(sorted[0]!.bbox) + size(sorted[0]!.bbox);
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]!;
    const target = cursor + gap; // new leading edge
    const delta = target - lead(item.bbox);
    if (delta !== 0) {
      out.set(item.id, isHorizontal ? { x: delta, y: 0 } : { x: 0, y: delta });
    }
    cursor = target + size(item.bbox);
  }
  return out;
}

/**
 * Union bbox of a non-empty set of items. Exported for tests + for
 * consumers that want to draw the alignment anchor visually.
 */
export function unionBBox(items: readonly NodeBBox[]): BoundingBox {
  if (items.length === 0) {
    throw new RangeError('unionBBox: items must be non-empty');
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { bbox } of items) {
    if (bbox.x < minX) minX = bbox.x;
    if (bbox.y < minY) minY = bbox.y;
    if (bbox.x + bbox.width > maxX) maxX = bbox.x + bbox.width;
    if (bbox.y + bbox.height > maxY) maxY = bbox.y + bbox.height;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function computeAlignTarget(items: readonly NodeBBox[], axis: AlignAxis): number {
  return alignTargetForBBox(unionBBox(items), axis);
}

/**
 * The single target coordinate (on the axis's relevant dimension) that
 * every aligned item's chosen edge/center must reach, derived from a
 * given bbox. Shared by union-anchored alignment (`computeAlignDeltas`)
 * and reference-anchored alignment (`computeAlignToReferenceDeltas`).
 */
function alignTargetForBBox(b: BoundingBox, axis: AlignAxis): number {
  switch (axis) {
    case 'left':
      return b.x;
    case 'right':
      return b.x + b.width;
    case 'center-x':
      return b.x + b.width / 2;
    case 'top':
      return b.y;
    case 'bottom':
      return b.y + b.height;
    case 'center-y':
      return b.y + b.height / 2;
  }
}

function deltaForAlign(bbox: BoundingBox, axis: AlignAxis, target: number): Point {
  switch (axis) {
    case 'left':
      return { x: target - bbox.x, y: 0 };
    case 'right':
      return { x: target - (bbox.x + bbox.width), y: 0 };
    case 'center-x':
      return { x: target - (bbox.x + bbox.width / 2), y: 0 };
    case 'top':
      return { x: 0, y: target - bbox.y };
    case 'bottom':
      return { x: 0, y: target - (bbox.y + bbox.height) };
    case 'center-y':
      return { x: 0, y: target - (bbox.y + bbox.height / 2) };
  }
}

function centerOn(bbox: BoundingBox, horizontal: boolean): number {
  return horizontal ? bbox.x + bbox.width / 2 : bbox.y + bbox.height / 2;
}
