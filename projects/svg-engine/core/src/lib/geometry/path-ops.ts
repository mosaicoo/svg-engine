import type { Point } from '../types/point';
import {
  type AnchorPoint,
  type AnchorSubpath,
  anchorsToPathD,
  parsePathToAnchors,
} from './path-anchors';

/**
 * **D-090 — Path editing operations** (Path menu). Pure, anchor-model
 * geometry helpers shared by the `commands/path-ops.commands.ts` command
 * wrappers. Each takes/returns an SVG `d` string and never mutates input.
 *
 * All operate on the anchor representation ({@link parsePathToAnchors} ⇄
 * {@link anchorsToPathD}), so cubic/quadratic curves survive
 * (quadratics are normalized to cubics on parse — a documented, exact
 * conversion). Coordinates are in the path's LOCAL space; callers keep
 * the node's `transform` untouched for single-node ops.
 */

const EPS = 1e-6;

function pointsEqual(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
}

// ── Reverse Direction ──────────────────────────────────────────────────

/**
 * Reverse the drawing direction of every subpath in `d`. The visible
 * shape is identical; only the winding order flips (matters for
 * markers, `fill-rule` interactions, and text-on-path direction).
 *
 * Implementation: reverse each subpath's anchor order and swap each
 * anchor's `handleIn`/`handleOut` (the incoming side becomes the
 * outgoing side when traversed backwards). The `closed` flag is
 * preserved.
 */
export function reversePathD(d: string): string {
  const subpaths = parsePathToAnchors(d);
  if (subpaths.length === 0) return d;
  const reversed: AnchorSubpath[] = subpaths.map((sub) => ({
    closed: sub.closed,
    anchors: [...sub.anchors].reverse().map((a) => ({
      point: a.point,
      handleIn: a.handleOut,
      handleOut: a.handleIn,
      kind: a.kind,
    })),
  }));
  return anchorsToPathD(reversed);
}

// ── Clean Up ───────────────────────────────────────────────────────────

/**
 * Remove redundant geometry without changing the visible shape:
 *
 * - **Duplicate points**: consecutive anchors at the same position
 *   joined by a flat (straight, zero-length) segment are collapsed.
 * - **Degenerate subpaths**: subpaths left with fewer than 2 anchors
 *   (a lone `M`, or an empty run) are dropped.
 *
 * Conservative by design — it only drops anchors that contribute
 * nothing to the rendered outline, so the result is always visually
 * identical to the input. Returns the input unchanged when there's
 * nothing to clean (so a command can no-op).
 */
export function cleanUpPathD(d: string): string {
  const subpaths = parsePathToAnchors(d);
  if (subpaths.length === 0) return d;
  const cleaned: AnchorSubpath[] = [];
  for (const sub of subpaths) {
    const anchors: AnchorPoint[] = [];
    for (const a of sub.anchors) {
      const prev = anchors[anchors.length - 1];
      // Drop an anchor that sits on the previous one AND is reached by a
      // flat segment (no curve handles) — it draws nothing.
      if (
        prev !== undefined &&
        pointsEqual(prev.point, a.point) &&
        pointsEqual(prev.handleOut, prev.point) &&
        pointsEqual(a.handleIn, a.point)
      ) {
        continue;
      }
      anchors.push(a);
    }
    if (anchors.length >= 2) cleaned.push({ anchors, closed: sub.closed });
  }
  return anchorsToPathD(cleaned);
}

// ── Simplify (Ramer–Douglas–Peucker) ───────────────────────────────────

/**
 * Reduce the anchor count of `d` via Ramer–Douglas–Peucker, treating
 * anchors as polyline vertices. Survivors keep their original handles;
 * the first and last anchor of each subpath are always preserved so
 * endpoints don't drift.
 *
 * `tolerance` is the max perpendicular deviation (doc units) a dropped
 * anchor may have from the line connecting its survivors. Larger =
 * fewer anchors.
 *
 * **Note**: this is a self-contained copy of the RDP used by the
 * `Smooth` tool (`svg-engine/edit`). The duplication is intentional —
 * `svg-engine/core` cannot depend on `svg-engine/edit`, and this keeps
 * the menu command (core) free of a UI-layer import. Both share the
 * same algorithm and tolerance semantics.
 */
