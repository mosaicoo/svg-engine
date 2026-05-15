import type { GroupNode } from '../model/group-node';
import type { SvgNode } from '../model/svg-node';
import type { BoundingBox } from '../types/bounding-box';
import type { NodeId } from '../types/node-id';

/**
 * Top-level container for an SVG document being edited. Immutable.
 *
 * Distinct concepts:
 *  - {@link viewBox} — coordinate space mapping (SVG `viewBox` attribute).
 *  - {@link width} / {@link height} — render-time dimensions in pixels
 *    (optional; when omitted the consumer decides).
 *  - {@link root} — the editable tree (rendered as the SVG `<g>` root).
 *  - {@link defs} — reusable definitions (gradients, patterns, symbols).
 *    Modelled separately because they are referenced by `id` and not
 *    part of the rendered tree directly.
 */
export interface SvgDocument {
  readonly id: NodeId;
  readonly viewBox: BoundingBox;
  readonly width?: number;
  readonly height?: number;
  readonly root: GroupNode;
  readonly defs?: readonly SvgNode[];
}
