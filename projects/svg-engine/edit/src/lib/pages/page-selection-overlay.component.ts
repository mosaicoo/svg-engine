import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { getPageName, getPageViewBox } from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';
import { SelectionService } from '../selection/selection.service';
import { ActivePageService } from './active-page.service';

/**
 * Bracket arm length in CSS pixels — the visible "L" extends this far
 * INWARD from each page corner. 12px reads as a crisp affordance at
 * default zoom without competing with the artboard content.
 */
const BRACKET_ARM_PX = 12;

/**
 * Distance (CSS px) from the page's top edge to the bottom of the
 * floating label. Keeps the label off the artboard so it doesn't
 * obscure content at the top of the page.
 */
const LABEL_OFFSET_PX = 6;

/**
 * Label font size in CSS pixels — matches the rulers / status bar
 * type scale so it reads as part of the editor chrome, not as
 * document content.
 */
const LABEL_FONT_SIZE_PX = 11;

/**
 * Move-handle square side in CSS pixels. Same scale as shape resize
 * handles (8 px) but visually distinct via fill colour — see styles.
 */
const HANDLE_SIZE_PX = 8;

/**
 * Distance (CSS px) from the page's top edge to the move handle's
 * BOTTOM. Sits right next to the label so the user reads them as a
 * unit ("this is the page metadata + drag affordance").
 */
const HANDLE_OFFSET_PX = 18;

