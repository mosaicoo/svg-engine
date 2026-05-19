import type { Point } from '../types/point';
import { parsePathD, type PathSegment } from './path-d-scaler';

/**
 * Kind of an anchor point, dictating how its in/out handles relate.
 *
 * - `cusp`: handles are independent (corner point). Default for
 *   line-only paths and the result of "convert to corner".
 * - `smooth`: handles are colinear (180° apart) but lengths may
 *   differ. Default for bezier vertices from `S`/`s` continuation.
 * - `symmetric`: handles are colinear AND equal length (mirror).
 *   Useful for perfectly-rounded curves; user opt-in via
 *   `ConvertAnchorTypeCommand`.
 */
export type AnchorKind = 'cusp' | 'smooth' | 'symmetric';

/**
 * A single editable anchor point in a path. `handleIn` is the bezier
 * control point on the INCOMING side (going from previous anchor TO
 * this one); `handleOut` is on the OUTGOING side (going FROM this
 * anchor to the next). Both are stored in ABSOLUTE coordinates (not
 * deltas from `point`), so a "no handle" anchor uses `point` itself
 * — equivalent to a straight line.
 *
 * **Why absolute and not delta**: every consumer that hit-tests or
 * renders the handle (overlay, drag math, bbox) needs the absolute
 * position anyway. Storing deltas would force conversion on every
 * read; storing absolute is one source of truth.
 */
export interface AnchorPoint {
  readonly point: Point;
  readonly handleIn: Point;
  readonly handleOut: Point;
  readonly kind: AnchorKind;
}

/**
 * A connected sequence of anchors. A path-`d` may contain multiple
 * subpaths separated by `M`; each becomes its own `AnchorSubpath`.
 *
 * - `closed`: `true` when the subpath ends with `Z`/`z` (visually a
 *   closed shape). Round-trips: `anchorsToPathD(parsePathToAnchors(d))`
 *   preserves the close flag.
 */
export interface AnchorSubpath {
  readonly anchors: readonly AnchorPoint[];
  readonly closed: boolean;
}

/**
 * Parse a path `d` attribute into ordered subpaths of anchors. The
 * inverse of {@link anchorsToPathD}.
 *
 * **Supported commands**: `M m L l H h V v C c S s Q q T t Z z`.
 * Arcs (`A a`) are converted to **cusp** anchors at the endpoint
 * (handles collapsed to the point) — accurate position, but the
 * curvature info is lost. A future polish can convert arcs to cubic
 * beziers before parsing.
 *
 * **Quadratic beziers** (`Q q T t`) are converted to cubic on the
 * fly so the editor has a single internal representation. The
 * conversion is mathematically exact:
 *   C1 = P0 + 2/3·(QC − P0)
 *   C2 = P1 + 2/3·(QC − P1)
 *
 * **Smooth continuations** (`S s T t`) reflect the previous segment's
 * control point per SVG spec.
 *
 * Returns an empty array for `d` strings without any `M` command
 * (degenerate input).
 */
