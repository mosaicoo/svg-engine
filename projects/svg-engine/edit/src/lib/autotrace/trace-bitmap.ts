/**
 * **D-062d** — Raster → vector tracing (Auto-trace).
 *
 * **Honest scope** (read this first):
 * - Implements a **single-threshold bicromático** trace (one cut-off
 *   between "ink" and "paper"). Real production tracers (potrace,
 *   Adobe Image Trace) do color quantization, multi-layer extraction,
 *   curve fitting (cubic Bezier), and corner detection. This module
 *   covers the **80% case** for line art / logos / icons. Photos
 *   degrade into silhouettes — that's the algorithm working as
 *   designed, not a bug.
 * - Output is polyline (no curve fitting). Each contour becomes a
 *   straight-line path. Looks faceted at zoom — acceptable for
 *   logo-style sources; not photographic.
 * - For high-fidelity raster → vector, recommend external tooling
 *   (potrace-js wrapped as a plugin, or upload the source to
 *   Illustrator's Image Trace) — documented in the panel's UI.
 *
 * **Algorithm**:
 * 1. Binarize the `ImageData` by per-pixel luminance vs. `threshold`.
 * 2. Walk the binary grid with **Marching Squares** to extract each
 *    connected contour as a sequence of edge midpoints.
 * 3. Simplify each contour with **Douglas-Peucker** at a configurable
 *    `tolerance` (default 1px) to reduce node count by ~80%
 *    typically.
 * 4. Emit each contour as a closed SVG `d` string in document coords
 *    (offset by the image's top-left + scaled to its dimensions).
 *
 * **Pure module**: no Angular, no DI, no DOM access. Inputs are
 * raw `ImageData` + scalar params; outputs are strings. This lets
 * specs run without a renderer and lets the caller decide how to
 * obtain the `ImageData` (canvas2d.getImageData, OffscreenCanvas,
 * a fetched `<img>`, etc.).
 */

export interface TraceOptions {
  /**
   * Luminance threshold, 0..255. Pixels with luminance ≤ threshold
   * are considered "ink"; > threshold are "paper". Default 128 (mid).
   */
  readonly threshold?: number;
  /**
   * Douglas-Peucker simplification tolerance in image pixels. Higher
   * values produce smoother but less accurate contours. Default 1px.
   */
  readonly tolerance?: number;
  /**
   * Image placement in document coordinates. The output paths are
   * translated/scaled so they overlay the original image at its
   * current canvas position. Default: identity (0,0) at width × height.
   */
  readonly destX?: number;
  readonly destY?: number;
  readonly destWidth?: number;
  readonly destHeight?: number;
  /**
   * Drop contours with fewer than this many points after simplification.
   * Filters out marching-squares noise from tiny isolated pixels.
   * Default 4 (a triangle has 3 + closing edge).
   */
  readonly minPoints?: number;
}

/** Extracted contour in image-local pixel coords (pre-scaling). */
interface ImageContour {
  readonly points: { x: number; y: number }[];
}

/**
 * Main entry point: produce one SVG `d` string per traced contour.
 *
 * @returns Array of closed-polygon `d` strings, ready to feed into
 *   `createPath()`. Empty array when the image is all-paper or all-
 *   ink.
 */
