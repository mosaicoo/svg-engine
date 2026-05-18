import type { GroupNode } from '../model/group-node';
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
 *  - {@link defs} — reusable definitions block (gradients, patterns,
 *    clipPaths, filters, masks, symbols, markers) kept as **opaque,
 *    sanitized XML fragment** so the editor preserves them round-trip
 *    without modelling each definition type as a first-class node.
 *    The fragment is the literal content WITHIN the original `<defs>`
 *    element (no enclosing `<defs>` tags). When non-empty, the
 *    exporter wraps it in `<defs>...</defs>` and the renderer injects
 *    it as the first child of `<svg>` so `url(#id)` references from
 *    nodes resolve correctly. Sanitization rules (drop `<script>`,
 *    `on*` event handlers, `javascript:` hrefs) apply at import time.
 */
export interface SvgDocument {
  readonly id: NodeId;
  readonly viewBox: BoundingBox;
  readonly width?: number;
  readonly height?: number;
  readonly root: GroupNode;
  readonly defs?: string;
}