export function parsePathToAnchors(d: string): readonly AnchorSubpath[] {
  const segments = parsePathD(d);
  const subpaths: { anchors: AnchorPoint[]; closed: boolean }[] = [];
  let current: { anchors: AnchorPoint[]; closed: boolean } | null = null;
  // Cursor position (end of previous segment, absolute coords).
  let cx = 0;
  let cy = 0;
  // Reflection target: the previous bezier's second-to-last control
  // point. Used by `S/s/T/t` continuation. Reset on any non-bezier cmd.
  let lastCubicCtrl: Point | null = null;
  let lastQuadCtrl: Point | null = null;
  // Pending handleOut for the LAST anchor pushed. We finalize when
  // the next anchor lands (we then know the incoming side's handle).
  let pendingHandleOut: Point | null = null;

  /** Push a new anchor, wiring `pendingHandleOut` to the previous one. */
  const pushAnchor = (anchor: AnchorPoint, handleOut: Point | null): void => {
    if (current === null) return;
    if (current.anchors.length > 0 && pendingHandleOut !== null) {
      const prev = current.anchors[current.anchors.length - 1]!;
      current.anchors[current.anchors.length - 1] = { ...prev, handleOut: pendingHandleOut };
    }
    current.anchors.push(anchor);
    pendingHandleOut = handleOut;
  };

  for (const seg of segments) {
    const { cmd, args } = seg;
    switch (cmd) {
      case 'M':
      case 'm': {
        // Per spec: first pair of `m` AFTER a starting `M` is absolute;
        // subsequent pairs are treated as implicit `l/L`. We honor that.
        for (let i = 0; i < args.length; i += 2) {
          const x = args[i]!;
          const y = args[i + 1]!;
          if (i === 0) {
            const isAbs = cmd === 'M' || subpaths.length === 0;
            const nx = isAbs ? x : cx + x;
            const ny = isAbs ? y : cy + y;
            current = { anchors: [], closed: false };
            subpaths.push(current);
            pendingHandleOut = null;
            const a: AnchorPoint = {
              point: { x: nx, y: ny },
              handleIn: { x: nx, y: ny },
              handleOut: { x: nx, y: ny },
              kind: 'cusp',
            };
            current.anchors.push(a);
            cx = nx;
            cy = ny;
          } else {
            const isAbs = cmd === 'M';
            const nx = isAbs ? x : cx + x;
            const ny = isAbs ? y : cy + y;
            pushAnchor(
              {
                point: { x: nx, y: ny },
                handleIn: { x: nx, y: ny },
                handleOut: { x: nx, y: ny },
                kind: 'cusp',
              },
              null,
            );
            cx = nx;
            cy = ny;
          }
        }
        lastCubicCtrl = null;
        lastQuadCtrl = null;
        break;
      }
      case 'L':
      case 'l': {
        for (let i = 0; i < args.length; i += 2) {
          const isAbs = cmd === 'L';
          const nx = isAbs ? args[i]! : cx + args[i]!;
          const ny = isAbs ? args[i + 1]! : cy + args[i + 1]!;
          pushAnchor(
            {
              point: { x: nx, y: ny },
              handleIn: { x: nx, y: ny },
              handleOut: { x: nx, y: ny },
              kind: 'cusp',
            },
            null,
          );
          cx = nx;
          cy = ny;
        }
        lastCubicCtrl = null;
        lastQuadCtrl = null;
        break;
      }
      case 'H':
      case 'h': {
        for (const dx of args) {
          const nx = cmd === 'H' ? dx : cx + dx;
          pushAnchor(
            {
              point: { x: nx, y: cy },
              handleIn: { x: nx, y: cy },
              handleOut: { x: nx, y: cy },
              kind: 'cusp',
            },
            null,
          );
          cx = nx;
        }
        lastCubicCtrl = null;
        lastQuadCtrl = null;
        break;
      }
      case 'V':
      case 'v': {
        for (const dy of args) {
          const ny = cmd === 'V' ? dy : cy + dy;
          pushAnchor(
            {
              point: { x: cx, y: ny },
              handleIn: { x: cx, y: ny },
              handleOut: { x: cx, y: ny },
              kind: 'cusp',
            },
            null,
          );
          cy = ny;
        }
        lastCubicCtrl = null;
        lastQuadCtrl = null;
        break;
      }
      case 'C':
      case 'c': {
        // 6 args per command: x1 y1 x2 y2 x y
        for (let i = 0; i < args.length; i += 6) {
          const isAbs = cmd === 'C';
          const x1 = isAbs ? args[i]! : cx + args[i]!;
          const y1 = isAbs ? args[i + 1]! : cy + args[i + 1]!;
          const x2 = isAbs ? args[i + 2]! : cx + args[i + 2]!;
          const y2 = isAbs ? args[i + 3]! : cy + args[i + 3]!;
          const x = isAbs ? args[i + 4]! : cx + args[i + 4]!;
          const y = isAbs ? args[i + 5]! : cy + args[i + 5]!;
          // Wire the prev anchor's handleOut = (x1, y1).
          pendingHandleOut = { x: x1, y: y1 };
          pushAnchor(
            {
              point: { x, y },
              handleIn: { x: x2, y: y2 },
              handleOut: { x, y }, // will be overwritten by next segment if any
              kind: classifyAnchorKind({ x, y }, { x: x2, y: y2 }, null),
            },
            null,
          );
          lastCubicCtrl = { x: x2, y: y2 };
          lastQuadCtrl = null;
          cx = x;
          cy = y;
        }
        break;
      }
      case 'S':
      case 's': {
        // 4 args per command: x2 y2 x y (x1,y1 reflected from prev cubic)
        for (let i = 0; i < args.length; i += 4) {
          const isAbs = cmd === 'S';
          const x2 = isAbs ? args[i]! : cx + args[i]!;
          const y2 = isAbs ? args[i + 1]! : cy + args[i + 1]!;
          const x = isAbs ? args[i + 2]! : cx + args[i + 2]!;
          const y = isAbs ? args[i + 3]! : cy + args[i + 3]!;
          const x1 = lastCubicCtrl !== null ? 2 * cx - lastCubicCtrl.x : cx;
          const y1 = lastCubicCtrl !== null ? 2 * cy - lastCubicCtrl.y : cy;
          pendingHandleOut = { x: x1, y: y1 };
          pushAnchor(
            {
              point: { x, y },
              handleIn: { x: x2, y: y2 },
              handleOut: { x, y },
              kind: 'smooth',
            },
            null,
          );
          lastCubicCtrl = { x: x2, y: y2 };
          lastQuadCtrl = null;
          cx = x;
          cy = y;
        }
        break;
      }
      case 'Q':
      case 'q': {
        // 4 args: cx cy x y — convert to cubic
        for (let i = 0; i < args.length; i += 4) {
          const isAbs = cmd === 'Q';
          const qx = isAbs ? args[i]! : cx + args[i]!;
          const qy = isAbs ? args[i + 1]! : cy + args[i + 1]!;
          const x = isAbs ? args[i + 2]! : cx + args[i + 2]!;
          const y = isAbs ? args[i + 3]! : cy + args[i + 3]!;
          // Q→C: C1 = P0 + 2/3·(QC − P0), C2 = P1 + 2/3·(QC − P1)
          const c1x = cx + (2 / 3) * (qx - cx);
          const c1y = cy + (2 / 3) * (qy - cy);
          const c2x = x + (2 / 3) * (qx - x);
          const c2y = y + (2 / 3) * (qy - y);
          pendingHandleOut = { x: c1x, y: c1y };
          pushAnchor(
            {
              point: { x, y },
              handleIn: { x: c2x, y: c2y },
              handleOut: { x, y },
              kind: 'smooth',
            },
            null,
          );
          lastQuadCtrl = { x: qx, y: qy };
          lastCubicCtrl = null;
          cx = x;
          cy = y;
        }
        break;
      }
      case 'T':
      case 't': {
        // 2 args: x y — quad with implicit control reflected from prev
        for (let i = 0; i < args.length; i += 2) {
          const isAbs = cmd === 'T';
          const x = isAbs ? args[i]! : cx + args[i]!;
          const y = isAbs ? args[i + 1]! : cy + args[i + 1]!;
          const reflectedQx: number = lastQuadCtrl !== null ? 2 * cx - lastQuadCtrl.x : cx;
          const reflectedQy: number = lastQuadCtrl !== null ? 2 * cy - lastQuadCtrl.y : cy;
          const c1x = cx + (2 / 3) * (reflectedQx - cx);
          const c1y = cy + (2 / 3) * (reflectedQy - cy);
          const c2x = x + (2 / 3) * (reflectedQx - x);
          const c2y = y + (2 / 3) * (reflectedQy - y);
          pendingHandleOut = { x: c1x, y: c1y };
          pushAnchor(
            {
              point: { x, y },
              handleIn: { x: c2x, y: c2y },
              handleOut: { x, y },
              kind: 'smooth',
            },
            null,
          );
          lastQuadCtrl = { x: reflectedQx, y: reflectedQy };
          lastCubicCtrl = null;
          cx = x;
          cy = y;
        }
        break;
      }
      case 'A':
      case 'a': {
        // Arc: 7 args (rx ry rot largeArc sweep x y). For now we keep
        // the endpoint as a cusp anchor — curvature is lost. A future
        // refinement should convert the arc to cubic beziers using
        // the standard endpoint-to-center parameterization.
        for (let i = 0; i < args.length; i += 7) {
          const isAbs = cmd === 'A';
          const x = isAbs ? args[i + 5]! : cx + args[i + 5]!;
          const y = isAbs ? args[i + 6]! : cy + args[i + 6]!;
          pushAnchor(
            {
              point: { x, y },
              handleIn: { x, y },
              handleOut: { x, y },
              kind: 'cusp',
            },
            null,
          );
          cx = x;
          cy = y;
        }
        lastCubicCtrl = null;
        lastQuadCtrl = null;
        break;
      }
      case 'Z':
      case 'z': {
        // Close: mark the current subpath as closed. The "close line"
        // is implicit at render time; no extra anchor pushed.
        if (current !== null) current.closed = true;
        // SVG spec: cursor returns to the subpath's start point.
        if (current !== null && current.anchors.length > 0) {
          const first = current.anchors[0]!;
          cx = first.point.x;
          cy = first.point.y;
        }
        lastCubicCtrl = null;
        lastQuadCtrl = null;
        break;
      }
    }
  }

  // Finalize any pending handleOut on the very last anchor of the
  // last open (non-closed) subpath.
  if (current !== null && pendingHandleOut !== null && current.anchors.length > 0) {
    const lastIdx = current.anchors.length - 1;
    const prev = current.anchors[lastIdx]!;
    current.anchors[lastIdx] = { ...prev, handleOut: pendingHandleOut };
  }

  return subpaths;
}

