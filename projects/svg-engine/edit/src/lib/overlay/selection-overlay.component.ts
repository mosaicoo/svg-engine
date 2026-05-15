import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { type BoundingBox, EditorStateService } from 'svg-engine/core';
import { ViewportService } from 'svg-engine/render';
import { allAnchors } from '../geometry/bbox-anchors';
import { getCombinedBBox, getRenderedNodeBBox } from '../geometry/node-bbox';
import { SelectionService } from '../selection/selection.service';

/** Pixel size of resize/rotation handles (CSS pixels, kept constant via 1/zoom factor). */
const HANDLE_PX = 8;
/** Distance (in CSS pixels) from the top-center anchor to the rotation handle. */
const ROTATION_HANDLE_GAP_PX = 24;
/** Inner data attribute used by the future TransformService to identify which handle was grabbed. */
const HANDLE_DATA_ATTR = 'data-svge-handle';

/**
 * Visual selection overlay. Renders, **inside the same `<svg>`** as the
 * content (via the renderer's `<ng-content />` slot — D-022 architecture):
 *
 * - Bounding box outline of the focused node (or composite bbox of a
 *   multi-selection).
 * - 8 resize handles (TL/TC/TR/ML/MC/MR/BL/BC/BR) **only for single
 *   selection** in Bloco 2. Multi-selection resize is deferred to Bloco 3.
 * - 1 rotation handle above the top-center anchor.
 * - Light outline of the currently hovered node (when not selected).
 *
 * Bbox computation is **DOM-based** via `SVGGraphicsElement.getBBox()`.
 * This is correct for every node type (including paths and text) without
 * us parsing path data or measuring fonts. We re-measure with
 * `afterEveryRender({ read })` so DOM updates from the renderer are picked up
 * on the next frame.
 *
 * Handle size stays pixel-constant by scaling with `1/viewport.zoom()`.
 * The bbox outline uses `vector-effect="non-scaling-stroke"` for the
 * same reason on stroke width.
 *
 * Usage (inside a `<svge-renderer>`):
 * ```html
 * <svge-renderer [tree]="tree" [viewBox]="viewBox">
 *   <svg:g svgeSelectionOverlay></svg:g>
 * </svge-renderer>
 * ```
 *
 * The component is a no-op when nothing is selected.
 */
