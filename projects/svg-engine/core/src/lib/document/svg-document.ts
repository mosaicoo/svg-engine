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
  /**
   * **D-072 follow-up — Export preferences for authored names.**
   *
   * When a node carries `metadata.name` (set via the Layers Panel
   * rename or `CreateLayerCommand`'s default `"Layer N"`), the SVG
   * exporter emits a `<title>` child element carrying that name (e.g.
   * `<title>Layer 1</title>`) on that node so it survives export →
   * re-import.
   *
   * **Why `<title>` (W3C spec) instead of `id`/`inkscape:label`**:
   *
   * - Pure SVG spec — zero namespace declarations
   * - Built-in accessibility: screen readers announce `<title>` as
   *   the element's accessible name
   * - Native browser tooltip on hover (in some viewers)
   * - Universally preserved by Inkscape / Illustrator / Figma /
   *   any SVG-aware tool on save
   * - Allows duplicates freely (two nodes named "Logo" → two
   *   `<title>Logo</title>` children, no collision)
   *
   * `id` is NOT emitted from `metadata.name` because in the
   * editor-as-creation-tool flow it's overhead serving minority
   * downstream cases (CSS/JS external refs). Consumers who need
   * stable ids can add a post-export script. `id` is still emitted
   * for paths that are targets of `<textPath href>` (D-068h) — that
   * usage is internal and unconditional.
   *
   * **`emitAuthoredTitles`** defaults to `true` when unset — `??`
   * semantics preserve names for any document that doesn't
   * explicitly opt out. The built-in optimizer
   * `stripAuthoredTitlesOptimizer` (opt-in, `defaultEnabled: false`)
   * flips it to false for minified/production output.
   */
  readonly exportPreferences?: {
    /**
     * Emit `<title>...</title>` child for nodes with `metadata.name`.
     * Default `true`.
     */
    readonly emitAuthoredTitles?: boolean;
    /**
     * **D-082 F9c — Animated SVG (SMIL) export.** When `true`, the SVG
     * exporter injects native SMIL `<animate>` / `<animateTransform>`
     * children into animated nodes (derived from each page's `AnimationDoc`
     * via `animationToSmil`), producing a standalone animated SVG.
     *
     * Default `false` / unset — and this MUST stay the default: the editor's
     * AutoSave round-trips the document through this exporter and recovers by
     * re-importing, so the everyday save path must remain the static SVG (the
     * animation already round-trips losslessly via the `data-svge-animation`
     * JSON attribute, F7). This flag is opt-in, set only by an explicit
     * "Export Animated SVG" action (F9d).
     */
    readonly emitSmilAnimation?: boolean;
  };
}