/**
 * Serialize anchor subpaths back to a path `d` string. The inverse
 * of {@link parsePathToAnchors}.
 *
 * Output format:
 * - Always **absolute** commands (M, L, C, Z).
 * - Compact: minimal whitespace, no leading zeros stripped (numbers
 *   formatted via `formatNumber` for stability).
 * - Each anchor pair → cubic bezier (C) UNLESS both handles collapse
 *   to the anchor point → straight line (L).
 *
 * Doesn't try to "minify back to original" — round-trip preserves
 * geometry but not byte-identity (whitespace, command letters).
 */
export function anchorsToPathD(subpaths: readonly AnchorSubpath[]): string {
  const parts: string[] = [];
  for (const sub of subpaths) {
    if (sub.anchors.length === 0) continue;
    const first = sub.anchors[0]!;
    parts.push(`M${formatNumber(first.point.x)} ${formatNumber(first.point.y)}`);
    for (let i = 1; i < sub.anchors.length; i++) {
      const prev = sub.anchors[i - 1]!;
      const cur = sub.anchors[i]!;
      parts.push(buildSegment(prev, cur));
    }
    if (sub.closed) {
      // Add a closing segment IF the last anchor's handleOut OR the
      // first's handleIn differs from a straight line. Otherwise just Z.
      const first = sub.anchors[0]!;
      const last = sub.anchors[sub.anchors.length - 1]!;
      const handlesAreFlat = eq(last.handleOut, last.point) && eq(first.handleIn, first.point);
      if (!handlesAreFlat) parts.push(buildSegment(last, first));
      parts.push('Z');
    }
  }
  return parts.join(' ');
}

