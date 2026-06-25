import { Pipe, type PipeTransform } from '@angular/core';
import type { EllipseNode, LineNode, RectNode, SvgNode } from '@mosaicoo/svg-engine/core';

/**
 * Read-only numeric field accessor for `RectNode` — **display-only**
 * rounding to integer (Bloco 4-Inspector-Polish). Wraps the unsafe
 * cast inside a pipe so the inspector template stays free of `$any()`
 * for the most common geometry fields.
 *
 * **Why round to integer**: market-standard editors (Figma, Affinity)
 * default to whole-pixel display because sub-pixel precision from
 * drag/scale arithmetic (e.g. `496.1125`) is more noise than signal
 * for the typical workflow. The **model** keeps full precision —
 * rounding is presentation-only. If the user edits an input and types
 * `100.5`, the dispatcher writes `100.5` to the model verbatim.
 *
 * Floats with magnitude ≥ 1e15 are returned as-is (rounding wouldn't
 * change them; preserves astronomical edge cases).
 *
 * **Pure pipe**: same input → same output, OnPush-friendly. Returns
 * `undefined` when the node isn't actually a `RectNode` (defensive;
 * the pipe is only used inside `@case ('rect')`).
 */
@Pipe({ name: 'rectField', standalone: true, pure: true })
export class RectFieldPipe implements PipeTransform {
  transform(node: SvgNode, field: keyof RectNode): number | undefined {
    if (node.type !== 'rect') return undefined;
    return roundForDisplay(node[field] as number);
  }
}

/** {@link RectFieldPipe} for `EllipseNode`. */
@Pipe({ name: 'ellipseField', standalone: true, pure: true })
export class EllipseFieldPipe implements PipeTransform {
  transform(node: SvgNode, field: keyof EllipseNode): number | undefined {
    if (node.type !== 'ellipse') return undefined;
    return roundForDisplay(node[field] as number);
  }
}

/** {@link RectFieldPipe} for `LineNode`. */
@Pipe({ name: 'lineField', standalone: true, pure: true })
export class LineFieldPipe implements PipeTransform {
  transform(node: SvgNode, field: keyof LineNode): number | undefined {
    if (node.type !== 'line') return undefined;
    return roundForDisplay(node[field] as number);
  }
}

/**
 * Round a numeric value for inspector display. Integers stay integers;
 * floats round to the nearest integer. Non-finite (NaN, Infinity) and
 * `undefined` pass through (template handles `undefined` as empty).
 *
 * Exported so component-side helpers (e.g. `styleNumber`) can apply
 * the same rounding consistently.
 */
export function roundForDisplay(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value)) return value;
  // Preserve astronomically-large values where rounding would be a no-op.
  if (Math.abs(value) >= 1e15) return value;
  return Math.round(value);
}