@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'g[svgeSelectionOverlay]',
  standalone: true,
  template: `
    @if (hoverBBox(); as h) {
      <svg:rect
        class="hover-outline"
        [attr.x]="h.x"
        [attr.y]="h.y"
        [attr.width]="h.width"
        [attr.height]="h.height"
        fill="none"
      ></svg:rect>
    }

    @if (focusBBox(); as b) {
      <svg:rect
        class="bbox"
        [attr.x]="b.x"
        [attr.y]="b.y"
        [attr.width]="b.width"
        [attr.height]="b.height"
        fill="none"
      ></svg:rect>

      @if (singleSelection()) {
        @for (h of resizeHandles(); track h.anchor) {
          <svg:rect
            class="handle resize"
            [attr.x]="h.x - handleHalf()"
            [attr.y]="h.y - handleHalf()"
            [attr.width]="handleSize()"
            [attr.height]="handleSize()"
            [attr.data-svge-handle]="h.anchor"
            [attr.aria-label]="'Resize ' + h.anchor"
          ></svg:rect>
        }

        @if (rotationHandle(); as r) {
          <svg:line
            class="rotation-stem"
            [attr.x1]="r.stemX1"
            [attr.y1]="r.stemY1"
            [attr.x2]="r.x"
            [attr.y2]="r.y"
          ></svg:line>
          <svg:circle
            class="handle rotation"
            [attr.cx]="r.x"
            [attr.cy]="r.y"
            [attr.r]="handleHalf()"
            [attr.data-svge-handle]="'rotation'"
            aria-label="Rotation"
          ></svg:circle>
        }
      }
    }
  `,
  styles: `
    .bbox,
    .hover-outline {
      stroke: #1976d2;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
    .hover-outline {
      stroke: #90caf9;
      stroke-dasharray: 3 2;
      vector-effect: non-scaling-stroke;
    }
    .handle {
      fill: #ffffff;
      stroke: #1976d2;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      cursor: pointer;
    }
    .handle.resize {
      cursor: grab;
    }
    .handle.rotation {
      cursor: grab;
    }
    .rotation-stem {
      stroke: #1976d2;
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectionOverlay {
  private readonly elRef = inject(ElementRef<SVGGElement>);
  private readonly selection = inject(SelectionService);
  private readonly state = inject(EditorStateService);
  private readonly viewport = inject(ViewportService);

  private readonly _focusBBox = signal<BoundingBox | null>(null);
  private readonly _hoverBBox = signal<BoundingBox | null>(null);

  /** Bounding box of the focused selection (single id) or composite bbox (multi). */
  readonly focusBBox = this._focusBBox.asReadonly();

  /** Bounding box of the hovered node (when not part of the selection). */
  readonly hoverBBox = this._hoverBBox.asReadonly();

  protected readonly singleSelection = this.selection.isSingleSelection;

  /** Handle size in document units (kept constant in screen pixels via 1/zoom). */
  protected readonly handleSize = computed(() => HANDLE_PX / this.viewport.zoom());
  protected readonly handleHalf = computed(() => this.handleSize() / 2);

  protected readonly resizeHandles = computed(() => {
    const b = this._focusBBox();
    if (b === null) return [];
    const a = allAnchors(b);
    // 8 of the 9 anchors — center is for pivot, not a resize handle
    return [
      { anchor: 'tl', ...a.tl },
      { anchor: 'tc', ...a.tc },
      { anchor: 'tr', ...a.tr },
      { anchor: 'ml', ...a.ml },
      { anchor: 'mr', ...a.mr },
      { anchor: 'bl', ...a.bl },
      { anchor: 'bc', ...a.bc },
      { anchor: 'br', ...a.br },
    ] as const;
  });

  protected readonly rotationHandle = computed(() => {
    const b = this._focusBBox();
    if (b === null) return null;
    const tc = allAnchors(b).tc;
    const gap = ROTATION_HANDLE_GAP_PX / this.viewport.zoom();
    return {
      x: tc.x,
      y: tc.y - gap,
      stemX1: tc.x,
      stemY1: tc.y,
    };
  });

  constructor() {
    // After every render, query the DOM for fresh bboxes. We deliberately
    // depend on selection + state.document signals here so any of those
    // changes triggers a re-render that, in turn, re-runs this read.
    afterEveryRender({
      read: () => this.recomputeBBoxes(),
    });
  }

  private recomputeBBoxes(): void {
    const svg = this.elRef.nativeElement.ownerSVGElement;
    if (svg === null) {
      this.maybeSet(this._focusBBox, null);
      this.maybeSet(this._hoverBBox, null);
      return;
    }
    // Establish signal dependencies so a change re-triggers render.
    const ids = this.selection.selectedIds();
    const focus = this.selection.focusId();
    const hover = this.selection.hoverId();
    this.state.document();

    let focusBBox: BoundingBox | null = null;
    if (this.selection.isSingleSelection() && focus !== null) {
      focusBBox = getRenderedNodeBBox(svg, focus);
    } else if (ids.size > 1) {
      focusBBox = getCombinedBBox(svg, ids);
    }
    this.maybeSet(this._focusBBox, focusBBox);

    const hoverBBox = hover !== null && !ids.has(hover) ? getRenderedNodeBBox(svg, hover) : null;
    this.maybeSet(this._hoverBBox, hoverBBox);
  }

  /**
   * Update the signal only if the value actually changed, to avoid
   * triggering an extra render cycle from `afterEveryRender`.
   */
  private maybeSet(
    target: { set(v: BoundingBox | null): void; (): BoundingBox | null },
    next: BoundingBox | null,
  ): void {
    const cur = target();
    if (cur === next) return;
    if (cur !== null && next !== null && bboxesEqual(cur, next)) return;
    target.set(next);
  }
}

function bboxesEqual(a: BoundingBox, b: BoundingBox): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Re-export for convenience: caller may want to reference the data attribute name. */
export { HANDLE_DATA_ATTR };
