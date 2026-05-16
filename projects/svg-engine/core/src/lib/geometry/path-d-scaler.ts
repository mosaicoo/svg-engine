import type { Point } from '../types/point';

/**
 * Pure SVG path-`d` scaler (Bloco 4-Resize-Proper / R2). Takes a `d`
 * attribute string, applies a document-space scale `(sx, sy)` around
 * `anchor`, returns the equivalent `d` string with every coordinate
 * baked into the new geometry.
 *
 * **Why this exists**: paths can't be scaled by mutating a single field
 * (unlike rect's `width` or ellipse's `rx`). The path's geometry lives
 * inside the `d` string. To avoid composing a scale matrix into the
 * node's `transform` (the original Bloco 3 approach, which distorts
 * stroke and creates inspector mismatch), we parse + scale + reserialize.
 *
 * **Commands handled** (full SVG 1.1 path grammar minus arcs):
 * `M m L l H h V v C c S s Q q T t Z z`. Arcs (`A a`) are scaled with a
 * known approximation: endpoint scales correctly; radii scale by
 * `|sx|`/`|sy|` and x-axis-rotation is preserved — this is exact when
 * the arc's x-axis-rotation is 0 (the overwhelming common case for
 * editor-generated arcs), and an approximation otherwise. Users who
 * need pixel-perfect arc scaling under non-uniform-with-rotation should
 * convert their arc-bearing paths to cubic bezier first (a future
 * capability of `svg-engine/optimize`).
 *
 * **Tokenizer**: regex-based. Tolerates SVG's number formats
 * (e.g., `1.5`, `-.5`, `1e-3`) and separators (comma OR whitespace).
 *
 * **First-`m` quirk handled**: per SVG 1.1 §9.3.3, when `m` is the
 * very first command, its first coordinate pair is interpreted as
 * **absolute**. We rewrite that pair as `M` before scaling so all
 * relative subsequent commands stay relative.
 *
 * **Output format**: minimized whitespace, command letters preserved
 * (we don't normalize to absolute), numbers formatted with the
 * compactest representation (no trailing zeros). Output is `d`-equivalent
 * to the input under the scale; byte-identical roundtrip with `scale=1`
 * is **not** guaranteed (whitespace may be normalized).
 */

/** A parsed path command segment. */
export interface PathSegment {
  readonly cmd: PathCmd;
  /** Flat array of numeric arguments — stride depends on `cmd`. */
  readonly args: readonly number[];
}

export type PathCmd =
  | 'M'
  | 'm'
  | 'L'
  | 'l'
  | 'H'
  | 'h'
  | 'V'
  | 'v'
  | 'C'
  | 'c'
  | 'S'
  | 's'
  | 'Q'
  | 'q'
  | 'T'
  | 't'
  | 'A'
  | 'a'
  | 'Z'
  | 'z';

/** Tokenizer regex: command letters OR signed numbers (with optional exponent). */
const TOKEN_RE = /[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.\d*|\d+|\.\d+)(?:[eE][+-]?\d+)?/g;

/** Parse an SVG `d` string into a sequence of command segments. */
export function parsePathD(d: string): readonly PathSegment[] {
  const tokens = d.match(TOKEN_RE) ?? [];
  const segments: { cmd: PathCmd; args: number[] }[] = [];
  let currentCmd: PathCmd | null = null;
  let currentArgs: number[] = [];

  const flush = (): void => {
    if (currentCmd !== null) {
      segments.push({ cmd: currentCmd, args: currentArgs });
    }
  };

  for (const tok of tokens) {
    if (/^[A-Za-z]$/.test(tok)) {
      flush();
      currentCmd = tok as PathCmd;
      currentArgs = [];
    } else {
      const n = Number(tok);
      if (Number.isFinite(n)) currentArgs.push(n);
    }
  }
  flush();
  return segments;
}

/**
 * Serialize segments back into a `d` string. Commands are uppercased/
 * lowercased as parsed (absolute/relative preserved). Numbers formatted
 * with default `toString` (which already drops trailing zeros).
 *
 * Separator: single space between every token. SVG accepts commas; we
 * use space for readability and compactness in most cases.
 */