export function simplifyPathD(d: string, tolerance: number): string {
  const subpaths = parsePathToAnchors(d);
  if (subpaths.length === 0) return d;
  const out = subpaths.map((sub) => simplifyAnchorSubpath(sub, tolerance));
  return anchorsToPathD(out);
}

/** RDP over a single subpath. Exported for direct (headless) reuse + tests. */
export function simplifyAnchorSubpath(subpath: AnchorSubpath, tolerance: number): AnchorSubpath {
  const anchors = subpath.anchors;
  if (anchors.length < 3) return subpath;
  const keep = new Array<boolean>(anchors.length).fill(false);
  keep[0] = true;
  keep[anchors.length - 1] = true;
  rdp(anchors, 0, anchors.length - 1, Math.max(0, tolerance), keep);
  const filtered = anchors.filter((_, i) => keep[i]);
  return { anchors: filtered, closed: subpath.closed };
}

function rdp(
  anchors: readonly AnchorPoint[],
  start: number,
  end: number,
  tolerance: number,
  keep: boolean[],
): void {
  if (end - start < 2) return;
  const a = anchors[start]!.point;
  const b = anchors[end]!.point;
  let maxDist = 0;
  let maxIdx = start;
  for (let i = start + 1; i < end; i++) {
    const dist = perpendicularDistance(anchors[i]!.point, a, b);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }
  if (maxDist > tolerance) {
    keep[maxIdx] = true;
    rdp(anchors, start, maxIdx, tolerance, keep);
    rdp(anchors, maxIdx, end, tolerance, keep);
  }
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < EPS) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projx = a.x + abx * t;
  const projy = a.y + aby * t;
  return Math.hypot(p.x - projx, p.y - projy);
}

// ── Join ───────────────────────────────────────────────────────────────

/**
 * Connect the open subpaths gathered from `ds` (already in a common
 * coordinate space — callers bake transforms first) into a SINGLE open
 * subpath, chaining by nearest endpoints. Closed subpaths are passed
 * through untouched (you can't open-join a loop).
 *
 * Behavior (matches Illustrator's Object ▸ Path ▸ Join):
 * - One input with a single OPEN subpath → that subpath is **closed**
 *   (its end connects back to its start).
 * - Otherwise → all open subpaths are welded end-to-end (the nearer
 *   endpoints meet; a subpath is reversed when that brings its end
 *   closer), collapsing coincident join points.
 *
 * Returns `null` when there's nothing to join (no open subpaths, or a
 * single already-closed subpath) so the command can no-op.
 */
export function joinPathDs(ds: readonly string[]): string | null {
  const open: AnchorPoint[][] = [];
  const closed: AnchorSubpath[] = [];
  for (const d of ds) {
    for (const sub of parsePathToAnchors(d)) {
      if (sub.anchors.length === 0) continue;
      if (sub.closed) closed.push(sub);
      else open.push([...sub.anchors]);
    }
  }

  if (open.length === 0) return null;

  // Single open subpath → close it.
  if (open.length === 1) {
    const merged: AnchorSubpath = { anchors: open[0]!, closed: true };
    return anchorsToPathD([...closed, merged]);
  }

  // Greedy nearest-endpoint chaining.
  const remaining = open.slice();
  let chain = remaining.shift()!;
  while (remaining.length > 0) {
    const tail = chain[chain.length - 1]!.point;
    let bestIdx = 0;
    let bestDist = Infinity;
    let bestReverse = false;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i]!;
      const dStart = dist2(tail, cand[0]!.point);
      const dEnd = dist2(tail, cand[cand.length - 1]!.point);
      if (dStart < bestDist) {
        bestDist = dStart;
        bestIdx = i;
        bestReverse = false;
      }
      if (dEnd < bestDist) {
        bestDist = dEnd;
        bestIdx = i;
        bestReverse = true;
      }
    }
    let next = remaining.splice(bestIdx, 1)[0]!;
    if (bestReverse) {
      next = [...next].reverse().map((a) => ({
        point: a.point,
        handleIn: a.handleOut,
        handleOut: a.handleIn,
        kind: a.kind,
      }));
    }
    // Weld: if the chain's tail coincides with next's head, drop the
    // duplicate head (keep the chain tail's outgoing handle).
    if (pointsEqual(chain[chain.length - 1]!.point, next[0]!.point)) {
      next = next.slice(1);
    }
    chain = chain.concat(next);
  }

  const merged: AnchorSubpath = { anchors: chain, closed: false };
  return anchorsToPathD([...closed, merged]);
}

