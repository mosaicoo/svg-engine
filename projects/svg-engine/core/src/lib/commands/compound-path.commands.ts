import { createPath } from '../model/node-factory';
import type { PathNode } from '../model/path-node';
import type { SvgNode } from '../model/svg-node';
import { findNodeById, findParent, insertNode, removeNode } from '../tree/tree-ops';
import { generateNodeId, type NodeId } from '../types/node-id';
import { type Command, type CommandContext, type CommandResult, fail, ok } from './command';
import { nodeToPathD } from './convert-to-path.command';

/**
 * **D-054 (Item 6.2)** — Compound paths (explícitos).
 *
 * In SVG, a single `<path>`'s `d` attribute may contain multiple
 * `M..Z` subpaths. The fill rule (`fill-rule="evenodd"` or
 * `"nonzero"`) decides how nested or overlapping subpaths interact —
 * the classic "donut" hole is just two `M..Z` subpaths with
 * `fill-rule: evenodd`.
 *
 * The vector editors that historically modeled this (Illustrator,
 * Inkscape, Affinity) all expose explicit commands to:
 *
 * - **Make Compound Path** (Ctrl+8 in Illustrator) — merge N selected
 *   paths into a single multi-subpath path. The combined path
 *   inherits the style of the bottom-most (or first selected) input,
 *   and the others vanish.
 * - **Release Compound Path** (Ctrl+Alt+8) — explode a multi-subpath
 *   path back into N single-subpath paths, one per `M..Z` chunk.
 *   Each released path inherits the original's style + transform.
 *
 * **Curve fidelity**: this command works on the `d` STRING directly
 * (concatenates / splits text), so cubic / quadratic beziers survive
 * round-trip exactly — no flatten/re-emit lossy step. Different from
 * pathfinder ops, which DO flatten because boolean math needs polygons.
 *
 * **Transform handling**: the make-side concatenates each input's
 * authored `d` after baking its `transform` into the coordinates
 * (uses {@link bakeTransformIntoPathD}). The result path's own
 * transform is the identity — the baked d already contains the
 * geometric positions. Release-side preserves the parent path's
 * transform on every released piece (so visual position is identical
 * before/after release).
 *
 * **Style inheritance**: make → first input's style wins (Illustrator
 * convention "operand A determines fill"). Release → all released
 * paths share the original style, since SVG can only express one
 * style per `<path>`.
 *
 * **Non-path inputs (rect/ellipse/etc) in make**: auto-converted via
 * {@link nodeToPathD} (same helper Pathfinder uses), so the user
 * doesn't have to manually Convert to Path first.
 *
 * **Undo**: snapshot of the entire root before mutation (simpler +
 * correct, matches the Pathfinder approach for the same reason).
 */

/**
 * Make a compound path from 2+ node ids. Result is placed at operand
 * A's z-order slot; other inputs are removed.
 */
export class MakeCompoundPathCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Make Compound Path';
  /**
   * Marked destructive (D-073 marker). Unlike `MakeLiveBooleanCommand`
   * (D-056) which preserves inputs as hidden children, this command
   * **removes** the operand inputs (the combined result keeps operand
   * A's id/slot; the others are removed) after baking their transforms
   * into a single combined `d`. Lossy in two ways:
   * (a) the input nodes' ids/metadata disappear from the tree,
   * (b) for non-path inputs, the auto-convert-to-path step loses
   * the original semantic shape type. Justifies an auto-snapshot
   * before execute when the consumer enables
   * `SnapshotsLimits.autoOnDestructive`.
   */
  readonly isDestructive = true;

  private previousRootSnapshot: SvgNode | null = null;

  constructor(private readonly nodeIds: readonly NodeId[]) {}

  execute(ctx: CommandContext): CommandResult {
    if (this.nodeIds.length < 2) {
      return fail(`${this.label}: need at least 2 nodes (got ${this.nodeIds.length})`);
    }
    const doc = ctx.state.document();
    this.previousRootSnapshot = doc.root;

    // Gather + validate inputs. Group/text/image are rejected (same
    // policy as Pathfinder — booleans/compound on those need explicit
    // conversion first).
    const inputs: SvgNode[] = [];
    for (const id of this.nodeIds) {
      const node = findNodeById(doc.root, id);
      if (node === null) return fail(`${this.label}: node "${id}" not found`);
      if (node.type === 'group' || node.type === 'text' || node.type === 'image') {
        return fail(`${this.label}: type "${node.type}" not supported`);
      }
      inputs.push(node);
    }

    // Bake each input's transform into its d, then concatenate.
    const parts: string[] = [];
    for (const node of inputs) {
      const raw = node.type === 'path' ? node.d : nodeToPathD(node);
      if (raw === null) {
        return fail(`${this.label}: cannot compute "d" for type "${node.type}"`);
      }
      const baked = bakeTransformIntoPathD(raw, node.transform);
      parts.push(baked.trim());
    }
    const combined = parts.join(' ');

    // Operand A holds the result (style + parent slot preserved).
    const operandA = inputs[0]!;
    const parent = findParent(doc.root, operandA.id);
    if (parent === null) return fail(`${this.label}: operand A has no parent`);
    const aIdx = parent.children.findIndex((c) => c.id === operandA.id);
    if (aIdx < 0) return fail(`${this.label}: operand A index lookup failed`);

    const fresh = createPath(combined);
    const next: PathNode = {
      ...fresh,
      id: operandA.id,
      // Identity transform — coordinates are already baked into d.
      transform: [1, 0, 0, 1, 0, 0],
      style: operandA.style,
      metadata: operandA.metadata,
    };

    // Replace operand A, then remove the others.
    let nextRoot = removeNode(doc.root, operandA.id);
    nextRoot = insertNode(nextRoot, parent.id, next, aIdx);
    for (let i = 1; i < inputs.length; i++) {
      nextRoot = removeNode(nextRoot, inputs[i]!.id);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousRootSnapshot === null) {
      return fail(`${this.label} undo: nothing captured`);
    }
    const snap = this.previousRootSnapshot;
    if (snap.type !== 'group') return fail(`${this.label} undo: snapshot root not a group`);
    const doc = ctx.state.document();
    ctx.state.setDocument({ ...doc, root: snap });
    return ok();
  }
}

