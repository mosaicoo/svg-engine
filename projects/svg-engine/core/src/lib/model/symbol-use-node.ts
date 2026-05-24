import type { SvgNodeBase } from './svg-node-base';

/**
 * **D-059** — Reusable symbol instance node. Maps to SVG `<use>`.
 *
 * A `SymbolUseNode` does not own its geometry — it REFERENCES a
 * symbol master registered in `SymbolLibraryService` (and emitted in
 * `<defs>` as `<symbol id="{symbolId}">...</symbol>` by the active-defs
 * pipeline). The browser paints the symbol's contents at the
 * instance's `(x, y)` position, scaled to `(width, height)` when set.
 *
 * **Why a dedicated node type** (vs cloning the master tree on insert):
 * editing the symbol master should **propagate to every instance**
 * automatically. A clone-based approach breaks that link — once
 * inserted, an instance is just a regular tree, indistinguishable
 * from the master. With a `<use>` reference, the browser re-paints
 * every `<use>` when the referenced `<symbol>` content changes, so a
 * single edit to the master updates 1000 instances at zero per-instance
 * cost.
 *
 * **Coordinate convention**:
 * - `(x, y)` — top-left corner of the symbol's content box in the
 *   document coordinate system (after applying `transform`).
 * - `width`/`height` — when both set, the symbol stretches to fit
 *   the rectangle (`preserveAspectRatio="xMidYMid meet"` is the SVG
 *   default; the user can override via metadata if needed).
 *   When omitted, the symbol renders at its master's natural size
 *   (from the `<symbol>`'s own `viewBox`, or 100×100 when neither is
 *   set — the SVG spec default).
 *
 * **`<use>` quirks** (documented so consumers don't trip):
 * - The browser treats the `<use>` as a "shadow tree" — most CSS
 *   selectors don't reach inside. Style fields on `SymbolUseNode`
 *   (`fill`, `stroke`, etc.) propagate via CSS inheritance to elements
 *   inside the master that don't already specify those fields.
 *   Override the master's `style` to break the inheritance.
 * - Filters/effects on the instance apply to the rendered output
 *   (after the master is expanded), so you can blur/glow/etc. a
 *   single instance without affecting siblings.
 *
 * **Round-trip**: importer should recognize `<use href="#id">` and
 * construct a `SymbolUseNode`. v1 of D-059 ships with exporter
 * support; importer enhancement deferred to a future iteration (the
 * importer currently strips `<use>` — falls back to "missing symbol"
 * which the renderer paints as empty space).
 */
export interface SymbolUseNode extends SvgNodeBase {
  readonly type: 'symbol-use';
  /**
   * Id of the symbol master in `SymbolLibraryService`. Renderer emits
   * `<use href="#{symbolId}">`. Catalog miss = renders as empty space
   * (no error — defensive against deletions during edits).
   */
  readonly symbolId: string;
  /** Top-left x in document coords (before this node's transform). */
  readonly x: number;
  /** Top-left y in document coords. */
  readonly y: number;
  /**
   * Optional width — stretches the symbol horizontally. When omitted,
   * uses the master's natural width (from the `<symbol viewBox>`).
   */
  readonly width?: number;
  /** Optional height — same semantics as `width`. */
  readonly height?: number;
}