export function traceImageToPaths(image: ImageData, opts: TraceOptions = {}): string[] {
  const threshold = opts.threshold ?? 128;
  const tolerance = opts.tolerance ?? 1;
  const minPoints = opts.minPoints ?? 4;
  const destX = opts.destX ?? 0;
  const destY = opts.destY ?? 0;
  const destW = opts.destWidth ?? image.width;
  const destH = opts.destHeight ?? image.height;

  const binary = binarize(image, threshold);
  const contours = marchingSquares(binary, image.width, image.height);
  const simplified = contours
    .map((c) => ({ points: douglasPeucker(c.points, tolerance) }))
    .filter((c) => c.points.length >= minPoints);

  // Scale image-local coords (0..imgWidth) to dest box.
  const sx = destW / image.width;
  const sy = destH / image.height;
  return simplified.map((c) => {
    const pts = c.points
      .map((p, i) => {
        const x = destX + p.x * sx;
        const y = destY + p.y * sy;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(' ');
    return `${pts} Z`;
  });
}

// ── Step 1: binarize ─────────────────────────────────────────────────

/**
 * Returns a `Uint8Array` of `width × height` where 1 = ink (below
 * threshold) and 0 = paper. Alpha channel weight: a fully transparent
 * pixel always counts as paper regardless of its RGB, which matches
 * user expectation when tracing PNGs with transparency.
 */
function binarize(image: ImageData, threshold: number): Uint8Array {
  const { width, height, data } = image;
  const out = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    const a = data[i * 4 + 3]!;
    if (a < 128) {
      out[i] = 0;
      continue;
    }
    // ITU-R BT.601 luminance — cheap + perceptually OK for tracing.
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    out[i] = lum <= threshold ? 1 : 0;
  }
  return out;
}

// ── Step 2: Marching squares ─────────────────────────────────────────

/**
 * Walk the binary grid; for each unvisited boundary pixel, trace the
 * contour clockwise via 4-direction edge following. Returns one
 * `ImageContour` per connected ink region.
 *
 * **Algorithm** (Moore neighborhood variant):
 * 1. Scan top-to-bottom, left-to-right for an ink pixel with at least
 *    one paper neighbor (boundary).
 * 2. From that seed, walk the contour by checking the 4 cardinal
 *    neighbors in CW order from the current "facing" direction.
 * 3. Mark each visited pixel so the outer scan skips it on subsequent
 *    iterations.
 * 4. Yield the collected coords as the contour.
 *
 * Holes inside ink regions become separate contours and end up as
 * standalone paths in the output — the consumer can `evenodd`-fill
 * if needed, or apply the Pathfinder Subtract op to cut holes.
 */
function marchingSquares(binary: Uint8Array, width: number, height: number): ImageContour[] {
  const contours: ImageContour[] = [];
  const visited = new Uint8Array(width * height);
  const isInk = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    return binary[y * width + x] === 1;
  };
  const isBoundary = (x: number, y: number): boolean => {
    if (!isInk(x, y)) return false;
    // Boundary iff any 4-neighbor is paper.
    return !isInk(x - 1, y) || !isInk(x + 1, y) || !isInk(x, y - 1) || !isInk(x, y + 1);
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx] === 1 || !isBoundary(x, y)) continue;
      // Trace the contour starting at (x,y), walking CW.
      const pts: { x: number; y: number }[] = [];
      // direction: 0=E, 1=S, 2=W, 3=N
      let cx = x;
      let cy = y;
      let dir = 0;
      const startX = x;
      const startY = y;
      const maxSteps = width * height * 4; // safety cap
      let steps = 0;
      do {
        if (visited[cy * width + cx] === 0) {
          pts.push({ x: cx + 0.5, y: cy + 0.5 });
          visited[cy * width + cx] = 1;
        }
        // Try to turn left first (CCW), then continue straight, then
        // turn right (CW), then reverse. Classic Moore-Neighbor walk.
        let found = false;
        for (let turn = -1; turn <= 2; turn++) {
          const nextDir = ((dir + turn + 4) % 4) as 0 | 1 | 2 | 3;
          const [dx, dy] = DIRS[nextDir];
          const nx = cx + dx;
          const ny = cy + dy;
          if (isBoundary(nx, ny)) {
            cx = nx;
            cy = ny;
            dir = nextDir;
            found = true;
            break;
          }
        }
        if (!found) break; // isolated pixel
        steps++;
      } while ((cx !== startX || cy !== startY) && steps < maxSteps);
      if (pts.length > 0) contours.push({ points: pts });
    }
  }
  return contours;
}

const DIRS: readonly [number, number][] = [
  [1, 0], // E
  [0, 1], // S
  [-1, 0], // W
  [0, -1], // N
];

// ── Step 3: Douglas-Peucker simplification ───────────────────────────

/**
 * Reduce point count by recursively removing points whose
 * perpendicular distance from a segment is below `tolerance`. Classic
 * line simplification — preserves shape silhouette while cutting
 * 70-90% of intermediate points for marching-squares output.
 */
function douglasPeucker(
  points: readonly { x: number; y: number }[],
  tolerance: number,
): { x: number; y: number }[] {
  if (points.length <= 2) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  simplifyRec(points, 0, points.length - 1, tolerance, keep);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push(points[i]!);
  }
  return out;
}

function simplifyRec(
  points: readonly { x: number; y: number }[],
  start: number,
  end: number,
  tol: number,
  keep: boolean[],
): void {
  if (end <= start + 1) return;
  let maxDist = 0;
  let maxIdx = start;
  const a = points[start]!;
  const b = points[end]!;
  for (let i = start + 1; i < end; i++) {
    const d = perpDistance(points[i]!, a, b);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > tol) {
    keep[maxIdx] = true;
    simplifyRec(points, start, maxIdx, tol, keep);
    simplifyRec(points, maxIdx, end, tol, keep);
  }
}

function perpDistance(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 < 1e-9) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / ab2;
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.hypot(p.x - cx, p.y - cy);
}
