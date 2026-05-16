import { Pipe, type PipeTransform } from '@angular/core';
import type { EllipseNode, LineNode, RectNode, SvgNode } from 'svg-engine/core';

/**
 * Read-only numeric field accessor for `RectNode`. Wraps the unsafe
 * cast inside a pipe so the inspector template stays free of `$any()`
 * for the most common geometry fields.
 *
 * **Pure pipe**: same input → same output, OnPush-friendly. Returns
 * `undefined` when the node isn't actually a `RectNode` (the pipe is
 * only used inside `@case ('rect')` so this is mostly defensive).
 */
@Pipe({ name: 'rectField', standalone: true, pure: true })
export class RectFieldPipe implements PipeTransform {
  transform(node: SvgNode, field: keyof RectNode): number | undefined {
    return node.type === 'rect' ? (node[field] as number) : undefined;
  }
}

/** {@link RectFieldPipe} for `EllipseNode`. */
@Pipe({ name: 'ellipseField', standalone: true, pure: true })
export class EllipseFieldPipe implements PipeTransform {
  transform(node: SvgNode, field: keyof EllipseNode): number | undefined {
    return node.type === 'ellipse' ? (node[field] as number) : undefined;
  }
}

/** {@link RectFieldPipe} for `LineNode`. */
@Pipe({ name: 'lineField', standalone: true, pure: true })
export class LineFieldPipe implements PipeTransform {
  transform(node: SvgNode, field: keyof LineNode): number | undefined {
    return node.type === 'line' ? (node[field] as number) : undefined;
  }
}