/**
 * Pick the appropriate command (L or C) for the segment from `prev`
 * to `cur` based on whether either side has a non-flat handle.
 */
function buildSegment(prev: AnchorPoint, cur: AnchorPoint): string {
  const flatOut = eq(prev.handleOut, prev.point);
  const flatIn = eq(cur.handleIn, cur.point);
  if (flatOut && flatIn) {
    return `L${formatNumber(cur.point.x)} ${formatNumber(cur.point.y)}`;
  }
  return (
    `C${formatNumber(prev.handleOut.x)} ${formatNumber(prev.handleOut.y)} ` +
    `${formatNumber(cur.handleIn.x)} ${formatNumber(cur.handleIn.y)} ` +
    `${formatNumber(cur.point.x)} ${formatNumber(cur.point.y)}`
  );
}

/** Equality within FP epsilon. */
function eq(a: Point, b: Point, eps = 1e-6): boolean {
  return Math.abs(a.x - b.x) < eps && Math.abs(a.y - b.y) < eps;
}

/** Compact number formatter (strips trailing zeros). */
function formatNumber(n: number): string {
  // Same heuristic as path-d-scaler — keep output small but stable.
  return Number.isInteger(n) ? `${n}` : Number(n.toFixed(4)).toString();
}

/**
 * Heuristic to classify an anchor as cusp/smooth/symmetric based on
 * its handles. Used during parse when the source command doesn't
 * explicitly encode the kind (e.g., a `C` always lands as `cusp`
 * unless we detect colinearity). Callers may override via
 * `ConvertAnchorTypeCommand`.
 *
 * - `point`: the anchor itself
 * - `handleIn`: incoming control point (absolute)
 * - `handleOut`: outgoing control point (absolute), or `null` when
 *   not yet known (parser hasn't seen the next segment)
 */
export function classifyAnchorKind(
  point: Point,
  handleIn: Point,
  handleOut: Point | null,
): AnchorKind {
  if (handleOut === null) return 'cusp';
  const inDx = handleIn.x - point.x;
  const inDy = handleIn.y - point.y;
  const outDx = handleOut.x - point.x;
  const outDy = handleOut.y - point.y;
  const inLen = Math.hypot(inDx, inDy);
  const outLen = Math.hypot(outDx, outDy);
  if (inLen < 1e-6 || outLen < 1e-6) return 'cusp';
  // Colinear (180° apart) when in/out are negatives of each other.
  // Use cross product for parallelism + sign check for direction.
  const cross = inDx * outDy - inDy * outDx;
  const dot = inDx * outDx + inDy * outDy;
  if (Math.abs(cross) > 1e-4 * inLen * outLen) return 'cusp';
  if (dot >= 0) return 'cusp'; // same direction (degenerate)
  // Colinear-opposite → smooth or symmetric depending on length match.
  if (Math.abs(inLen - outLen) < 1e-4 * Math.max(inLen, outLen)) return 'symmetric';
  return 'smooth';
}

/** Unused export to keep `PathSegment` re-exported for downstream tests. */
export type { PathSegment };