/**
 * **PAGES-REFACTOR Fase 2** — visual selection overlay for the active
 * Page node. Renders 4 corner brackets (draw.io / diagrams.net style),
 * a floating page label (`Name — W×H`), and a move handle on top of
 * the page when the active page is selected.
 *
 * **Design goals** (driven by the user's reference image + PAGES-FIX-4
 * post-mortem):
 *
 * - **Distinct from shape selection** — brackets in "L" shape instead
 *   of the 8 quadrilateral handles used for shape resize. Reinforces
 *   that "page" is a different kind of object: it carries
 *   document-level properties (dimensions, background, margins) and
 *   doesn't translate/rotate freely the way shapes do.
 * - **No flicker** — the component is a single `@if` reactive node
 *   tree; when selected, only attribute values update (positions,
 *   text). Angular re-uses the rendered elements (OnPush + signals)
 *   instead of re-mounting them. Replaces the hit-target rect from
 *   PAGES-FIX-4 that was driving the flicker in selection feedback.
 * - **Zoom-stable size** — all visual lengths divide by `viewport.zoom()`
 *   so brackets / label / handle stay at constant CSS-pixel size as
 *   the user zooms the canvas. `vector-effect: non-scaling-stroke`
 *   complements this for the bracket stroke width.
 *
 * **What it does NOT do yet** (intentionally deferred):
 *
 * - Fase 4 will hook pointer events on the brackets / label area to
 *   make them clickable selection targets (replacing the renderer
 *   hit-target rect introduced in PAGES-FIX-4).
 * - Fase 6 will turn corner brackets into resize handles and wire
 *   the move handle to a position-update command.
 *
 * Today (Fase 2) the overlay is **visual only** (`pointer-events: none`
 * on all elements) — clicks pass straight through to the existing
 * hit-target rect. Selection works via the PAGES-FIX-4 path; this
 * component just paints a better-looking handle set.
 *
 * **Projection** (same pattern as `<svge-selection-overlay>` / D-022):
 * project as the LAST `<svg:g>` child of `<svge-renderer>` so it paints
 * on top of all document content. The renderer's `<ng-content />`
 * preserves projection order.
 *
 * ```html
 * <svge-renderer [tree]="tree()" [viewBox]="viewBox()">
 *   <svg:g svgePageOverlay svgeBehind></svg:g>
 *   <svg:g svgeGridOverlay svgeBehind></svg:g>
 *   <svg:g svgeSelectionOverlay></svg:g>
 *   <svg:g svgePageSelectionOverlay></svg:g>
 * </svge-renderer>
 * ```
 *
 * **No-op** when there is no active page OR the active page isn't
 * selected — zero footprint at the default scope.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgePageSelectionOverlay]',
  standalone: true,
  host: { 'aria-hidden': 'true' },
  template: `
    @if (overlay(); as o) {
      <!--
        Floating label above the page's top-left corner. Format:
        "Page 1 — 800×600" (per the answered user preference).
        text-anchor=start so the label aligns with the bracket TL.
        Font size and y-offset compensate for zoom so the label stays
        at constant CSS-pixel size across the zoom range.
      -->
      <svg:text
        class="page-label"
        [attr.x]="o.x"
        [attr.y]="o.y - labelOffsetDoc()"
        [attr.font-size]="labelFontSizeDoc() + 'px'"
        text-anchor="start"
      >
        {{ o.label }}
      </svg:text>

      <!--
        Top-center move handle. Sits between the label and the page's
        top edge — close enough to the label that they read as one
        UI group ("page metadata + drag handle"). The handle is a
        small square with a distinctive blue fill so it doesn't get
        confused with shape resize handles (which have a white fill).
      -->
      <svg:rect
        class="page-move-handle"
        [attr.x]="o.x + o.width / 2 - handleHalfDoc()"
        [attr.y]="o.y - handleOffsetDoc()"
        [attr.width]="handleSizeDoc()"
        [attr.height]="handleSizeDoc()"
      ></svg:rect>

      <!--
        4 corner brackets — draw.io style "L" marks at each corner of
        the page's viewBox. Path of 3 vertices (M start, L corner,
        L end) draws the bracket as a single open polyline; the
        rounded join + non-scaling-stroke give it a clean look at
        any zoom. Arms extend INWARD from the corner so the bracket
        wraps the artboard rather than poking out.
      -->
      <svg:path class="page-bracket" [attr.d]="bracketTL(o)"></svg:path>
      <svg:path class="page-bracket" [attr.d]="bracketTR(o)"></svg:path>
      <svg:path class="page-bracket" [attr.d]="bracketBL(o)"></svg:path>
      <svg:path class="page-bracket" [attr.d]="bracketBR(o)"></svg:path>
    }
  `,
  styles: `
    .page-label {
      fill: var(--svge-page-overlay-stroke, #1976d2);
      font-family:
        system-ui,
        -apple-system,
        sans-serif;
      font-weight: 500;
      pointer-events: none;
      user-select: none;
    }
    .page-bracket {
      fill: none;
      stroke: var(--svge-page-overlay-stroke, #1976d2);
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    .page-move-handle {
      fill: var(--svge-page-overlay-stroke, #1976d2);
      stroke: var(--svge-page-overlay-handle-stroke, #ffffff);
      stroke-width: 1.5;
      vector-effect: non-scaling-stroke;
      /*
       * pointer-events stays none for Fase 2 (visual only). Fase 6
       * flips this to "all" + wires onPointerDown to a page-move
       * command + cursor: move.
       */
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SvgePageSelectionOverlay {
  private readonly activePage = inject(ActivePageService);
  private readonly selection = inject(SelectionService);
  private readonly viewport = inject(ViewportService);

  /**
   * All visual sizes are doc-unit values derived from CSS-pixel
   * constants divided by current zoom. Keeping the conversion in
   * one `computed` per dimension makes the template render path
   * trivial (single multiplication / sum per attribute) and avoids
   * re-computing zoom for every element.
   */
  protected readonly handleSizeDoc = computed(() => HANDLE_SIZE_PX / this.viewport.zoom());
  protected readonly handleHalfDoc = computed(() => this.handleSizeDoc() / 2);
  protected readonly handleOffsetDoc = computed(() => HANDLE_OFFSET_PX / this.viewport.zoom());
  protected readonly labelOffsetDoc = computed(() => LABEL_OFFSET_PX / this.viewport.zoom());
  protected readonly labelFontSizeDoc = computed(() => LABEL_FONT_SIZE_PX / this.viewport.zoom());
  protected readonly bracketArmDoc = computed(() => BRACKET_ARM_PX / this.viewport.zoom());

  /**
   * Source of truth for the overlay. `null` when:
   * - no page is active in the editor scope, OR
   * - the active page is not the current selection.
   *
   * Both branches short-circuit the template's `@if (overlay())` so
   * the overlay literally renders nothing — zero DOM cost, zero
   * flicker risk.
   */
  protected readonly overlay = computed(() => {
    const page = this.activePage.activePage();
    if (page === null) return null;
    if (!this.selection.isSelected(page.id)) return null;
    const vb = getPageViewBox(page);
    if (vb === null) return null;
    const name = getPageName(page);
    // Format per answered preference: "Page 1 — 800×600". Uses em-
    // dash + the multiplication sign (not lowercase x) — matches the
    // dimensions shown in the Inspector Page tab + reads cleaner.
    const label = `${name} — ${this.formatDim(vb.width)}×${this.formatDim(vb.height)}`;
    return {
      x: vb.x,
      y: vb.y,
      width: vb.width,
      height: vb.height,
      label,
    };
  });

  /**
   * Format a dimension as an integer when it's a clean number,
   * otherwise round to 1 decimal. Avoids "800.000000001" noise
   * from float arithmetic without showing useless ".0" suffixes
   * for round dimensions.
   */
  private formatDim(value: number): string {
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(1);
  }

  /** Top-left bracket path: vertical arm down + horizontal arm right. */
  protected bracketTL(o: { x: number; y: number }): string {
    const L = this.bracketArmDoc();
    return `M${o.x},${o.y + L} L${o.x},${o.y} L${o.x + L},${o.y}`;
  }

  /** Top-right bracket path: horizontal arm left + vertical arm down. */
  protected bracketTR(o: { x: number; y: number; width: number }): string {
    const L = this.bracketArmDoc();
    const x2 = o.x + o.width;
    return `M${x2 - L},${o.y} L${x2},${o.y} L${x2},${o.y + L}`;
  }

  /** Bottom-left bracket path: vertical arm up + horizontal arm right. */
  protected bracketBL(o: { x: number; y: number; height: number }): string {
    const L = this.bracketArmDoc();
    const y2 = o.y + o.height;
    return `M${o.x},${y2 - L} L${o.x},${y2} L${o.x + L},${y2}`;
  }

  /** Bottom-right bracket path: horizontal arm left + vertical arm up. */
  protected bracketBR(o: { x: number; y: number; width: number; height: number }): string {
    const L = this.bracketArmDoc();
    const x2 = o.x + o.width;
    const y2 = o.y + o.height;
    return `M${x2 - L},${y2} L${x2},${y2} L${x2},${y2 - L}`;
  }
}