/**
 * Release a multi-subpath path into N single-subpath paths. Becomes
 * a no-op (fail) if the input has only 1 subpath — there's nothing
 * to release.
 */
export class ReleaseCompoundPathCommand implements Command {
  readonly id: string = generateNodeId();
  readonly label = 'Release Compound Path';

  private previousRootSnapshot: SvgNode | null = null;

  constructor(private readonly nodeId: NodeId) {}

  execute(ctx: CommandContext): CommandResult {
    const doc = ctx.state.document();
    const node = findNodeById(doc.root, this.nodeId);
    if (node === null) return fail(`${this.label}: node "${this.nodeId}" not found`);
    if (node.type !== 'path') return fail(`${this.label}: only paths can be released`);

    const subpaths = splitPathDIntoSubpaths(node.d);
    if (subpaths.length < 2) {
      return fail(
        `${this.label}: path has only ${subpaths.length} subpath(s) — nothing to release`,
      );
    }

    this.previousRootSnapshot = doc.root;

    const parent = findParent(doc.root, this.nodeId);
    if (parent === null) return fail(`${this.label}: node has no parent`);
    const idx = parent.children.findIndex((c) => c.id === this.nodeId);
    if (idx < 0) return fail(`${this.label}: index lookup failed`);

    // Build the released paths. First piece keeps the original id
    // (refs survive); subsequent pieces get fresh ids. All inherit
    // the original's transform + style + metadata (style must be
    // shared — SVG forces one style per <path>; if the user wanted
    // per-subpath styling they shouldn't have made a compound in the
    // first place).
    const pieces: PathNode[] = subpaths.map((d, i) => {
      const fresh = createPath(d);
      return {
        ...fresh,
        id: i === 0 ? node.id : fresh.id,
        transform: node.transform,
        style: node.style,
        metadata: node.metadata,
      };
    });

    // Remove the original, then insert pieces in order at the same slot.
    let nextRoot = removeNode(doc.root, this.nodeId);
    for (let i = 0; i < pieces.length; i++) {
      nextRoot = insertNode(nextRoot, parent.id, pieces[i]!, idx + i);
    }
    ctx.state.setDocument({ ...doc, root: nextRoot });
    return ok();
  }