export function serializePathD(segments: readonly PathSegment[]): string {
  const parts: string[] = [];
  for (const seg of segments) {
    parts.push(seg.cmd);
    for (const n of seg.args) {
      parts.push(formatNumber(n));
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function formatNumber(n: number): string {
  // -0 → 0
  if (Object.is(n, -0)) return '0';
  // Round noise from float math to 6 decimal places — typical SVG
  // precision; preserves accuracy for editing without bloating d.
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(rounded);
}

/**
 * Scale a parsed path under document-space `(sx, sy)` around `anchor`,
 * returning new segments. Uppercase (absolute) commands transform their
 * coordinates around the anchor; lowercase (relative) commands transform
 * deltas by scale only. See file header for arc treatment caveat.
 *
 * Returns a new array; input segments are not mutated.
 */
export function scalePathSegments(
  segments: readonly PathSegment[],
  sx: number,
  sy: number,
  anchor: Point,
): readonly PathSegment[] {
  // Handle first-m absolute quirk: if the very first command is 'm',
  // its first coordinate pair is interpreted as absolute (M). Rewrite
  // to M for the first pair; the remainder (if any) stays as relative
  // lineto via implicit-l semantics.
  const normalized = preprocessFirstM(segments);
  return normalized.map((seg) => scaleSegment(seg, sx, sy, anchor));
}

function preprocessFirstM(segments: readonly PathSegment[]): readonly PathSegment[] {
  if (segments.length === 0) return segments;
  const first = segments[0]!;
  if (first.cmd !== 'm') return segments;
  if (first.args.length < 2) return segments;
  const firstPair: PathSegment = { cmd: 'M', args: [first.args[0]!, first.args[1]!] };
  const rest = first.args.slice(2);
  const head: PathSegment[] = [firstPair];
  if (rest.length > 0) head.push({ cmd: 'l', args: rest });
  return [...head, ...segments.slice(1)];
}

function scaleSegment(seg: PathSegment, sx: number, sy: number, anchor: Point): PathSegment {
  const a = seg.args;
  switch (seg.cmd) {
    case 'Z':
    case 'z':
      return seg;
    case 'M':
    case 'L':
    case 'T':
      return { cmd: seg.cmd, args: scalePairsAbs(a, sx, sy, anchor) };
    case 'm':
    case 'l':
    case 't':
      return { cmd: seg.cmd, args: scalePairsRel(a, sx, sy) };
    case 'H':
      return { cmd: seg.cmd, args: a.map((x) => anchor.x + (x - anchor.x) * sx) };
    case 'h':
      return { cmd: seg.cmd, args: a.map((x) => x * sx) };
    case 'V':
      return { cmd: seg.cmd, args: a.map((y) => anchor.y + (y - anchor.y) * sy) };
    case 'v':
      return { cmd: seg.cmd, args: a.map((y) => y * sy) };
    case 'C':
      // (x1 y1 x2 y2 x y) per instance — all 3 pairs absolute
      return { cmd: seg.cmd, args: scalePairsAbs(a, sx, sy, anchor) };
    case 'c':
      return { cmd: seg.cmd, args: scalePairsRel(a, sx, sy) };
    case 'S':
    case 'Q':
      // (x2 y2 x y) for S, (x1 y1 x y) for Q — both have 2 pairs absolute
      return { cmd: seg.cmd, args: scalePairsAbs(a, sx, sy, anchor) };
    case 's':
    case 'q':
      return { cmd: seg.cmd, args: scalePairsRel(a, sx, sy) };
    case 'A':
      return { cmd: seg.cmd, args: scaleArcAbs(a, sx, sy, anchor) };
    case 'a':
      return { cmd: seg.cmd, args: scaleArcRel(a, sx, sy) };
  }
}

/** Scale a sequence of (x, y) pairs treated as absolute coordinates. */
function scalePairsAbs(args: readonly number[], sx: number, sy: number, anchor: Point): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < args.length; i += 2) {
    out.push(anchor.x + (args[i]! - anchor.x) * sx);
    out.push(anchor.y + (args[i + 1]! - anchor.y) * sy);
  }
  return out;
}

/** Scale a sequence of (dx, dy) deltas — relative coords. */
function scalePairsRel(args: readonly number[], sx: number, sy: number): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < args.length; i += 2) {
    out.push(args[i]! * sx);
    out.push(args[i + 1]! * sy);
  }
  return out;
}

/**
 * Scale absolute arc segments. Each arc instance is 7 values:
 * `rx ry x-axis-rotation large-arc-flag sweep-flag x y`.
 * - `rx`, `ry`: scale by `|sx|`/`|sy|` (exact when rotation=0)
 * - `x-axis-rotation`: preserved (exact when sx === sy or rotation=0)
 * - `large-arc-flag`, `sweep-flag`: preserved (rounded to nearest int
 *   since they're booleans; flip sweep if scale is negative on one axis
 *   only — mirror reverses arc winding)
 * - `x`, `y`: absolute endpoint, scaled around anchor
 *
 * Negative sx XOR negative sy → flip sweep flag. Both negative or both
 * positive → preserve. This matches the geometric truth: mirroring
 * across one axis reverses the arc's traversal direction.
 */
function scaleArcAbs(args: readonly number[], sx: number, sy: number, anchor: Point): number[] {
  const out: number[] = [];
  const flipSweep = sx < 0 !== sy < 0;
  for (let i = 0; i + 6 < args.length; i += 7) {
    out.push(Math.abs(args[i]! * sx)); // rx
    out.push(Math.abs(args[i + 1]! * sy)); // ry
    out.push(args[i + 2]!); // rotation preserved
    out.push(args[i + 3]!); // large-arc-flag preserved
    out.push(flipSweep ? 1 - Math.round(args[i + 4]!) : Math.round(args[i + 4]!));
    out.push(anchor.x + (args[i + 5]! - anchor.x) * sx); // x
    out.push(anchor.y + (args[i + 6]! - anchor.y) * sy); // y
  }
  return out;
}

/** Like `scaleArcAbs` but x/y are relative deltas (no anchor offset). */
function scaleArcRel(args: readonly number[], sx: number, sy: number): number[] {
  const out: number[] = [];
  const flipSweep = sx < 0 !== sy < 0;
  for (let i = 0; i + 6 < args.length; i += 7) {
    out.push(Math.abs(args[i]! * sx));
    out.push(Math.abs(args[i + 1]! * sy));
    out.push(args[i + 2]!);
    out.push(args[i + 3]!);
    out.push(flipSweep ? 1 - Math.round(args[i + 4]!) : Math.round(args[i + 4]!));
    out.push(args[i + 5]! * sx);
    out.push(args[i + 6]! * sy);
  }
  return out;
}

/**
 * Convenience: parse → scale → serialize in one call. Use this from
 * the resize command. Returns the input unchanged when `d` is empty
 * (no segments to scale).
 */
export function bakePathD(d: string, sx: number, sy: number, anchor: Point): string {
  if (d.trim() === '') return d;
  return serializePathD(scalePathSegments(parsePathD(d), sx, sy, anchor));
}