function dist2(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

// ── Split ──────────────────────────────────────────────────────────────

/**
 * Split the subpaths of `d` at the given anchor positions, returning
 * one `d` string per resulting piece. Each `(subpathIndex, anchorIndex)`
 * marks a cut point; the cut anchor is duplicated into both adjacent
 * pieces so geometry is preserved.
 *
 * - **Open subpath**, cut at an interior anchor → two open pieces.
 *   Cuts at the endpoints are ignored (nothing to separate there).
 * - **Closed subpath**, cut at one anchor → one open piece (the loop is
 *   opened at that anchor). Cut at N anchors → N open pieces.
 * - Subpaths with no cut are emitted unchanged (closed flag preserved).
 *
 * Returns `null` when no cut actually separates anything (so the
 * command no-ops instead of cloning the node).
 */
export function splitPathDAtAnchors(
  d: string,
  cuts: readonly { readonly subpathIndex: number; readonly anchorIndex: number }[],
): readonly string[] | null {
  const subpaths = parsePathToAnchors(d);
  if (subpaths.length === 0) return null;

  const bySubpath = new Map<number, Set<number>>();
  for (const c of cuts) {
    if (c.subpathIndex < 0 || c.subpathIndex >= subpaths.length) continue;
    const set = bySubpath.get(c.subpathIndex) ?? new Set<number>();
    set.add(c.anchorIndex);
    bySubpath.set(c.subpathIndex, set);
  }

  const pieces: string[] = [];
  let didSplit = false;
  for (let i = 0; i < subpaths.length; i++) {
    const sub = subpaths[i]!;
    const cutSet = bySubpath.get(i);
    if (cutSet === undefined || cutSet.size === 0) {
      pieces.push(anchorsToPathD([sub]));
      continue;
    }
    const parts = splitAnchorList(sub.anchors, sub.closed, cutSet);
    if (parts.length > 1 || (sub.closed && parts.length === 1)) didSplit = true;
    for (const part of parts) {
      if (part.length >= 2) pieces.push(anchorsToPathD([{ anchors: part, closed: false }]));
    }
  }
  return didSplit ? pieces : null;
}

/** Break one anchor list (with its closed flag) into open pieces at `cutSet`. */
function splitAnchorList(
  anchors: readonly AnchorPoint[],
  closed: boolean,
  cutSet: ReadonlySet<number>,
): AnchorPoint[][] {
  const n = anchors.length;
  if (n < 2) return [anchors.slice()];

  let list: readonly AnchorPoint[];
  let splitAt: number[];
  if (closed) {
    const sorted = [...cutSet].filter((i) => i >= 0 && i < n).sort((a, b) => a - b);
    if (sorted.length === 0) return [anchors.slice()];
    const startIdx = sorted[0]!;
    // Rotate to start at the first cut, then re-append that anchor so the
    // loop becomes an open chain that begins+ends at the cut point.
    list = [...anchors.slice(startIdx), ...anchors.slice(0, startIdx), anchors[startIdx]!];
    splitAt = sorted.slice(1).map((s) => (s - startIdx + n) % n);
  } else {
    list = anchors;
    splitAt = [...cutSet].filter((i) => i > 0 && i < n - 1).sort((a, b) => a - b);
  }

  if (splitAt.length === 0) return [list.slice()];

  const pieces: AnchorPoint[][] = [];
  let start = 0;
  for (const sp of splitAt) {
    pieces.push(list.slice(start, sp + 1));
    start = sp;
  }
  pieces.push(list.slice(start));
  return pieces.filter((p) => p.length >= 2);
}