  undo(ctx: CommandContext): CommandResult {
    if (this.previousRootSnapshot === null) {
      return fail(`${this.label} undo: nothing captured`);
    }
    const snap = this.previousRootSnapshot;
    if (snap.type !== 'group') return fail(`${this.label} undo: snapshot root not a group`);
    const doc = ctx.state.document();
    ctx.state.setDocument({ ...doc, root: snap });
    return ok();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Split a path `d` into its individual `M..` subpaths. Each returned
 * string starts with `M` (or `m`) and runs up to (but not including)
 * the next `M`/`m`. Trailing whitespace trimmed.
 *
 * **Lossless**: this is a pure string operation — every command,
 * including `Z`/`z`, is preserved verbatim. Round-trip
 * `splitPathDIntoSubpaths(d).join(' ')` is geometrically identical
 * to the original.
 *
 * Exported for unit testing; also useful for future tools that want
 * to enumerate subpaths.
 */
export function splitPathDIntoSubpaths(d: string): readonly string[] {
  if (d.length === 0) return [];
  // Match: an M (or m) followed by anything up to the NEXT M/m or end.
  // The regex captures each subpath including its terminating Z (if any).
  const matches = d.match(/[Mm][^Mm]*/g);
  if (matches === null) return [];
  return matches.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Bake a 2×3 affine transform `[a, b, c, d, e, f]` into the
 * coordinates of an SVG path `d` string. Returns a new `d` whose
 * coordinates already include the transformation — applying identity
 * to the result yields the same visual outcome as applying the
 * transform to the original.
 *
 * **Coverage**:
 * - Absolute commands `M L H V C S Q T A Z` — transformed point-by-point.
 * - Relative commands `m l h v c s q t a z` — converted to absolute
 *   first (relative makes no sense once we change reference frame),
 *   then transformed.
 * - Arcs `A`/`a` are converted to their endpoints' transform; the
 *   `rx`/`ry`/`rot` parameters are passed through unchanged — this
 *   gives correct visual result only for pure translation/uniform
 *   scale (the general case requires arc-to-cubic decomposition,
 *   out of scope here; matches Illustrator's behavior of subtly
 *   warping ellipses under non-uniform scale until the user converts
 *   to bezier).
 *
 * **Identity short-circuit**: a transform that equals the identity
 * matrix returns the input unchanged (zero work, zero allocation).
 *
 * Exported for tests + potential future reuse by other commands
 * that need transform baking without flattening (e.g., import/export
 * normalization).
 */
export function bakeTransformIntoPathD(
  d: string,
  transform: readonly [number, number, number, number, number, number],
): string {
  const [a, b, c, dd, e, f] = transform;
  // Identity shortcut — common case (no parent group transform).
  if (a === 1 && b === 0 && c === 0 && dd === 1 && e === 0 && f === 0) {
    return d;
  }
  const tx = (x: number, y: number): [number, number] => [a * x + c * y + e, b * x + dd * y + f];

  // Tokenize: split into command + args groups.
  // Path data grammar tolerates separators (comma/whitespace) freely;
  // the regex below pulls out one command letter at a time plus all
  // numbers up to the next letter.
  const tokens = d.match(/[a-df-zA-DF-Z][^a-df-zA-DF-Z]*/g) ?? [];
  // Note: pattern excludes 'e'/'E' so they aren't mistaken for commands
  // (they're scientific-notation chars in numbers like 1.5e-3).
  const out: string[] = [];

  // Pen state — tracked because relative commands resolve against
  // the current pen, and we need the absolute coords to transform.
  let penX = 0;
  let penY = 0;
  let subpathStartX = 0;
  let subpathStartY = 0;

  for (const tok of tokens) {
    const cmd = tok[0]!;
    const numStr = tok.slice(1);
    const nums = parseNumbers(numStr);
    const rel = cmd === cmd.toLowerCase() && cmd !== 'Z' && cmd !== 'z';
    const upper = cmd.toUpperCase();

    switch (upper) {
      case 'M': {
        // M = moveto. After the first pair, additional pairs are implicit
        // L commands (per SVG spec). Same for L/T.
        if (nums.length < 2) break;
        const pairs: [number, number][] = [];
        for (let i = 0; i < nums.length; i += 2) {
          let x = nums[i]!;
          let y = nums[i + 1]!;
          if (rel) {
            x += penX;
            y += penY;
          }
          pairs.push([x, y]);
          penX = x;
          penY = y;
        }
        // First pair is the M, subsequent are implicit L.
        const [mx, my] = tx(pairs[0]![0], pairs[0]![1]);
        out.push(`M${fmt(mx)} ${fmt(my)}`);
        subpathStartX = pairs[0]![0];
        subpathStartY = pairs[0]![1];
        for (let i = 1; i < pairs.length; i++) {
          const [lx, ly] = tx(pairs[i]![0], pairs[i]![1]);
          out.push(` L${fmt(lx)} ${fmt(ly)}`);
        }
        break;
      }
      case 'L':
      case 'T': {
        for (let i = 0; i < nums.length; i += 2) {
          let x = nums[i]!;
          let y = nums[i + 1]!;
          if (rel) {
            x += penX;
            y += penY;
          }
          const [tx2, ty2] = tx(x, y);
          out.push(`${upper}${fmt(tx2)} ${fmt(ty2)}`);
          penX = x;
          penY = y;
        }
        break;
      }
      case 'H': {
        // Horizontal lineto — y stays at penY. Promote to L for transform
        // (a non-axis-aligned matrix would otherwise lose the implied y).
        for (const n of nums) {
          let x = n;
          if (rel) x += penX;
          const [tx2, ty2] = tx(x, penY);
          out.push(`L${fmt(tx2)} ${fmt(ty2)}`);
          penX = x;
          // penY unchanged
        }
        break;
      }
      case 'V': {
        for (const n of nums) {
          let y = n;
          if (rel) y += penY;
          const [tx2, ty2] = tx(penX, y);
          out.push(`L${fmt(tx2)} ${fmt(ty2)}`);
          penY = y;
        }
        break;
      }
      case 'C': {
        for (let i = 0; i < nums.length; i += 6) {
          let x1 = nums[i]!,
            y1 = nums[i + 1]!,
            x2 = nums[i + 2]!,
            y2 = nums[i + 3]!,
            x = nums[i + 4]!,
            y = nums[i + 5]!;
          if (rel) {
            x1 += penX;
            y1 += penY;
            x2 += penX;
            y2 += penY;
            x += penX;
            y += penY;
          }
          const [tx1, ty1] = tx(x1, y1);
          const [tx2, ty2] = tx(x2, y2);
          const [tx3, ty3] = tx(x, y);
          out.push(`C${fmt(tx1)} ${fmt(ty1)} ${fmt(tx2)} ${fmt(ty2)} ${fmt(tx3)} ${fmt(ty3)}`);
          penX = x;
          penY = y;
        }
        break;
      }
      case 'S':
      case 'Q': {
        // S = smooth cubic (2 pairs: [x2 y2] [x y])
        // Q = quadratic   (2 pairs: [x1 y1] [x y])
        const stride = 4;
        for (let i = 0; i < nums.length; i += stride) {
          let cx = nums[i]!,
            cy = nums[i + 1]!,
            x = nums[i + 2]!,
            y = nums[i + 3]!;
          if (rel) {
            cx += penX;
            cy += penY;
            x += penX;
            y += penY;
          }
          const [tcx, tcy] = tx(cx, cy);
          const [tex, tey] = tx(x, y);
          out.push(`${upper}${fmt(tcx)} ${fmt(tcy)} ${fmt(tex)} ${fmt(tey)}`);
          penX = x;
          penY = y;
        }
        break;
      }
      case 'A': {
        // Arc: rx ry rot largeArc sweep x y. The arc parameters
        // (rx/ry/rot) are NOT transformed in v1 (see JSDoc) — only
        // the endpoint. Visually correct for translation + uniform
        // scale; degrades gracefully for rotations/shears (matches
        // Illustrator's "warped ellipse" pre-convert-to-bezier).
        for (let i = 0; i < nums.length; i += 7) {
          const rx = nums[i]!,
            ry = nums[i + 1]!,
            rot = nums[i + 2]!,
            large = nums[i + 3]!,
            sweep = nums[i + 4]!;
          let x = nums[i + 5]!,
            y = nums[i + 6]!;
          if (rel) {
            x += penX;
            y += penY;
          }
          const [tex, tey] = tx(x, y);
          out.push(`A${rx} ${ry} ${rot} ${large} ${sweep} ${fmt(tex)} ${fmt(tey)}`);
          penX = x;
          penY = y;
        }
        break;
      }
      case 'Z': {
        out.push('Z');
        // Pen returns to subpath start (SVG spec).
        penX = subpathStartX;
        penY = subpathStartY;
        break;
      }
      default: {
        // Unknown command — pass through verbatim. Defensive: protects
        // against future SVG additions or malformed input being
        // silently dropped.
        out.push(tok);
      }
    }
  }
  return out.join(' ');
}

/** Parse space/comma-separated numbers from a path-data tail. */
function parseNumbers(s: string): number[] {
  // Path numbers can lack separators between negatives ("10-5" = "10 -5").
  // We split on whitespace/comma first, then re-split anything containing
  // a non-leading minus or +.
  const out: number[] = [];
  const raw = s.match(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? [];
  for (const r of raw) {
    const v = Number(r);
    if (!Number.isNaN(v)) out.push(v);
  }
  return out;
}

/** Format a number for path data — drops trailing zeros for shorter strings. */
function fmt(n: number): string {
  // 4 decimal places is plenty for sub-pixel precision; round to avoid
  // 0.1+0.2 = 0.30000000000000004 ugliness.
  const rounded = Math.round(n * 10000) / 10000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}
